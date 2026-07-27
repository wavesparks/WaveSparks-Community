import { requireSpaceAccessForAction } from "@/lib/space-auth";
import { mentionDisplayNameForProfile } from "@/lib/post-content";
import {
  listActiveSpaceMemberRecords,
  listFollowedMembershipIdsForMembershipInSpace,
} from "@/server/store";

const maxQueryLength = 80;
const maxCandidates = 8;

export interface MentionCandidate {
  membershipId: string;
  displayName: string;
  photo: string;
  headline: string;
  isFollowing: boolean;
}

function json(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Cookie");
  return Response.json(body, { ...init, headers });
}

function normalizedSearchText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en");
}

function accessErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "Authentication required.") {
    return json({ error: "Authentication required." }, { status: 401 });
  }
  if (message === "The selected community or event could not be found.") {
    return json({ error: "Space not found." }, { status: 404 });
  }
  return json({ error: "You do not have access to this Space." }, { status: 403 });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string; spaceId: string }> },
) {
  const { slug, spaceId } = await context.params;
  const rawQuery = new URL(request.url).searchParams.get("q") ?? "";
  const query = rawQuery.trim();
  if (query.length > maxQueryLength) {
    return json({ error: "Search text is too long." }, { status: 400 });
  }

  let access: Awaited<ReturnType<typeof requireSpaceAccessForAction>>;
  try {
    access = await requireSpaceAccessForAction({
      slug,
      spaceId,
      requireProfile: true,
    });
  } catch (error) {
    return accessErrorResponse(error);
  }

  const records = (await listActiveSpaceMemberRecords(spaceId)).filter(
    (record) =>
      record.spaceMembership.spaceId === spaceId &&
      record.spaceMembership.orgId === access.viewer.org.id &&
      record.spaceMembership.accessStatus === "active" &&
      record.membership.orgId === access.viewer.org.id &&
      record.membership.accountStatus === "connected" &&
      record.membership.id !== access.viewer.membership.id &&
      Boolean(record.profile?.onboardingComplete),
  );
  const followedMembershipIds = new Set(
    await listFollowedMembershipIdsForMembershipInSpace(
      spaceId,
      access.viewer.membership.id,
      { followedMembershipIds: records.map((record) => record.membership.id) },
    ),
  );
  const normalizedQuery = normalizedSearchText(query);

  const candidates = records
    .flatMap((record): MentionCandidate[] => {
      if (!record.profile) return [];
      const displayName = mentionDisplayNameForProfile(record.profile);
      if (!displayName) return [];
      const headline = record.profile.headline.trim();
      const matchesQuery =
        !normalizedQuery ||
        normalizedSearchText(displayName).includes(normalizedQuery) ||
        normalizedSearchText(headline).includes(normalizedQuery);
      if (!matchesQuery) return [];

      return [
        {
          membershipId: record.membership.id,
          displayName,
          photo: record.profile.profilePhoto,
          headline,
          isFollowing: followedMembershipIds.has(record.membership.id),
        },
      ];
    })
    .sort(
      (left, right) =>
        Number(right.isFollowing) - Number(left.isFollowing) ||
        left.displayName.localeCompare(right.displayName, "en"),
    )
    .slice(0, maxCandidates);

  return json({ candidates });
}
