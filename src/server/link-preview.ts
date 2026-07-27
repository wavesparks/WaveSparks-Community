import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { BlockList, isIP } from "node:net";
import { request as httpsRequest } from "node:https";

import { load } from "cheerio";

import { supportedPostImageFormat } from "@/server/post-image-processing";

const HTML_LIMIT_BYTES = 512 * 1024;
const IMAGE_LIMIT_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 4_000;
const MAX_REDIRECTS = 3;
const PREVIEW_USER_AGENT = "WavesparksLinkPreview/1.0";

const blockedAddresses = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv4");
}
blockedAddresses.addAddress("::", "ipv6");
blockedAddresses.addAddress("::1", "ipv6");
for (const [network, prefix] of [
  ["64:ff9b::", 96],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv6");
}

export interface LinkPreviewImage {
  bytes: Uint8Array;
  contentType: "image/webp";
  width: number;
  height: number;
}

export interface ResolvedLinkPreview {
  originalUrl: string;
  finalUrl: string;
  title?: string;
  description?: string;
  siteName: string;
  image?: LinkPreviewImage;
}

interface PinnedResponse {
  status: number;
  headers: Headers;
  bytes: Uint8Array;
  finalUrl: URL;
}

function normalizedHttpUrl(rawValue: string, base?: URL) {
  const raw = rawValue.trim();
  const withProtocol = !base && /^www\./i.test(raw) ? `https://${raw}` : raw;
  let url: URL;
  try {
    url = base ? new URL(withProtocol, base) : new URL(withProtocol);
  } catch {
    throw new Error("Enter a valid web address.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS links can be previewed.");
  }
  if (url.username || url.password) {
    throw new Error("Links containing credentials cannot be previewed.");
  }
  const expectedPort = url.protocol === "http:" ? "80" : "443";
  if (url.port && url.port !== expectedPort) {
    throw new Error("Links using non-standard ports cannot be previewed.");
  }
  if (!url.hostname || isIP(url.hostname.replace(/^\[|\]$/g, ""))) {
    throw new Error("Direct IP addresses cannot be previewed.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "metadata.google.internal"
  ) {
    throw new Error("Local network addresses cannot be previewed.");
  }
  url.hash = "";
  return url;
}

export function normalizePreviewUrl(rawValue: string) {
  return normalizedHttpUrl(rawValue).toString();
}

function isBlockedAddress(address: string, family: number) {
  if (family === 4) return blockedAddresses.check(address, "ipv4");
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return blockedAddresses.check(mapped[1], "ipv4");
  return blockedAddresses.check(address, "ipv6");
}

async function resolvePublicAddress(hostname: string, deadline: number) {
  const timeout = deadline - Date.now();
  if (timeout <= 0) throw new Error("The link preview request timed out.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("The link preview request timed out.")),
      timeout,
    );
  });
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }) as Promise<
        Array<{ address: string; family: number }>
      >,
      timeoutPromise,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!addresses.length) throw new Error("The link host could not be resolved.");
  if (addresses.some(({ address, family }) => isBlockedAddress(address, family))) {
    throw new Error("Local or private network addresses cannot be previewed.");
  }
  return addresses[0];
}

async function requestOnce(url: URL, maxBytes: number, deadline: number) {
  const address = await resolvePublicAddress(url.hostname, deadline);
  const timeout = deadline - Date.now();
  if (timeout <= 0) {
    throw new Error("The link preview request timed out.");
  }

  return new Promise<{
    status: number;
    headers: Headers;
    bytes: Uint8Array;
  }>((resolve, reject) => {
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadlineTimer);
      reject(error);
    };
    const succeed = (value: {
      status: number;
      headers: Headers;
      bytes: Uint8Array;
    }) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadlineTimer);
      resolve(value);
    };
    const request = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = request(
      {
        protocol: url.protocol,
        hostname: address.address,
        family: address.family,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        method: "GET",
        path: `${url.pathname}${url.search}`,
        servername: url.protocol === "https:" ? url.hostname : undefined,
        rejectUnauthorized: true,
        headers: {
          Accept: "text/html,application/xhtml+xml,image/avif,image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.1",
          "Accept-Encoding": "identity",
          Host: url.host,
          "User-Agent": PREVIEW_USER_AGENT,
        },
      },
      (response) => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) {
            value.forEach((entry) => headers.append(name, entry));
          } else if (value !== undefined) {
            headers.set(name, String(value));
          }
        }
        const contentLength = Number(headers.get("content-length") ?? 0);
        if (Number.isFinite(contentLength) && contentLength > maxBytes) {
          response.destroy();
          fail(new Error("The preview response is too large."));
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        response.on("data", (chunk: Buffer | Uint8Array) => {
          total += chunk.byteLength;
          if (total > maxBytes) {
            response.destroy();
            fail(new Error("The preview response is too large."));
            return;
          }
          chunks.push(Buffer.from(chunk));
        });
        response.on("end", () => {
          succeed({
            status: response.statusCode ?? 0,
            headers,
            bytes: Buffer.concat(chunks),
          });
        });
        response.on("error", fail);
      },
    );
    const deadlineTimer = setTimeout(
      () => req.destroy(new Error("The link preview request timed out.")),
      timeout,
    );
    req.on("error", fail);
    req.end();
  });
}

async function fetchPinned(
  initialUrl: URL,
  maxBytes: number,
  deadline: number,
): Promise<PinnedResponse> {
  let url = initialUrl;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    // Re-parse and re-resolve on every hop. The request itself is pinned to that
    // validated address, preventing a second DNS lookup from rebinding locally.
    url = normalizedHttpUrl(url.toString());
    const response = await requestOnce(url, maxBytes, deadline);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The preview redirect is missing a destination.");
      if (redirectCount === MAX_REDIRECTS) {
        throw new Error("The link redirected too many times.");
      }
      url = normalizedHttpUrl(location, url);
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error("The link did not return a previewable page.");
    }
    return { ...response, finalUrl: url };
  }
  throw new Error("The link redirected too many times.");
}

function compactText(value: string | undefined, maxLength: number) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

async function fetchPreviewImage(rawUrl: string, base: URL, deadline: number) {
  const url = normalizedHttpUrl(rawUrl, base);
  const response = await fetchPinned(url, IMAGE_LIMIT_BYTES, deadline);
  const declaredType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (!declaredType || !["image/jpeg", "image/png", "image/webp"].includes(declaredType)) {
    throw new Error("The preview thumbnail is not an image.");
  }
  const detectedFormat = supportedPostImageFormat(response.bytes);
  if (!detectedFormat) throw new Error("The preview thumbnail format is unsupported.");
  const { default: sharp } = await import("sharp");
  const pipeline = sharp(response.bytes, {
    animated: false,
    failOn: "warning",
    limitInputPixels: 20_000_000,
  });
  const metadata = await pipeline.metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.format !== detectedFormat ||
    (metadata.pages ?? 1) > 1
  ) {
    throw new Error("The preview thumbnail format is unsupported.");
  }
  const { data, info } = await pipeline
    .rotate()
    .resize({ width: 1200, height: 630, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  if (data.byteLength > IMAGE_LIMIT_BYTES) {
    throw new Error("The processed preview thumbnail is too large.");
  }
  return {
    bytes: new Uint8Array(data),
    contentType: "image/webp" as const,
    width: info.width,
    height: info.height,
  };
}

export async function resolveLinkPreview(rawUrl: string): Promise<ResolvedLinkPreview> {
  const originalUrl = normalizePreviewUrl(rawUrl);
  if (process.env.LINK_PREVIEW_RESOLVER === "fixed") {
    const isolated =
      process.env.E2E_LOCAL_AUTH_ENABLED === "1" &&
      !process.env.DATABASE_URL &&
      !process.env.VERCEL;
    if (!isolated) {
      throw new Error("The fixed preview resolver is restricted to isolated local E2E runs.");
    }
    const url = new URL(originalUrl);
    return {
      originalUrl,
      finalUrl: originalUrl,
      title: `Preview for ${url.hostname}`,
      description: "Deterministic local test preview.",
      siteName: url.hostname.replace(/^www\./i, ""),
    };
  }
  const deadline = Date.now() + FETCH_TIMEOUT_MS;
  const response = await fetchPinned(new URL(originalUrl), HTML_LIMIT_BYTES, deadline);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("text/html") && !contentType.startsWith("application/xhtml+xml")) {
    throw new Error("The link does not point to an HTML page.");
  }

  const $ = load(Buffer.from(response.bytes).toString("utf8"));
  const meta = (selector: string) => compactText($(selector).first().attr("content"), 500);
  const title = compactText(
    meta('meta[property="og:title"]') ??
      meta('meta[name="twitter:title"]') ??
      $("title").first().text(),
    240,
  );
  const description = compactText(
    meta('meta[property="og:description"]') ?? meta('meta[name="description"]'),
    500,
  );
  const siteName =
    compactText(meta('meta[property="og:site_name"]'), 120) ??
    response.finalUrl.hostname.replace(/^www\./i, "");
  const imageUrl =
    meta('meta[property="og:image:secure_url"]') ??
    meta('meta[property="og:image"]') ??
    meta('meta[name="twitter:image"]');

  let image: LinkPreviewImage | undefined;
  if (imageUrl) {
    try {
      image = await fetchPreviewImage(imageUrl, response.finalUrl, deadline);
    } catch {
      // A broken or unsafe thumbnail never prevents the URL itself from being useful.
    }
  }

  return {
    originalUrl,
    finalUrl: response.finalUrl.toString(),
    title,
    description,
    siteName,
    image,
  };
}
