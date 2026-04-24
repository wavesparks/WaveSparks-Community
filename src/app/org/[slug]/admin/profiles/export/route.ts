import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth-options";
import type { FullAdminProfile } from "@/lib/domain";
import { canAdminOrganization } from "@/server/permissions";
import { fullProfilesToCsv } from "@/server/csv";
import {
  getMembershipByUserAndOrg,
  getOrganizationBySlug,
  getUserByEmail,
  listMembershipsForOrg,
  listProfilesForOrg,
} from "@/server/store";
import { toFullAdminProfile } from "@/server/view-models";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const session = await getServerSession(authOptions);
  const org = getOrganizationBySlug(slug);

  if (!org || !session?.user?.email) {
    return new Response("Unauthorized", { status: 401 });
  }

  const user = getUserByEmail(session.user.email);
  const membership = user ? getMembershipByUserAndOrg(user.id, org.id) : undefined;

  if (!user || !membership || !canAdminOrganization(user, membership)) {
    return new Response("Forbidden", { status: 403 });
  }

  const memberships = listMembershipsForOrg(org.id);
  const profiles = listProfilesForOrg(org.id)
    .map((profile) => {
      const membership = memberships.find((candidate) => candidate.id === profile.membershipId);
      return membership ? toFullAdminProfile(profile, membership) : null;
    })
    .filter((profile): profile is FullAdminProfile => Boolean(profile));

  const csv = fullProfilesToCsv(profiles);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-profiles.csv"`,
    },
  });
}
