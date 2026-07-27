import { getCurrentAuthIdentity } from "@/lib/auth-identity";
import { env } from "@/lib/env";
import {
  getOrganizationBySlug,
  getSpaceById,
  recomputeMatchesForAllOrganizations,
  recomputeMatchesForSpace,
  getViewerRecordByEmailAndSlug,
  recomputeMatchesForOrg,
} from "@/server/store";
import { canViewAdminRoute } from "@/server/permissions";

async function handleRecompute(request: Request) {
  const body = request.method === "POST"
    ? ((await request.json().catch(() => ({}))) as { orgSlug?: string; spaceId?: string })
    : {};
  const requestUrl = new URL(request.url);
  const requestedOrgSlug = body.orgSlug ?? requestUrl.searchParams.get("orgSlug") ?? undefined;
  const spaceId = body.spaceId ?? requestUrl.searchParams.get("spaceId") ?? undefined;

  const authorizedBySecret =
    env.cronSecret &&
    (request.headers.get("x-cron-secret") === env.cronSecret ||
      request.headers.get("authorization") === `Bearer ${env.cronSecret}`);

  // Vercel Cron invokes this route with GET. GET mutations must never fall
  // back to cookie/session authorization because top-level cross-site
  // navigations can carry SameSite=Lax cookies. Interactive admins use POST.
  if (request.method === "GET" && !authorizedBySecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.method === "GET" && authorizedBySecret && !requestedOrgSlug && !spaceId) {
    const result = await recomputeMatchesForAllOrganizations();
    return Response.json({
      ok: result.failedSpaceCount === 0,
      count: result.matchCount,
      failedSpaceCount: result.failedSpaceCount,
      organizationCount: result.organizationCount,
      organizations: result.organizations,
      spaceId: null,
    }, { status: result.failedSpaceCount ? 500 : 200 });
  }

  const orgSlug = requestedOrgSlug ?? "wavesparks";
  const org = await getOrganizationBySlug(orgSlug);

  if (!org) {
    return Response.json({ error: "Organization not found" }, { status: 404 });
  }

  if (!authorizedBySecret) {
    const identity = await getCurrentAuthIdentity();
    const viewerRecord = identity
      ? await getViewerRecordByEmailAndSlug(orgSlug, identity.email)
      : undefined;
    const user = viewerRecord?.user;
    const membership = viewerRecord?.membership;

    if (!user || !membership || !canViewAdminRoute(user, membership)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (spaceId) {
    const space = await getSpaceById(spaceId);
    if (!space || space.orgId !== org.id) {
      return Response.json({ error: "Space not found" }, { status: 404 });
    }
    const matches = await recomputeMatchesForSpace(space.id);
    return Response.json({ ok: true, count: matches.length, spaceId: space.id });
  }

  const matches = await recomputeMatchesForOrg(org.id);
  return Response.json({ ok: true, count: matches.length, spaceId: null });
}

export async function GET(request: Request) {
  return handleRecompute(request);
}

export async function POST(request: Request) {
  return handleRecompute(request);
}
