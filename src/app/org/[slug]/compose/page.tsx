import Link from "next/link";
import { ArrowLeft, Send } from "lucide-react";

import { createPostAction } from "@/actions/member";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeading } from "@/components/ui/section-heading";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { getViewerContext } from "@/lib/auth";
import { singleQueryValue } from "@/lib/feed-filters";

function defaultOpportunitySource(viewer: Awaited<ReturnType<typeof getViewerContext>>) {
  if (!viewer) {
    return "member";
  }

  if (viewer.canAdmin) {
    return "official";
  }

  if (
    viewer.membership.affiliationType === "mentor" ||
    viewer.membership.archetypes.includes("mentor")
  ) {
    return "mentor";
  }

  return "member";
}

export default async function ComposePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const kind = singleQueryValue(query.kind) === "opportunity" ? "opportunity" : "feed";
  const viewer = await getViewerContext(slug, {
    requireAuth: true,
    requireApproved: true,
    requireCompleteProfile: true,
  });

  if (!viewer) {
    return null;
  }

  const action = createPostAction.bind(null, slug, viewer.membership.id);
  const opportunityMode = kind === "opportunity";
  const source = defaultOpportunitySource(viewer);

  return (
    <AppShell currentPath={`/org/${slug}/compose`} viewer={viewer}>
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionHeading
            eyebrow={opportunityMode ? "Create opportunity" : "Create post"}
            level={1}
            title={
              opportunityMode
                ? "Publish an opportunity with the right source layer"
                : "Share an ask, update, resource, or opportunity"
            }
            description={
              opportunityMode
                ? "Opportunity posts appear in the official, user, or mentor layer based on your role."
                : "Use enough context that the right members can recognize where they can help."
            }
          />
          <Button asChild size="sm" variant="secondary">
            <Link href={opportunityMode ? `/org/${slug}/opportunities` : `/org/${slug}/feed`}>
              <ArrowLeft className="size-4" />
              Back
            </Link>
          </Button>
        </div>

        <Card>
          <form action={action} className="space-y-5">
            <div>
              <Label htmlFor="type">Post type</Label>
              <Select
                defaultValue={opportunityMode ? "opportunity" : "general_update"}
                id="type"
                name="type"
              >
                {opportunityMode ? null : (
                  <>
                    <option value="general_update">General update</option>
                    <option value="ask">Ask</option>
                    <option value="resource">Resource</option>
                    <option value="announcement">Announcement</option>
                  </>
                )}
                <option value="opportunity">Opportunity</option>
                <option value="looking_for_cofounder">Looking for cofounder</option>
                <option value="looking_for_mentor">Looking for mentor</option>
              </Select>
            </div>

            {opportunityMode ? (
              <div>
                <Label htmlFor="opportunity_source">Opportunity layer</Label>
                {viewer.canAdmin ? (
                  <Select defaultValue={source} id="opportunity_source" name="opportunity_source">
                    <option value="official">Official admin recommended</option>
                    <option value="member">User published</option>
                    <option value="mentor">Mentor published</option>
                  </Select>
                ) : (
                  <>
                    <Input
                      disabled
                      value={source === "mentor" ? "Mentor published" : "User published"}
                    />
                    <input name="opportunity_source" type="hidden" value={source} />
                  </>
                )}
              </div>
            ) : null}

            <div>
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" placeholder="Clear, specific headline" required />
            </div>
            <div>
              <Label htmlFor="body">Context</Label>
              <Textarea
                id="body"
                name="body"
                placeholder="Explain what is happening, who it is for, and what kind of response would be useful."
                required
              />
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <Label htmlFor="tags">Tags</Label>
                <Input id="tags" name="tags" placeholder="climate, sales, design" />
              </div>
              <div>
                <Label htmlFor="related_startup_name">Related startup</Label>
                <Input
                  id="related_startup_name"
                  name="related_startup_name"
                  placeholder="Optional"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="related_roles_needed">Roles needed</Label>
                <Input
                  id="related_roles_needed"
                  name="related_roles_needed"
                  placeholder="technical, design, GTM"
                />
              </div>
            </div>
            <SubmitButton
              className="w-full"
              pendingLabel={opportunityMode ? "Publishing opportunity" : "Publishing post"}
            >
              <Send className="size-4" />
              {opportunityMode ? "Publish opportunity" : "Publish post"}
            </SubmitButton>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
