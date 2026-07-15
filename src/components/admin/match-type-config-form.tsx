import { saveMatchTypeConfigAction } from "@/actions/admin";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import type { MatchFactorKey, MatchTypeConfig } from "@/lib/domain";
import { balancedMatchWeights, matchFactorLabels } from "@/lib/match-config";

const factorKeys: MatchFactorKey[] = [
  "semantic",
  "skills",
  "venture",
  "availability",
  "work_style",
  "location",
];

export function MatchTypeConfigForm({
  config,
  slug,
}: {
  config?: MatchTypeConfig;
  slug: string;
}) {
  const weights = config?.weights ?? balancedMatchWeights;
  return (
    <Card className="space-y-5">
      <form
        action={saveMatchTypeConfigAction.bind(null, slug, config?.slug ?? null)}
        className="space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--ink)]">
              {config?.name ?? "New matching type"}
            </h3>
          </div>
          <label className="flex min-h-10 items-center gap-2 text-sm font-medium text-[var(--ink)]">
            <input
              className="size-4 accent-[var(--accent)]"
              defaultChecked={config?.active ?? true}
              name="active"
              type="checkbox"
            />
            Active
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor={`${config?.slug ?? "new"}-name`}>Name</Label>
            <Input
              defaultValue={config?.name}
              id={`${config?.slug ?? "new"}-name`}
              name="name"
              required
            />
          </div>
          <div>
            <Label htmlFor={`${config?.slug ?? "new"}-direction`}>Who should be paired?</Label>
            <Select
              defaultValue={config?.direction ?? "mutual"}
              id={`${config?.slug ?? "new"}-direction`}
              name="direction"
            >
              <option value="mutual">People looking for the same kind of connection</option>
              <option value="seeker_provider">Someone looking with someone who can help</option>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor={`${config?.slug ?? "new"}-description`}>Description</Label>
            <Textarea
              defaultValue={config?.description}
              id={`${config?.slug ?? "new"}-description`}
              name="description"
              required
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor={`${config?.slug ?? "new"}-seeker-label`}>
              Option shown under “I’m looking for”
            </Label>
            <Input
              defaultValue={config?.seekerLabel}
              id={`${config?.slug ?? "new"}-seeker-label`}
              name="seeker_label"
              required
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor={`${config?.slug ?? "new"}-provider-label`}>
              Option shown under “I can help with”
            </Label>
            <Input
              defaultValue={config?.providerLabel}
              id={`${config?.slug ?? "new"}-provider-label`}
              name="provider_label"
              required
            />
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">What matters most</p>
            <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">
              Choose how much each detail should influence suggestions. Keep the total at 100.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {factorKeys.map((key) => (
              <div key={key}>
                <Label htmlFor={`${config?.slug ?? "new"}-weight-${key}`}>
                  {matchFactorLabels[key]}
                </Label>
                <Input
                  defaultValue={weights[key]}
                  id={`${config?.slug ?? "new"}-weight-${key}`}
                  max={100}
                  min={0}
                  name={`weight_${key}`}
                  required
                  type="number"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="w-44">
            <Label htmlFor={`${config?.slug ?? "new"}-minimum-score`}>
              Minimum match quality
            </Label>
            <Input
              defaultValue={config?.minimumScore ?? 45}
              id={`${config?.slug ?? "new"}-minimum-score`}
              max={80}
              min={35}
              name="minimum_score"
              required
              type="number"
            />
          </div>
          <SubmitButton pendingLabel="Saving category">
            {config ? "Save category" : "Create category"}
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}
