import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const networkMocks = vi.hoisted(() => ({
  httpRequest: vi.fn(),
  httpsRequest: vi.fn(),
  lookup: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  default: { lookup: networkMocks.lookup },
  lookup: networkMocks.lookup,
}));
vi.mock("node:http", () => ({
  default: { request: networkMocks.httpRequest },
  request: networkMocks.httpRequest,
}));
vi.mock("node:https", () => ({
  default: { request: networkMocks.httpsRequest },
  request: networkMocks.httpsRequest,
}));

import { normalizePreviewUrl, resolveLinkPreview } from "@/server/link-preview";

interface FakeResponseOptions {
  body?: Uint8Array;
  headers?: Record<string, string>;
  status: number;
}

function installHttpResponse(options: FakeResponseOptions) {
  networkMocks.httpRequest.mockImplementation(
    (
      _requestOptions: unknown,
      onResponse: (response: EventEmitter & {
        destroy(error?: Error): void;
        headers: Record<string, string>;
        statusCode: number;
      }) => void,
    ) => {
      const request = new EventEmitter() as EventEmitter & {
        destroy(error?: Error): void;
        end(): void;
        setTimeout(timeout: number, callback: () => void): void;
      };
      const response = new EventEmitter() as EventEmitter & {
        destroy(error?: Error): void;
        headers: Record<string, string>;
        statusCode: number;
      };
      let responseDestroyed = false;
      response.statusCode = options.status;
      response.headers = options.headers ?? {};
      response.destroy = (error?: Error) => {
        responseDestroyed = true;
        if (error) queueMicrotask(() => response.emit("error", error));
      };
      request.setTimeout = vi.fn();
      request.destroy = (error?: Error) => {
        if (error) queueMicrotask(() => request.emit("error", error));
      };
      request.end = () => {
        queueMicrotask(() => {
          onResponse(response);
          queueMicrotask(() => {
            if (options.body?.byteLength) response.emit("data", options.body);
            queueMicrotask(() => {
              if (!responseDestroyed) response.emit("end");
            });
          });
        });
      };
      return request;
    },
  );
}

describe("link preview SSRF validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.LINK_PREVIEW_RESOLVER;
    delete process.env.E2E_LOCAL_AUTH_ENABLED;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("normalizes only credential-free HTTP(S) URLs on standard ports", () => {
    expect(normalizePreviewUrl("www.example.com/path#private-fragment")).toBe(
      "https://www.example.com/path",
    );
    expect(normalizePreviewUrl("http://example.com:80/path")).toBe(
      "http://example.com/path",
    );
    expect(normalizePreviewUrl("https://example.com:443/path")).toBe(
      "https://example.com/path",
    );

    for (const unsafe of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "ftp://example.com/file",
      "https://user:password@example.com/",
      "http://example.com:8080/",
    ]) {
      expect(() => normalizePreviewUrl(unsafe), unsafe).toThrow();
    }
  });

  it("rejects literal, alternate-notation, and local hostnames before DNS", () => {
    for (const unsafe of [
      "http://127.0.0.1/",
      "http://2130706433/",
      "http://0x7f000001/",
      "http://[::1]/",
      "http://localhost./",
      "http://service.local/",
      "http://service.internal/",
      "http://metadata.google.internal/computeMetadata/v1/",
    ]) {
      expect(() => normalizePreviewUrl(unsafe), unsafe).toThrow();
    }
    expect(networkMocks.lookup).not.toHaveBeenCalled();
  });

  it.each([
    ["private IPv4", [{ address: "10.42.0.7", family: 4 }]],
    ["loopback IPv4", [{ address: "127.0.0.1", family: 4 }]],
    ["link-local metadata IPv4", [{ address: "169.254.169.254", family: 4 }]],
    ["unique-local IPv6", [{ address: "fd00::1234", family: 6 }]],
    ["link-local IPv6", [{ address: "fe80::1", family: 6 }]],
    ["IPv4-mapped loopback", [{ address: "::ffff:127.0.0.1", family: 6 }]],
    ["hexadecimal IPv4-mapped loopback", [{ address: "::ffff:7f00:1", family: 6 }]],
    [
      "mixed public/private answers",
      [
        { address: "93.184.216.34", family: 4 },
        { address: "192.168.1.20", family: 4 },
      ],
    ],
  ])("blocks %s DNS answers before opening a socket", async (_label, addresses) => {
    networkMocks.lookup.mockResolvedValueOnce(addresses);

    await expect(resolveLinkPreview("http://preview.example/page")).rejects.toThrow(
      "Local or private network addresses cannot be previewed.",
    );
    expect(networkMocks.httpRequest).not.toHaveBeenCalled();
  });

  it("revalidates and blocks a private destination on every redirect", async () => {
    networkMocks.lookup
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    installHttpResponse({
      status: 302,
      headers: { location: "http://private-after-redirect.example/secret" },
    });

    await expect(resolveLinkPreview("http://public.example/start")).rejects.toThrow(
      "Local or private network addresses cannot be previewed.",
    );
    expect(networkMocks.lookup).toHaveBeenCalledTimes(2);
    expect(networkMocks.httpRequest).toHaveBeenCalledTimes(1);
  });

  it("stops after three redirects", async () => {
    networkMocks.lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ]);
    installHttpResponse({ status: 302, headers: { location: "/next" } });

    await expect(resolveLinkPreview("http://public.example/start")).rejects.toThrow(
      "The link redirected too many times.",
    );
    expect(networkMocks.lookup).toHaveBeenCalledTimes(4);
    expect(networkMocks.httpRequest).toHaveBeenCalledTimes(4);
  });

  it("rejects an HTML response declared over the 512 KB cap", async () => {
    networkMocks.lookup.mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
    ]);
    installHttpResponse({
      status: 200,
      headers: {
        "content-length": String(512 * 1024 + 1),
        "content-type": "text/html; charset=utf-8",
      },
    });

    await expect(resolveLinkPreview("http://public.example/huge")).rejects.toThrow(
      "The preview response is too large.",
    );
  });

  it("rejects an HTML response that streams past the 512 KB cap", async () => {
    networkMocks.lookup.mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
    ]);
    installHttpResponse({
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: new Uint8Array(512 * 1024 + 1),
    });

    await expect(resolveLinkPreview("http://public.example/streaming")).rejects.toThrow(
      "The preview response is too large.",
    );
  });

  it("enforces the four-second wall-clock deadline even without a socket timeout", async () => {
    vi.useFakeTimers();
    networkMocks.lookup.mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
    ]);
    networkMocks.httpRequest.mockImplementation(() => {
      const request = new EventEmitter() as EventEmitter & {
        destroy(error?: Error): void;
        end(): void;
        setTimeout(timeout: number, callback: () => void): void;
      };
      request.setTimeout = vi.fn();
      request.end = vi.fn();
      request.destroy = (error?: Error) => {
        if (error) queueMicrotask(() => request.emit("error", error));
      };
      return request;
    });

    const preview = resolveLinkPreview("http://public.example/slow");
    const rejected = expect(preview).rejects.toThrow(
      "The link preview request timed out.",
    );
    await vi.advanceTimersByTimeAsync(4_001);

    await rejected;
  });
});
