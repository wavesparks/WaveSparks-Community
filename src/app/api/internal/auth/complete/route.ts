import { NextRequest } from "next/server";

import { getAuthCompletionViewerContext } from "@/lib/auth";
import { hasPotentialClerkSessionCookie } from "@/lib/clerk-cookies";
import { canAccessFeed } from "@/server/permissions";

function completionTarget(slug: string, context: Awaited<ReturnType<typeof getAuthCompletionViewerContext>>) {
  if (context.status !== "authenticated") {
    return null;
  }

  const { viewer } = context;

  if (context.state === "inactive") {
    return `/org/${slug}/pending?state=inactive`;
  }

  if (context.state === "ready" || canAccessFeed(viewer.membership, viewer.profile)) {
    return `/org/${slug}/feed`;
  }

  if (viewer.membership.status === "approved") {
    return `/org/${slug}/onboarding`;
  }

  return `/org/${slug}/pending`;
}

function clerkSessionTokenFromAuthorization(header: string | null) {
  const match = /^Bearer\s+(.+)$/i.exec(header?.trim() ?? "");
  return match?.[1]?.trim() || undefined;
}

function logAuthCompleteDenied(
  reason: string,
  details: Record<string, boolean | string | undefined>,
) {
  console.warn("auth_complete_denied", {
    ...details,
    reason,
  });
}

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("orgSlug")?.trim() || "wavespark";
  const hasClerkCookie = hasPotentialClerkSessionCookie(request.cookies.getAll());
  const clerkSessionToken = clerkSessionTokenFromAuthorization(
    request.headers.get("authorization"),
  );

  if (!hasClerkCookie && !clerkSessionToken) {
    logAuthCompleteDenied("missing_credentials", {
      hasBearer: false,
      hasClerkCookie: false,
      slug,
    });
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const context = await getAuthCompletionViewerContext(slug, {
    clerkSessionToken,
  });

  if (context.status === "not_found") {
    return Response.json({ error: "Organization not found." }, { status: 404 });
  }

  if (context.status === "forbidden") {
    logAuthCompleteDenied("no_local_membership", {
      hasBearer: Boolean(clerkSessionToken),
      hasClerkCookie,
      slug,
    });
    return Response.json(
      { error: "This account does not have a Wavespark invitation." },
      { status: 403 },
    );
  }

  const target = completionTarget(slug, context);

  if (!target) {
    logAuthCompleteDenied("no_completion_target", {
      contextStatus: context.status,
      hasBearer: Boolean(clerkSessionToken),
      hasClerkCookie,
      slug,
    });
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  return Response.json({
    clerkOrgId: context.status === "authenticated" ? context.clerkOrgId : undefined,
    state: context.status === "authenticated" ? context.state : undefined,
    target,
  });
}
