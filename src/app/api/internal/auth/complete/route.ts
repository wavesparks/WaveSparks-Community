import { NextRequest } from "next/server";

import { getAuthCompletionViewerContext } from "@/lib/auth";
import { hasPotentialClerkSessionCookie } from "@/lib/clerk-cookies";
import { canAccessFeed } from "@/server/permissions";

function completionTarget(slug: string, context: Awaited<ReturnType<typeof getAuthCompletionViewerContext>>) {
  if (context.status !== "authenticated") {
    return null;
  }

  const { viewer } = context;

  if (canAccessFeed(viewer.membership, viewer.profile)) {
    return `/org/${slug}/feed`;
  }

  if (viewer.membership.status === "approved") {
    return `/org/${slug}/onboarding`;
  }

  return `/org/${slug}/pending`;
}

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("orgSlug")?.trim() || "wavespark";
  const hasClerkCookie = hasPotentialClerkSessionCookie(request.cookies.getAll());
  const hasAuthorization = Boolean(request.headers.get("authorization")?.trim());

  if (!hasClerkCookie && !hasAuthorization) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const context = await getAuthCompletionViewerContext(slug);

  if (context.status === "not_found") {
    return Response.json({ error: "Organization not found." }, { status: 404 });
  }

  const target = completionTarget(slug, context);

  if (!target) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  return Response.json({ target });
}
