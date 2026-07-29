"use client";

import { ImageOff, Send } from "lucide-react";
import { useActionState, useState } from "react";

import { LinkPreviewComposer } from "@/components/community/link-preview-composer";
import {
  MentionTextarea,
  type MentionValue,
} from "@/components/community/mention-textarea";
import {
  PostImageUploadField,
  type StagedPostImage,
} from "@/components/community/post-image-upload-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import type { PostType } from "@/lib/domain";

export interface ComposerActionState {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  message?: string;
}

export type ComposerAction = (
  previousState: ComposerActionState,
  formData: FormData,
) => Promise<ComposerActionState>;

const INITIAL_ACTION_STATE: ComposerActionState = {};

function fieldError(state: ComposerActionState, name: string) {
  return state.fieldErrors?.[name]?.[0];
}

export function PostComposer({
  action,
  appOrigin,
  canAdmin,
  canMentor = false,
  communityName,
  defaultOpportunitySource,
  defaultType,
  imageUploadsEnabled,
  memoryImageUploads = false,
  membershipId,
  opportunityMode,
  slug,
  spaceId,
}: {
  action: ComposerAction;
  appOrigin?: string;
  canAdmin: boolean;
  canMentor?: boolean;
  communityName: string;
  defaultOpportunitySource: "member" | "mentor" | "official";
  defaultType: PostType;
  imageUploadsEnabled: boolean;
  memoryImageUploads?: boolean;
  membershipId: string;
  opportunityMode: boolean;
  slug: string;
  spaceId: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ACTION_STATE);
  const [body, setBody] = useState("");
  const [images, setImages] = useState<StagedPostImage[]>([]);
  const [mentions, setMentions] = useState<MentionValue[]>([]);
  const [opportunitySource, setOpportunitySource] = useState(defaultOpportunitySource);
  const [postType, setPostType] = useState<PostType>(defaultType);
  const [relatedRolesNeeded, setRelatedRolesNeeded] = useState("");
  const [relatedStartupName, setRelatedStartupName] = useState("");
  const [tags, setTags] = useState("");
  const [title, setTitle] = useState("");
  const apiBase = `/api/org/${encodeURIComponent(slug)}/spaces/${encodeURIComponent(spaceId)}`;
  const opportunityPost = [
    "opportunity",
    "looking_for_cofounder",
    "looking_for_mentor",
  ].includes(postType);
  const titleRequired = postType !== "general_update";
  const mediaIsBlocking = images.some((image) => image.status !== "ready");
  const hasContent = body.trim().length > 0 || images.some((image) => image.status === "ready");
  const formIsInvalid = !hasContent || (titleRequired && !title.trim()) || mediaIsBlocking;
  const stateMessage = state.error || state.message;
  const bodyError = fieldError(state, "body");
  const titleError = fieldError(state, "title");

  return (
    <form
      action={formAction}
      className="space-y-5"
      onSubmit={(event) => {
        if (formIsInvalid || pending) event.preventDefault();
      }}
    >
      <input
        name="images"
        type="hidden"
        value={JSON.stringify(
          images
            .filter((image) => image.status === "ready")
            .map((image, position) => ({
              alt: image.alt.trim(),
              id: image.id,
              position,
            })),
        )}
      />
      <input name="mentions" type="hidden" value={JSON.stringify(mentions)} />

      {stateMessage ? (
        <div
          aria-live="polite"
          className="rounded-lg border border-red-500/25 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {stateMessage}
        </div>
      ) : null}

      <div>
        <Label htmlFor="type">Post type</Label>
        <Select
          id="type"
          name="type"
          onChange={(event) => {
            const nextType = event.target.value as PostType;
            setPostType(nextType);
            if (nextType === "resource") {
              setRelatedRolesNeeded("");
            }
          }}
          value={postType}
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

      {opportunityPost ? (
        <div>
          <Label htmlFor="opportunity_source">Shared by</Label>
          {canAdmin || canMentor ? (
            <Select
              id="opportunity_source"
              name="opportunity_source"
              onChange={(event) =>
                setOpportunitySource(
                  event.target.value as "member" | "mentor" | "official",
                )
              }
              value={opportunitySource}
            >
              <option value="member">Participants</option>
              {canMentor ? <option value="mentor">Mentors</option> : null}
              {canAdmin ? <option value="official">Organizers</option> : null}
            </Select>
          ) : (
            <>
              <Input
                disabled
                id="opportunity_source"
                value={
                  defaultOpportunitySource === "official"
                    ? "Organizers"
                    : defaultOpportunitySource === "mentor"
                      ? "Mentors"
                      : "Participants"
                }
              />
              <input
                name="opportunity_source"
                type="hidden"
                value={opportunitySource}
              />
            </>
          )}
        </div>
      ) : null}

      <div>
        <Label htmlFor="title">
          Title{" "}
          {!titleRequired ? (
            <span className="font-normal text-[var(--ink-soft)]">(optional)</span>
          ) : null}
        </Label>
        <Input
          aria-describedby={titleError ? "post-title-error" : undefined}
          aria-invalid={Boolean(titleError)}
          id="title"
          maxLength={160}
          name="title"
          onChange={(event) => setTitle(event.target.value)}
          placeholder={
            titleRequired ? "Clear, specific headline" : "Add a headline if it helps"
          }
          required={titleRequired}
          value={title}
        />
        {titleError ? (
          <p className="mt-1 text-xs text-red-700" id="post-title-error">
            {titleError}
          </p>
        ) : null}
      </div>

      <div>
        <Label htmlFor="body">
          Details <span className="font-normal text-[var(--ink-soft)]">(optional with an image)</span>
        </Label>
        <MentionTextarea
          candidateEndpoint={`${apiBase}/mention-candidates`}
          describedBy={bodyError ? "post-body-help post-body-error" : "post-body-help"}
          id="body"
          invalid={Boolean(bodyError)}
          maxLength={10_000}
          mentions={mentions}
          name="body"
          onChange={setBody}
          onMentionsChange={setMentions}
          placeholder="Add details, paste a link, or type @ to mention someone."
          rows={7}
          submitDisabled={formIsInvalid || pending}
          value={body}
        />
        <div className="mt-1 flex items-start justify-between gap-3 text-xs text-[var(--ink-soft)]">
          <p id="post-body-help">Only members selected from the @ menu will be notified.</p>
          <span aria-label={`${body.length} of 10000 characters`}>{body.length}/10,000</span>
        </div>
        {bodyError ? (
          <p className="mt-1 text-xs text-red-700" id="post-body-error">
            {bodyError}
          </p>
        ) : null}
      </div>

      {imageUploadsEnabled ? (
        <PostImageUploadField
          endpoint={`${apiBase}/post-images/upload`}
          images={images}
          memoryUpload={memoryImageUploads}
          membershipId={membershipId}
          setImages={setImages}
          spaceId={spaceId}
        />
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--ink-soft)]">
          <ImageOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>Image uploads are currently unavailable. You can still publish text, links, and mentions.</p>
        </div>
      )}

      <LinkPreviewComposer
        appOrigin={appOrigin}
        body={body}
        endpoint={`${apiBase}/link-preview`}
      />

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <Label htmlFor="tags">Tags</Label>
          <Input
            id="tags"
            name="tags"
            onChange={(event) => setTags(event.target.value)}
            placeholder="climate, sales, design"
            value={tags}
          />
        </div>
        <div>
          <Label htmlFor="related_startup_name">Related startup</Label>
          <Input
            id="related_startup_name"
            name="related_startup_name"
            onChange={(event) => setRelatedStartupName(event.target.value)}
            placeholder="Optional"
            value={relatedStartupName}
          />
        </div>
        {postType === "resource" ? null : (
          <div className="md:col-span-2">
            <Label htmlFor="related_roles_needed">Roles needed</Label>
            <Input
              id="related_roles_needed"
              name="related_roles_needed"
              onChange={(event) => setRelatedRolesNeeded(event.target.value)}
              placeholder="technical, design, GTM"
              value={relatedRolesNeeded}
            />
          </div>
        )}
      </div>

      {!hasContent ? (
        <p className="text-xs text-[var(--ink-soft)]">Add text, a link, or at least one image to publish.</p>
      ) : null}
      {mediaIsBlocking ? (
        <p aria-live="polite" className="text-xs text-[var(--ink-soft)]">
          Finish or remove every image upload before publishing.
        </p>
      ) : null}

      <SubmitButton
        className="w-full"
        disabled={formIsInvalid || pending}
        pendingLabel={opportunityMode ? "Publishing opportunity" : "Publishing post"}
      >
        <Send className="size-4" aria-hidden="true" />
        {opportunityMode
          ? `Publish opportunity in ${communityName}`
          : `Publish post in ${communityName}`}
      </SubmitButton>
    </form>
  );
}
