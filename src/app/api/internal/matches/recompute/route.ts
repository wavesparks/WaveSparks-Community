import { getCurrentAuthIdentity } from "@/lib/auth-identity";
import { env } from "@/lib/env";
import {
  getOrganizationBySlug,
  getViewerRecordByEmailAndSlug,
  recomputeMatchesForOrg,
} from "@/server/store";
import { canAdminOrganization } from "@/server/permissions";

async function handleRecompute(request: Request) {
  const body = request.method === "POST"
    ? ((await request.json().catch(() => ({}))) as { orgSlug?: string })
    : {};
  const orgSlug = body.orgSlug ?? "wavespark";
  const org = await getOrganizationBySlug(orgSlug);

  if (!org) {
    return Response.json({ error: "Organization not found" }, { status: 404 });
  }

  const authorizedBySecret =
    env.cronSecret &&
    (request.headers.get("x-cron-secret") === env.cronSecret ||
      request.headers.get("authorization") === `Bearer ${env.cronSecret}`);

  if (!authorizedBySecret) {
    const identity = await getCurrentAuthIdentity();
    const viewerRecord = identity
      ? await getViewerRecordByEmailAndSlug(orgSlug, identity.email)
      : undefined;
    const user = viewerRecord?.user;
    const membership = viewerRecord?.membership;

    if (!user || !membership || !canAdminOrganization(user, membership)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const matches = await recomputeMatchesForOrg(org.id);
  return Response.json({ ok: true, count: matches.length });
}

export async function GET(request: Request) {
  return handleRecompute(request);
}

export async function POST(request: Request) {
  return handleRecompute(request);
}
