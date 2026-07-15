import { ArrowLeft, LockKeyhole, Send } from "lucide-react";

import { createPostInSpaceAction } from "@/actions/member";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import {
  getCommunityDisplayName,
  getCommunityPeopleLabels,
} from "@/lib/community-copy";
import { singleQueryValue } from "@/lib/feed-filters";
import { getSpaceViewerContext } from "@/lib/space-auth";

function defaultOpportunitySource({
  affiliationType,
  archetypes,
  canAdmin,
}: {
  affiliationType: string;
  archetypes: string[];
  canAdmin: boolean;
}) {
  if (canAdmin) return "official";
  if (affiliationType === "mentor" || archetypes.includes("mentor")) return "mentor";
  return "member";
}

function defaultFeedPostType(value?: string) {
  return value === "ask" ||
    value === "resource" ||
    value === "announcement" ||
    value === "opportunity" ||
    value === "looking_for_cofounder" ||
    value === "looking_for_mentor"
    ? value
    : "general_update";
}

export default async function SpaceComposePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; spaceSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug, spaceSlug }, query] = await Promise.all([params, searchParams]);
  const context = await getSpaceViewerContext(slug, spaceSlug, {
    requireAccess: true,
    requireAuth: true,
  });
  const { space, viewer } = context;
  const communityName = getCommunityDisplayName(space);
  const { plural: peopleLabel } = getCommunityPeopleLabels(space);
  const kind = singleQueryValue(query.kind) === "opportunity" ? "opportunity" : "feed";
  const feedPostType = defaultFeedPostType(singleQueryValue(query.type));
  const opportunityMode = kind === "opportunity";
  const destination = opportunityMode ? "opportunities" : "feed";
  const backPath = `/org/${slug}/s/${space.slug}/${destination}`;
  const source = defaultOpportunitySource({
    affiliationType: viewer.membership.affiliationType,
    archetypes: viewer.membership.archetypes,
    canAdmin: viewer.canAdmin,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeading
          description={`Share something with the ${peopleLabel} in ${communityName}.`}
          eyebrow={opportunityMode ? "Create opportunity" : "Create post"}
          level={1}
          title={
            opportunityMode
              ? `Share an opportunity in ${communityName}`
              : `Post in ${communityName}`
          }
        />
        <LinkButton href={backPath} size="sm" variant="secondary">
          <ArrowLeft className="size-4" />
          Back to {destination}
        </LinkButton>
      </div>

      <Card className="flex gap-3 border-[var(--accent)]/25 bg-[var(--accent-soft)]">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--night)] text-[var(--surface)]">
          <LockKeyhole className="size-4" />
        </div>
        <div>
          <p className="font-semibold text-[var(--ink)]">Who will see this?</p>
          <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
            This post will be visible to active {peopleLabel} in {communityName}.
          </p>
        </div>
      </Card>

      {!context.canInteract ? (
        <Card className="space-y-4 border-amber-500/25 bg-amber-50">
          <div>
            <p className="font-semibold text-[var(--ink)]">Complete your profile to post</p>
            <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
              You can read posts in {communityName}, but you’ll need a complete profile
              to publish or respond.
            </p>
          </div>
          <LinkButton
            href={`/org/${slug}/onboarding?space=${encodeURIComponent(space.slug)}`}
            variant="secondary"
          >
            Complete profile
          </LinkButton>
        </Card>
      ) : (
        <Card>
          <form
            action={createPostInSpaceAction.bind(
              null,
              slug,
              space.id,
              viewer.membership.id,
            )}
            className="space-y-5"
          >
            <div>
              <Label htmlFor="type">Post type</Label>
              <Select
                defaultValue={opportunityMode ? "opportunity" : feedPostType}
                id="type"
                name="type"
              >
                {opportunityMode ? null : (
                  <>
                    <option value="general_update">General update</option>
                    <option value="ask">Question</option>
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
                <Label htmlFor="opportunity_source">Shared by</Label>
                {viewer.canAdmin ? (
                  <Select
                    defaultValue={source}
                    id="opportunity_source"
                    name="opportunity_source"
                  >
                    <option value="official">Organizers</option>
                    <option value="member">Participants</option>
                    <option value="mentor">Mentors</option>
                  </Select>
                ) : (
                  <>
                    <Input
                      disabled
                      id="opportunity_source"
                      value={source === "mentor" ? "Mentors" : "Participants"}
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
              <Label htmlFor="body">Details</Label>
              <Textarea
                id="body"
                name="body"
                placeholder="Add the details, who this is for, and what kind of response would help."
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
              {opportunityMode
                ? `Publish opportunity in ${communityName}`
                : `Publish post in ${communityName}`}
            </SubmitButton>
          </form>
        </Card>
      )}
    </div>
  );
}
