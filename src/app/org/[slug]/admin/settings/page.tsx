import { updateOrgSettingsAction } from "@/actions/admin";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import { Textarea } from "@/components/ui/textarea";
import { getViewerContext } from "@/lib/auth";

export default async function AdminSettingsPage({
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

  return (
    <AppShell currentPath={`/org/${slug}/admin/settings`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Admin · Settings"
          title="Org name, positioning, and invite rules"
          description="The MVP settings surface is intentionally narrow: enough to support branded client communities without reopening core product decisions."
        />
        <Card className="space-y-4">
          <form action={updateOrgSettingsAction.bind(null, slug)} className="space-y-4">
            <Input defaultValue={viewer.org.name} name="name" placeholder="Org name" />
            <Input defaultValue={viewer.org.tagline} name="tagline" placeholder="Tagline" />
            <Textarea defaultValue={viewer.org.description} name="description" />
            <Textarea defaultValue={viewer.org.inviteSettings} name="invite_settings" />
            <Button type="submit">Save settings</Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
