import Link from "next/link";

import { ActivationChecklistCard } from "@/components/community/activation-checklist-card";
import { AppShell } from "@/components/layout/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { getViewerContext } from "@/lib/auth";
import { singleQueryValue } from "@/lib/feed-filters";
import { formatPercent } from "@/lib/utils";
import { getMemberActivationState, getProfileLinks } from "@/server/view-models";

export default async function ProfilePage({
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
    requireCompleteProfile: true,
  });

  if (!viewer || !viewer.profile) {
    return null;
  }

  const [links, activation] = await Promise.all([
    getProfileLinks(viewer.profile.id),
    getMemberActivationState(
      viewer.org.id,
      viewer.membership.id,
      viewer.profile,
      slug,
    ),
  ]);

  return (
    <AppShell currentPath={`/org/${slug}/profile`} viewer={viewer}>
      <div className="space-y-8">
        <StatusBanner status={singleQueryValue(query.status)} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <Avatar
              className="size-20"
              name={viewer.profile.preferredName}
              src={viewer.profile.profilePhoto}
            />
            <SectionHeading
              eyebrow="My profile"
              level={1}
              title={viewer.profile.preferredName}
              description={viewer.profile.headline}
            />
          </div>
          <Link
            className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-95"
            href={`/org/${slug}/onboarding`}
          >
            Edit profile
          </Link>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <ActivationChecklistCard activation={activation} compact />
            <Card className="space-y-4">
              <p className="text-sm text-slate-700">{viewer.profile.longBio}</p>
              <div className="flex flex-wrap gap-2">
                {[...viewer.profile.industryTags, ...viewer.profile.skillTags].map((tag, index) => (
                  <Badge key={`profile-tag-${tag}-${index}`} variant="muted">
                    {tag}
                  </Badge>
                ))}
              </div>
            </Card>

            <Card className="space-y-4">
              <h2 className="text-xl font-semibold text-slate-950">What you’re building</h2>
              <p className="text-sm text-slate-700">{viewer.profile.startupOneLiner}</p>
              <p className="text-sm text-slate-600">{viewer.profile.startupDescription}</p>
            </Card>

            <Card className="space-y-4">
              <h2 className="text-xl font-semibold text-slate-950">What you’re looking for</h2>
              <p className="text-sm text-slate-700">{viewer.profile.idealMatchDescription}</p>
              <div className="flex flex-wrap gap-2">
                {viewer.profile.desiredRoles.map((role, index) => (
                  <Badge key={`desired-role-${role}-${index}`}>{role}</Badge>
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Profile completion
              </p>
              <p className="text-4xl font-semibold text-slate-950">
                {formatPercent(viewer.profile.profileCompletionPercent)}
              </p>
              <p className="text-sm text-slate-600">
                Matching visibility: {viewer.profile.profileVisibleInMatching ? "on" : "off"}
              </p>
            </Card>
            <Card className="space-y-4">
              <h3 className="text-xl font-semibold text-slate-950">Links</h3>
              <div className="space-y-2 text-sm text-slate-700">
                {links.map((link) => (
                  <a className="block underline" href={link.url} key={link.id} target="_blank">
                    {link.type}
                  </a>
                ))}
              </div>
            </Card>
            <Card className="space-y-4">
              <h3 className="text-xl font-semibold text-slate-950">Intro settings</h3>
              <p className="text-sm text-slate-700">Intro opt-in: {viewer.profile.introOptIn ? "on" : "off"}</p>
              <p className="text-sm text-slate-700">
                WhatsApp reveals after accept: {viewer.profile.whatsappVisibleAfterAccept ? "yes" : "no"}
              </p>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
