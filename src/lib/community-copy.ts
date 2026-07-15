import type { Space } from "@/lib/domain";

export const WAVESPARKS_COMMUNITY_NAME = "Wavesparks Community";

type SpaceNameSource = Pick<Space, "kind" | "name">;

/**
 * Product-facing name for a community or event.
 *
 * The database keeps the original main-Space name for migration compatibility,
 * but members should always see the Wavesparks brand name.
 */
export function getCommunityDisplayName(space: SpaceNameSource) {
  if (space.kind === "main") return WAVESPARKS_COMMUNITY_NAME;
  return space.name.trim() || "Event";
}

export function getCommunityTypeLabel(space: Pick<Space, "kind">) {
  return space.kind === "main" ? WAVESPARKS_COMMUNITY_NAME : "Event";
}

export function getCommunityPeopleLabels(space: Pick<Space, "kind">) {
  return space.kind === "main"
    ? ({ plural: "members", singular: "member" } as const)
    : ({ plural: "participants", singular: "participant" } as const);
}
