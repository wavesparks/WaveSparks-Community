import { createPostAction } from "@/actions/member";
import { AppShell } from "@/components/layout/app-shell";
import { PostCard } from "@/components/community/post-card";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getViewerContext } from "@/lib/auth";
import { getFeedViewsForOrg } from "@/server/view-models";

export default async function FeedPage({
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
    requireApproved: true,
    requireCompleteProfile: true,
  });

  if (!viewer) {
    return null;
  }

  const q = typeof query.q === "string" ? query.q : undefined;
  const posts = getFeedViewsForOrg(viewer.org, q);
  const action = createPostAction.bind(null, slug, viewer.membership.id);

  return (
    <AppShell currentPath={`/org/${slug}/feed`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Feed"
          title="What the community is building right now"
          description="Posts are the visible surface area. Members discover each other through useful context, not open browsing."
        />

        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
          <div className="space-y-6">
            <Card className="space-y-4">
              <form className="grid gap-4 md:grid-cols-[1fr_auto]">
                <Input defaultValue={q} name="q" placeholder="Search posts, tags, opportunities" />
                <button className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white" type="submit">
                  Search
                </button>
              </form>
            </Card>

            {posts.map((post) => (
              <PostCard key={post.id} post={post} slug={slug} />
            ))}
          </div>

          <div className="space-y-6">
            <Card className="space-y-4">
              <SectionHeading
                eyebrow="Create post"
                title="Share an ask, opportunity, or update"
              />
              <form action={action} className="space-y-4">
                <Select name="type">
                  <option value="general_update">General update</option>
                  <option value="ask">Ask</option>
                  <option value="opportunity">Opportunity</option>
                  <option value="looking_for_cofounder">Looking for cofounder</option>
                  <option value="looking_for_mentor">Looking for mentor</option>
                  <option value="resource">Resource</option>
                </Select>
                <Input name="title" placeholder="Title" required />
                <Textarea name="body" placeholder="Give enough context for the community to help well." required />
                <Input name="tags" placeholder="Tags, comma separated" />
                <Input name="related_startup_name" placeholder="Related startup name (optional)" />
                <Input name="related_roles_needed" placeholder="Roles needed, comma separated" />
                <button className="w-full rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white" type="submit">
                  Publish to the feed
                </button>
              </form>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
