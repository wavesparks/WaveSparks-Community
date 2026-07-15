import { ActivationChecklistCard } from "@/components/community/activation-checklist-card";
import { AppShell } from "@/components/layout/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { getViewerContext } from "@/lib/auth";
import { singleQueryValue } from "@/lib/feed-filters";
import { formatPercent } from "@/lib/utils";
import { getMemberActivationState, getProfileLinks } from "@/server/view-models";
import { listMatchTypeConfigsForOrg } from "@/server/store";

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
    requireConnected: true,
    requireCompleteProfile: true,
  });

  if (!viewer || !viewer.profile) {
    return null;
  }

  const [links, activation, matchTypeConfigs] = await Promise.all([
    getProfileLinks(viewer.profile.id),
    getMemberActivationState(
      viewer.org.id,
      viewer.membership.id,
      viewer.profile,
      slug,
    ),
    listMatchTypeConfigsForOrg(viewer.org.id, { includeInactive: true }),
  ]);
  const configBySlug = new Map(matchTypeConfigs.map((config) => [config.slug, config]));

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
          <LinkButton href={`/org/${slug}/onboarding`}>
            Edit profile
          </LinkButton>
        </div>

        <Card className="border-[var(--cyan)]/30 bg-[var(--cyan-soft)]">
          <p className="font-semibold text-[var(--ink)]">One profile across all your spaces</p>
          <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
            Changes to your name, bio, experience, and contact settings apply in Main Community and
            every Event Space you can access. Your goals, offers, and AI matching preference are set
            separately inside each space.
          </p>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <ActivationChecklistCard activation={activation} compact />
            <Card className="space-y-4">
              <p className="text-sm text-[var(--ink-soft)]">{viewer.profile.longBio}</p>
              <div className="flex flex-wrap gap-2">
                {[...viewer.profile.industryTags, ...viewer.profile.skillTags].map((tag, index) => (
                  <Badge key={`profile-tag-${tag}-${index}`} variant="muted">
                    {tag}
                  </Badge>
                ))}
              </div>
            </Card>

            <Card className="space-y-4">
              <h2 className="text-xl font-semibold text-[var(--ink)]">What you’re building</h2>
              <p className="text-sm text-[var(--ink-soft)]">{viewer.profile.startupOneLiner}</p>
              <p className="text-sm text-[var(--ink-soft)]">{viewer.profile.startupDescription}</p>
            </Card>

            <Card className="space-y-4">
              <h2 className="text-xl font-semibold text-[var(--ink)]">What you’re looking for</h2>
              <p className="text-sm text-[var(--ink-soft)]">{viewer.profile.idealMatchDescription}</p>
              <div className="flex flex-wrap gap-2">
                {viewer.profile.seekingMatchTypes.map((matchType) => (
                  <Badge key={`seeking-${matchType}`} variant="accent">
                    {configBySlug.get(matchType)?.name ?? matchType.replaceAll("_", " ")}
                  </Badge>
                ))}
                {viewer.profile.desiredRoles.map((role, index) => (
                  <Badge key={`desired-role-${role}-${index}`}>{role}</Badge>
                ))}
              </div>
            </Card>

            <Card className="space-y-4">
              <h2 className="text-xl font-semibold text-[var(--ink)]">What you can offer</h2>
              <div className="flex flex-wrap gap-2">
                {viewer.profile.offeringMatchTypes.map((matchType) => (
                  <Badge key={`offering-${matchType}`} variant="muted">
                    {configBySlug.get(matchType)?.name ?? matchType.replaceAll("_", " ")}
                  </Badge>
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="space-y-4">
              <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">
                Profile completion
              </p>
              <p className="text-4xl font-semibold text-[var(--ink)]">
                {formatPercent(viewer.profile.profileCompletionPercent)}
              </p>
              <p className="text-sm text-[var(--ink-soft)]">
                AI matching is configured separately inside each Space.
              </p>
            </Card>
            <Card className="space-y-4">
              <h3 className="text-xl font-semibold text-[var(--ink)]">Links</h3>
              <div className="space-y-2 text-sm text-[var(--ink-soft)]">
                {links.map((link) => (
                  <a className="block underline" href={link.url} key={link.id} target="_blank">
                    {link.type}
                  </a>
                ))}
              </div>
            </Card>
            <Card className="space-y-4">
              <h3 className="text-xl font-semibold text-[var(--ink)]">Intro settings</h3>
              <p className="text-sm text-[var(--ink-soft)]">Intro opt-in: {viewer.profile.introOptIn ? "on" : "off"}</p>
              <p className="text-sm text-[var(--ink-soft)]">
                WhatsApp reveals after accept: {viewer.profile.whatsappVisibleAfterAccept ? "yes" : "no"}
              </p>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
