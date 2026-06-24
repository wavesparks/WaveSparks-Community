import { updateProfileFlagsAction } from "@/actions/admin";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { SubmitButton } from "@/components/ui/submit-button";
import { getViewerContext } from "@/lib/auth";
import { singleQueryValue } from "@/lib/feed-filters";
import { listMembershipProfileRecordsForOrg } from "@/server/store";
import { toFullAdminProfile } from "@/server/view-models";
import type { FullAdminProfile, MembershipStatus } from "@/lib/domain";

const profileQueues = [
  { label: "All", status: undefined, flag: undefined },
  { label: "Approved", status: "approved", flag: undefined },
  { label: "Pending", status: "pending", flag: undefined },
  { label: "Featured", status: undefined, flag: "featured" },
  { label: "Stale", status: undefined, flag: "stale" },
] satisfies Array<{
  label: string;
  status?: MembershipStatus;
  flag?: "featured" | "stale";
}>;

function profileStatusFromQuery(value?: string) {
  return profileQueues.some((queue) => queue.status === value)
    ? (value as MembershipStatus)
    : undefined;
}

function profileFlagFromQuery(value?: string) {
  return value === "featured" || value === "stale" ? value : undefined;
}

function profileQueueHref(slug: string, queue: (typeof profileQueues)[number]) {
  const params = new URLSearchParams();
  if (queue.status) {
    params.set("profile_status", queue.status);
  }
  if (queue.flag) {
    params.set("profile_flag", queue.flag);
  }

  const query = params.toString();
  return `/org/${slug}/admin/profiles${query ? `?${query}` : ""}`;
}

export default async function AdminProfilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const viewer = await getViewerContext(slug, {
    requireAuth: true,
    requireApproved: true,
    requireAdmin: true,
  });

  if (!viewer) {
    return null;
  }

  const selectedProfileStatus = profileStatusFromQuery(singleQueryValue(query.profile_status));
  const selectedProfileFlag = profileFlagFromQuery(singleQueryValue(query.profile_flag));
  const profiles = (await listMembershipProfileRecordsForOrg(viewer.org.id, {
    featured: selectedProfileFlag === "featured" ? true : undefined,
    limit: 100,
    profileRequired: true,
    stale: selectedProfileFlag === "stale" ? true : undefined,
    status: selectedProfileStatus,
  }))
    .map(({ membership, profile }) =>
      profile ? toFullAdminProfile(profile, membership) : null,
    )
    .filter((profile): profile is FullAdminProfile => Boolean(profile));

  return (
    <AppShell currentPath={`/org/${slug}/admin/profiles`} viewer={viewer}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SectionHeading
            eyebrow="Admin · Profiles"
            level={1}
            title="Browse full profiles and admin-only fields"
            description="This is the only surface where full profiles, contact fields, and moderation flags are visible in one place."
          />
          <LinkButton href={`/org/${slug}/admin/profiles/export`}>Export CSV</LinkButton>
        </div>
        <StatusBanner status={singleQueryValue(query.status)} />

        <div className="space-y-6">
          <div className="space-y-4">
            <SectionHeading eyebrow="Latest" title="Profile records" />
            <div className="flex flex-wrap gap-2">
              {profileQueues.map((queue) => {
                const active =
                  queue.status === selectedProfileStatus &&
                  queue.flag === selectedProfileFlag;

                return (
                  <LinkButton
                    href={profileQueueHref(slug, queue)}
                    key={queue.label}
                    size="sm"
                    variant={active ? "primary" : "secondary"}
                  >
                    {queue.label}
                  </LinkButton>
                );
              })}
            </div>
          </div>
          {profiles.map((profile) => (
            <Card className="space-y-4" key={profile.profileId}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold text-[var(--ink)]">{profile.displayName}</h3>
                  <p className="text-sm text-[var(--ink-soft)]">{profile.headline}</p>
                </div>
                <div className="flex gap-2">
                  <Badge variant="muted">{profile.affiliationLabel}</Badge>
                  <Badge variant={profile.status === "approved" ? "accent" : "default"}>
                    {profile.status}
                  </Badge>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4 text-sm text-[var(--ink-soft)]">
                  <p className="font-semibold text-[var(--ink)]">Contact</p>
                  <p className="mt-2">{profile.emailForIntro}</p>
                  <p>{profile.whatsappNumber}</p>
                </div>
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4 text-sm text-[var(--ink-soft)]">
                  <p className="font-semibold text-[var(--ink)]">Roles & offers</p>
                  <p className="mt-2">{profile.desiredRoles.join(", ") || "None listed"}</p>
                  <p>{profile.mentorOffers.join(", ") || "No mentor offers"}</p>
                </div>
              </div>
              <p className="text-sm text-[var(--ink-soft)]">{profile.startupDescription}</p>
              <form
                action={updateProfileFlagsAction.bind(null, slug, profile.profileId)}
                className="flex flex-wrap gap-3"
              >
                <input name="featured" type="hidden" value={String(!profile.featured)} />
                <input name="stale" type="hidden" value={String(profile.stale)} />
                <SubmitButton pendingLabel="Updating" variant="secondary">
                  {profile.featured ? "Unfeature" : "Feature"}
                </SubmitButton>
              </form>
              <form
                action={updateProfileFlagsAction.bind(null, slug, profile.profileId)}
                className="flex flex-wrap gap-3"
              >
                <input name="featured" type="hidden" value={String(profile.featured)} />
                <input name="stale" type="hidden" value={String(!profile.stale)} />
                <SubmitButton pendingLabel="Updating" variant="secondary">
                  {profile.stale ? "Mark fresh" : "Mark stale"}
                </SubmitButton>
              </form>
            </Card>
          ))}
          {!profiles.length ? (
            <Card>
              <p className="text-sm font-semibold text-[var(--ink)]">No profiles found yet</p>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                Completed member profiles will appear here. Use export for full CSV access.
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
