import { ArrowLeft, LockKeyhole } from "lucide-react";

import { createPostInSpaceAction } from "@/actions/member";
import { PostComposer } from "@/components/community/post-composer";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  getCommunityDisplayName,
  getCommunityPeopleLabels,
} from "@/lib/community-copy";
import { singleQueryValue } from "@/lib/feed-filters";
import { env } from "@/lib/env";
import { getSpaceViewerContext } from "@/lib/space-auth";
import { getPostMediaStorageMode } from "@/server/post-media-storage";

function defaultOpportunitySource({
  canAdmin,
  canMentor,
}: {
  canAdmin: boolean;
  canMentor: boolean;
}) {
  if (canAdmin) return "official";
  if (canMentor) return "mentor";
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
    canAdmin: viewer.canAdmin,
    canMentor: viewer.canMentor,
  });
  const mediaStorageMode = getPostMediaStorageMode();

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
          <PostComposer
            action={createPostInSpaceAction.bind(
              null,
              slug,
              space.id,
              viewer.membership.id,
            )}
            appOrigin={env.appUrl}
            canAdmin={viewer.canAdmin}
            canMentor={viewer.canMentor}
            communityName={communityName}
            defaultOpportunitySource={source}
            defaultType={opportunityMode ? "opportunity" : feedPostType}
            imageUploadsEnabled={Boolean(mediaStorageMode)}
            membershipId={viewer.membership.id}
            memoryImageUploads={mediaStorageMode === "memory"}
            opportunityMode={opportunityMode}
            slug={slug}
            spaceId={space.id}
          />
        </Card>
      )}
    </div>
  );
}
