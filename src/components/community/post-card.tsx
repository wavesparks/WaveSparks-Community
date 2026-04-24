import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { FeedPostView } from "@/lib/domain";
import { formatDate } from "@/lib/utils";

export function PostCard({
  post,
  slug,
}: {
  post: FeedPostView;
  slug: string;
}) {
  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={post.featured ? "accent" : "default"}>{post.type.replaceAll("_", " ")}</Badge>
        <span className="text-xs uppercase tracking-[0.25em] text-slate-400">
          {formatDate(post.createdAt)}
        </span>
      </div>
      <div className="space-y-3">
        <h3 className="text-2xl font-semibold text-slate-950">{post.title}</h3>
        <p className="text-sm text-slate-600">{post.body}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {post.tags.map((tag) => (
          <Badge key={tag} variant="muted">
            {tag}
          </Badge>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-slate-50 px-4 py-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">{post.author.displayName}</p>
          <p className="text-sm text-slate-600">{post.author.headline}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{post.commentCount} comments</span>
          <Button asChild size="sm">
            <Link href={`/org/${slug}/posts/${post.id}`}>Open thread</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
