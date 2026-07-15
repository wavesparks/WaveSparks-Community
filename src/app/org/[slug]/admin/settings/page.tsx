import { updateOrgSettingsAction } from "@/actions/admin";
import { OrgLogoUploadField } from "@/components/admin/org-logo-upload-field";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
          title="Org name, positioning, and invite rules"
          description="The MVP settings surface is intentionally narrow: enough to support branded client communities without reopening core product decisions."
        />
        <StatusBanner status={singleQueryValue(query.status)} />
        <Card className="space-y-4">
          <form action={updateOrgSettingsAction.bind(null, slug)} className="space-y-4">
            <OrgLogoUploadField
              defaultValue={viewer.org.logoUrl}
              orgName={viewer.org.name}
              slug={slug}
            />
            <Input defaultValue={viewer.org.name} name="name" placeholder="Org name" />
            <Input defaultValue={viewer.org.tagline} name="tagline" placeholder="Tagline" />
            <Textarea defaultValue={viewer.org.description} name="description" />
            <Textarea defaultValue={viewer.org.inviteSettings} name="invite_settings" />
            <SubmitButton pendingLabel="Saving settings">Save settings</SubmitButton>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
