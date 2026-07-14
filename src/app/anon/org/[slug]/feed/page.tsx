import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  PublicFeedExplorer,
  type PublicFeedPostView,
} from "@/components/community/public-feed-explorer";
import { ForumShell } from "@/components/layout/forum-shell";
import { SearchParamStatusBanner } from "@/components/ui/search-param-status-banner";
import { getOrganizationBySlug, listPublicFeedPostRecordsForOrg } from "@/server/store";
import { toLimitedProfileCard } from "@/server/view-models";

export const dynamic = "force-static";
export const revalidate = 60;

export default async function AnonymousFeedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrganizationBySlug(slug);

  if (!org) {
    notFound();
  }

  const records = await listPublicFeedPostRecordsForOrg(org.id, {
    hidden: false,
    limit: 60,
  });
  const posts: PublicFeedPostView[] = records.map(
    ({ commentCount, membership, post, profile }) => ({
      id: post.id,
      type: post.type,
      opportunitySource: post.opportunitySource,
      title: post.title,
      body: post.body,
      tags: post.tags,
      relatedRolesNeeded: post.relatedRolesNeeded,
      status: post.status,
      featured: post.featured,
      createdAt: post.createdAt,
      author: toLimitedProfileCard(profile, membership),
      authorIndustryTags: profile.industryTags,
      authorStage: profile.stage,
      commentCount,
      isFollowingAuthor: false,
      isSaved: false,
      isRecommended: false,
      recommendationReasons: [],
    }),
  );

  return (
    <ForumShell currentPath={`/org/${slug}/feed`} org={org} viewer={null}>
      <div className="space-y-5">
        <Suspense fallback={null}>
          <SearchParamStatusBanner />
        </Suspense>
        <PublicFeedExplorer posts={posts} slug={slug} />
      </div>
    </ForumShell>
  );
}
