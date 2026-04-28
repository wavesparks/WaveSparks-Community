import Link from "next/link";

import { updateProfileFlagsAction } from "@/actions/admin";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { getViewerContext } from "@/lib/auth";
import { listMembershipsForOrg, listProfilesForOrg } from "@/server/store";
import { toFullAdminProfile } from "@/server/view-models";
import type { FullAdminProfile } from "@/lib/domain";

export default async function AdminProfilesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const viewer = await getViewerContext(slug, {
    requireAuth: true,
    requireApproved: true,
    requireCompleteProfile: true,
    requireAdmin: true,
  });

  if (!viewer) {
    return null;
  }

  const memberships = await listMembershipsForOrg(viewer.org.id);
  const profiles = (await listProfilesForOrg(viewer.org.id))
    .map((profile) => {
      const membership = memberships.find((candidate) => candidate.id === profile.membershipId);
      return membership ? toFullAdminProfile(profile, membership) : null;
    })
    .filter((profile): profile is FullAdminProfile => Boolean(profile));

  return (
    <AppShell currentPath={`/org/${slug}/admin/profiles`} viewer={viewer}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SectionHeading
            eyebrow="Admin · Profiles"
            title="Browse full profiles and admin-only fields"
            description="This is the only surface where full profiles, contact fields, and moderation flags are visible in one place."
          />
          <Button asChild>
            <Link href={`/org/${slug}/admin/profiles/export`}>Export CSV</Link>
          </Button>
        </div>

        <div className="space-y-6">
          {profiles.map((profile) => (
            <Card className="space-y-4" key={profile.profileId}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-2xl font-semibold text-slate-950">{profile.displayName}</h3>
                  <p className="text-sm text-slate-600">{profile.headline}</p>
                </div>
                <div className="flex gap-2">
                  <Badge variant="muted">{profile.affiliationLabel}</Badge>
                  <Badge variant={profile.status === "approved" ? "accent" : "default"}>
                    {profile.status}
                  </Badge>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[24px] bg-slate-50 p-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Contact</p>
                  <p className="mt-2">{profile.emailForIntro}</p>
                  <p>{profile.whatsappNumber}</p>
                </div>
                <div className="rounded-[24px] bg-slate-50 p-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Roles & offers</p>
                  <p className="mt-2">{profile.desiredRoles.join(", ") || "None listed"}</p>
                  <p>{profile.mentorOffers.join(", ") || "No mentor offers"}</p>
                </div>
              </div>
              <p className="text-sm text-slate-700">{profile.startupDescription}</p>
              <form
                action={updateProfileFlagsAction.bind(null, slug, profile.profileId)}
                className="flex flex-wrap gap-3"
              >
                <input name="featured" type="hidden" value={String(!profile.featured)} />
                <input name="stale" type="hidden" value={String(!profile.stale)} />
                <Button type="submit" variant="secondary">
                  {profile.featured ? "Unfeature" : "Feature"}
                </Button>
              </form>
              <form
                action={updateProfileFlagsAction.bind(null, slug, profile.profileId)}
                className="flex flex-wrap gap-3"
              >
                <input name="featured" type="hidden" value={String(profile.featured)} />
                <input name="stale" type="hidden" value={String(!profile.stale)} />
                <Button type="submit" variant="secondary">
                  {profile.stale ? "Mark fresh" : "Mark stale"}
                </Button>
              </form>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
