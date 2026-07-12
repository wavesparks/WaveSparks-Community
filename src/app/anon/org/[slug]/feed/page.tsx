import { notFound } from "next/navigation";

import {
  PublicFeedExplorer,
  type PublicFeedPostView,
} from "@/components/community/public-feed-explorer";
import { ForumShell } from "@/components/layout/forum-shell";
import { StatusBanner } from "@/components/ui/status-banner";
import { singleQueryValue } from "@/lib/feed-filters";
import { getOrganizationBySlug, listPublicFeedPostRecordsForOrg } from "@/server/store";
import { toLimitedProfileCard } from "@/server/view-models";

export const revalidate = 60;

export default async function AnonymousFeedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
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
        <StatusBanner status={singleQueryValue(query.status)} />
        <PublicFeedExplorer posts={posts} slug={slug} />
      </div>
    </ForumShell>
  );
}
