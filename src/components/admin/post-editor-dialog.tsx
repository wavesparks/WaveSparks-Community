"use client";

import { Pencil } from "lucide-react";
import { useId, useState } from "react";

import { updatePostContentAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import type { OpportunitySource, PostType } from "@/lib/domain";
import { isOpportunityPostType } from "@/lib/opportunities";

export interface AdminEditablePost {
  body: string;
  hasImages: boolean;
  hasLinkPreview: boolean;
  id: string;
  mentionCount: number;
  opportunitySource?: OpportunitySource;
  relatedRolesNeeded: string[];
  relatedStartupName?: string;
  tags: string[];
  title: string;
  type: PostType;
}

export function PostEditorDialog({
  post,
  slug,
}: {
  post: AdminEditablePost;
  slug: string;
}) {
  const [open, setOpen] = useState(false);
  const [postType, setPostType] = useState<PostType>(post.type);
  const fieldId = useId();
  const opportunityPost = isOpportunityPostType(postType);
  const titleRequired = postType !== "general_update";

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" type="button" variant="secondary">
        <Pencil aria-hidden className="size-4" />
        Edit post
      </Button>
      <Dialog
        description="Update the post copy and classification. Existing images stay attached."
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setPostType(post.type);
        }}
        open={open}
        title="Edit post"
      >
        {open ? (
          <form
            action={updatePostContentAction.bind(null, slug, post.id)}
            className="space-y-5"
          >
            <div>
              <Label htmlFor={`${fieldId}-type`}>Post type</Label>
              <Select
                id={`${fieldId}-type`}
                name="type"
                onChange={(event) => setPostType(event.target.value as PostType)}
                value={postType}
              >
                <option value="general_update">General update</option>
                <option value="ask">Question</option>
                <option value="resource">Resource</option>
                <option value="announcement">Announcement</option>
                <option value="opportunity">Opportunity</option>
                <option value="looking_for_cofounder">Looking for cofounder</option>
                <option value="looking_for_mentor">Looking for mentor</option>
              </Select>
            </div>

            {opportunityPost ? (
              <div>
                <Label htmlFor={`${fieldId}-opportunity-source`}>Shared by</Label>
                <Select
                  defaultValue={post.opportunitySource ?? "official"}
                  id={`${fieldId}-opportunity-source`}
                  name="opportunity_source"
                >
                  <option value="member">Participants</option>
                  <option value="mentor">Mentors</option>
                  <option value="official">Organizers</option>
                </Select>
              </div>
            ) : null}

            <div>
              <Label htmlFor={`${fieldId}-title`}>
                Title{" "}
                {!titleRequired ? (
                  <span className="font-normal text-[var(--ink-soft)]">(optional)</span>
                ) : null}
              </Label>
              <Input
                defaultValue={post.title}
                id={`${fieldId}-title`}
                maxLength={160}
                name="title"
                required={titleRequired}
              />
            </div>

            <div>
              <Label htmlFor={`${fieldId}-body`}>Details</Label>
              <Textarea
                defaultValue={post.body}
                id={`${fieldId}-body`}
                maxLength={10_000}
                name="body"
                rows={10}
              />
              {post.mentionCount ? (
                <p className="mt-2 text-xs leading-5 text-[var(--ink-soft)]">
                  If the details change, {post.mentionCount} existing @ mention
                  {post.mentionCount === 1 ? "" : "s"} will be converted to plain text.
                </p>
              ) : null}
              {post.hasLinkPreview ? (
                <p className="mt-2 text-xs leading-5 text-[var(--ink-soft)]">
                  The current link preview is kept only while the first external link remains
                  unchanged.
                </p>
              ) : null}
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <Label htmlFor={`${fieldId}-tags`}>Tags</Label>
                <Input
                  defaultValue={post.tags.join(", ")}
                  id={`${fieldId}-tags`}
                  name="tags"
                  placeholder="climate, sales, design"
                />
              </div>
              <div>
                <Label htmlFor={`${fieldId}-startup`}>Related startup</Label>
                <Input
                  defaultValue={post.relatedStartupName ?? ""}
                  id={`${fieldId}-startup`}
                  name="related_startup_name"
                  placeholder="Optional"
                />
              </div>
              {postType !== "resource" ? (
                <div className="md:col-span-2">
                  <Label htmlFor={`${fieldId}-roles`}>Roles needed</Label>
                  <Input
                    defaultValue={post.relatedRolesNeeded.join(", ")}
                    id={`${fieldId}-roles`}
                    name="related_roles_needed"
                    placeholder="technical, design, GTM"
                  />
                </div>
              ) : null}
            </div>

            {post.hasImages ? (
              <p className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2 text-xs leading-5 text-[var(--ink-soft)]">
                Existing images and their moderation status are preserved by this edit.
              </p>
            ) : null}

            <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
              <Button onClick={() => setOpen(false)} type="button" variant="ghost">
                Cancel
              </Button>
              <SubmitButton pendingLabel="Saving post">Save changes</SubmitButton>
            </div>
          </form>
        ) : null}
      </Dialog>
    </>
  );
}
