import { getCurrentAuthIdentity } from "@/lib/auth-identity";
import type { FullAdminProfile } from "@/lib/domain";
import { canViewAdminRoute } from "@/server/permissions";
import { fullProfilesToCsv } from "@/server/csv";
import {
  getViewerRecordByEmailAndSlug,
  listMembershipProfileRecordsForOrg,
} from "@/server/store";
import { toFullAdminProfile } from "@/server/view-models";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const identity = await getCurrentAuthIdentity();

  if (!identity) {
    return new Response("Unauthorized", { status: 401 });
  }

  const viewerRecord = await getViewerRecordByEmailAndSlug(slug, identity.email);
  const { org, user, membership } = viewerRecord;

  if (!org || !user || !membership || !canViewAdminRoute(user, membership)) {
    return new Response("Forbidden", { status: 403 });
  }

  const profiles = (await listMembershipProfileRecordsForOrg(org.id))
    .map(({ membership, profile }) =>
      profile ? toFullAdminProfile(profile, membership) : null,
    )
    .filter((profile): profile is FullAdminProfile => Boolean(profile));

  const csv = fullProfilesToCsv(profiles);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-profiles.csv"`,
    },
  });
}
