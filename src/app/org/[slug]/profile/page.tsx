import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { getViewerContext } from "@/lib/auth";
import { formatPercent } from "@/lib/utils";
import { getProfileLinks } from "@/server/view-models";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const viewer = await getViewerContext(slug, {
    requireAuth: true,
    requireApproved: true,
    requireCompleteProfile: true,
  });

  if (!viewer || !viewer.profile) {
    return null;
  }

  const links = getProfileLinks(viewer.profile.id);

  return (
    <AppShell currentPath={`/org/${slug}/profile`} viewer={viewer}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionHeading
            eyebrow="My profile"
            title={viewer.profile.preferredName}
            description={viewer.profile.headline}
          />
          <Link
            className="inline-flex items-center rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white"
            href={`/org/${slug}/onboarding`}
          >
            Edit profile
          </Link>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <Card className="space-y-4">
              <p className="text-sm text-slate-700">{viewer.profile.longBio}</p>
              <div className="flex flex-wrap gap-2">
                {[...viewer.profile.industryTags, ...viewer.profile.skillTags].map((tag) => (
                  <Badge key={tag} variant="muted">
                    {tag}
                  </Badge>
                ))}
              </div>
            </Card>

            <Card className="space-y-4">
              <h2 className="text-2xl font-semibold text-slate-950">What you’re building</h2>
              <p className="text-sm text-slate-700">{viewer.profile.startupOneLiner}</p>
              <p className="text-sm text-slate-600">{viewer.profile.startupDescription}</p>
            </Card>

            <Card className="space-y-4">
              <h2 className="text-2xl font-semibold text-slate-950">What you’re looking for</h2>
              <p className="text-sm text-slate-700">{viewer.profile.idealMatchDescription}</p>
              <div className="flex flex-wrap gap-2">
                {viewer.profile.desiredRoles.map((role) => (
                  <Badge key={role}>{role}</Badge>
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="space-y-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
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
