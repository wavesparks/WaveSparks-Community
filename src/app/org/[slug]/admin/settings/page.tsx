import { updateOrgSettingsAction } from "@/actions/admin";
import { OrgLogoUploadField } from "@/components/admin/org-logo-upload-field";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { getViewerContext } from "@/lib/auth";
import { singleQueryValue } from "@/lib/feed-filters";

export default async function AdminSettingsPage({
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
    requireAdmin: true,
  });

  if (!viewer) {
    return null;
  }

  return (
    <AppShell currentPath={`/org/${slug}/admin/settings`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Admin · Settings"
          level={1}
          title="Community profile and invitations"
          description="Update how Wavesparks appears and the guidance admins use when inviting people."
        />
        <StatusBanner status={singleQueryValue(query.status)} />
        <Card className="space-y-4">
          <form action={updateOrgSettingsAction.bind(null, slug)} className="space-y-4">
            <OrgLogoUploadField
              defaultValue={viewer.org.logoUrl}
              orgName={viewer.org.name}
              slug={slug}
            />
            <div>
              <Label htmlFor="organization-name">Community name</Label>
              <Input
                defaultValue={viewer.org.name}
                id="organization-name"
                name="name"
                placeholder="Wavesparks"
              />
            </div>
            <div>
              <Label htmlFor="organization-tagline">Tagline</Label>
              <Input
                defaultValue={viewer.org.tagline}
                id="organization-tagline"
                name="tagline"
                placeholder="A short description of the community"
              />
            </div>
            <div>
              <Label htmlFor="organization-description">About the community</Label>
              <Textarea
                defaultValue={viewer.org.description}
                id="organization-description"
                name="description"
              />
            </div>
            <div>
              <Label htmlFor="organization-invite-settings">Invitation guidance</Label>
              <p className="mb-2 text-xs leading-5 text-[var(--ink-soft)]">
                Notes for admins about who should be invited and how access should be assigned.
              </p>
              <Textarea
                defaultValue={viewer.org.inviteSettings}
                id="organization-invite-settings"
                name="invite_settings"
              />
            </div>
            <SubmitButton pendingLabel="Saving settings">Save settings</SubmitButton>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
