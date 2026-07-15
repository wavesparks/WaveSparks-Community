import { getCurrentAuthIdentity } from "@/lib/auth-identity";
import { canViewAdminRoute } from "@/server/permissions";
import { previewAccountSpecs, provisionPreviewAccounts } from "@/server/preview-accounts";
import { getViewerRecordByEmailAndSlug } from "@/server/store";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    orgSlug?: string;
  };
  const orgSlug = body.orgSlug?.trim() || "wavesparks";

  const identity = await getCurrentAuthIdentity();
  if (!identity) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const viewerRecord = await getViewerRecordByEmailAndSlug(orgSlug, identity.email);

  if (!viewerRecord?.org) {
    return Response.json({ error: "Organization not found." }, { status: 404 });
  }

  if (
    !viewerRecord.user ||
    !viewerRecord.membership ||
    !canViewAdminRoute(viewerRecord.user, viewerRecord.membership)
  ) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const provisioned = await provisionPreviewAccounts({
    orgId: viewerRecord.org.id,
  });

  return Response.json({
    ok: true,
    accounts: provisioned.map(({ spec, membership, profile }) => ({
      kind: spec.kind,
      email: spec.email,
      role: membership.role,
      affiliationType: membership.affiliationType,
      onboardingComplete: profile.onboardingComplete,
    })),
    expectedKinds: previewAccountSpecs.map((spec) => spec.kind),
  });
}
