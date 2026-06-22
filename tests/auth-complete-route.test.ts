import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const getAuthCompletionViewerContextMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  getAuthCompletionViewerContext: getAuthCompletionViewerContextMock,
}));

import { GET } from "@/app/api/internal/auth/complete/route";

describe("auth completion route", () => {
  it("rejects requests without Clerk credentials before resolving viewer context", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/internal/auth/complete?orgSlug=wavespark"),
    );

    expect(response.status).toBe(401);
    expect(getAuthCompletionViewerContextMock).not.toHaveBeenCalled();
  });
});
