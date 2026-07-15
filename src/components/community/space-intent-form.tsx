import { Sparkles } from "lucide-react";

import { saveSpaceIntentAction } from "@/actions/member";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import type { SpaceIntent } from "@/lib/domain";

export function SpaceIntentForm({
  intent,
  membershipId,
  slug,
  spaceId,
  spaceName,
}: {
  intent?: SpaceIntent;
  membershipId: string;
  slug: string;
  spaceId: string;
  spaceName: string;
}) {
  return (
    <Card className="space-y-5 border-[var(--accent)]/20 p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
          <Sparkles className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">
            Your intent for {spaceName}
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
            This context is private to this Space and only shapes matches with other
            active members here. Update it when your event goal changes.
          </p>
        </div>
      </div>

      <form
        action={saveSpaceIntentAction.bind(null, slug, spaceId, membershipId)}
        className="space-y-5"
      >
        <div>
          <Label htmlFor="space-current-goal">What are you working toward here?</Label>
          <Textarea
            className="mt-2 min-h-24"
            defaultValue={intent?.currentGoal}
            id="space-current-goal"
            name="current_goal"
            placeholder="For example: validate our climate-finance pilot and meet two design partners."
            required
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="space-looking-for">Looking for</Label>
            <Input
              className="mt-2"
              defaultValue={intent?.lookingFor.join(", ")}
              id="space-looking-for"
              name="looking_for"
              placeholder="Design partners, mentor, co-founder"
            />
            <p className="mt-1 text-xs text-[var(--ink-soft)]">Separate items with commas.</p>
          </div>
          <div>
            <Label htmlFor="space-offers">I can offer</Label>
            <Input
              className="mt-2"
              defaultValue={intent?.offers.join(", ")}
              id="space-offers"
              name="offers"
              placeholder="Growth experience, product feedback"
            />
            <p className="mt-1 text-xs text-[var(--ink-soft)]">Separate items with commas.</p>
          </div>
        </div>
        <label className="flex min-h-11 items-start gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--ink)]">
          <input
            className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
            defaultChecked={intent?.matchingOptIn ?? true}
            name="matching_opt_in"
            type="checkbox"
            value="on"
          />
          <span>
            <span className="block font-semibold">Enable AI matching in this Space</span>
            <span className="mt-1 block leading-5 text-[var(--ink-soft)]">
              Turn this off to stay in {spaceName} without appearing in its match pool.
              Your setting does not affect any other Space.
            </span>
          </span>
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs leading-5 text-[var(--ink-soft)]">
            A goal plus at least one “looking for” or “can offer” item is required for
            matching.
          </p>
          <SubmitButton pendingLabel="Saving intent">Save Space intent</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
