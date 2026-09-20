import { beforeEach, describe, expect, it } from "vitest";
import { seedOrganization } from "@/data/seed-data";
import { normalizeImportedProfile } from "@/lib/member-import-profile";
import { spaceIntentDefaults } from "@/lib/space-intent-defaults";
import { getAdminMemberDisplayName } from "@/lib/member-display-name";
import { parseMemberImportFile } from "@/server/member-import-file";
import { fillImportedProfile } from "@/server/member-import-profile";
import { buildMemberImportPreview } from "@/server/member-import";
import { createManagedAccount, defaultMainSpaceIdForOrg, getProfileByMembershipId, getStore, resetStore } from "@/server/store";

describe("feedback profile imports", () => {
  beforeEach(() => resetStore());

  it("maps questionnaire headers independently from full name", async () => {
    const parsed = await parseMemberImportFile({ fileName: "responses.csv", contentType: "text/csv",
      bytes: new TextEncoder().encode("Email,Full Name,Preferred Name,About you,Intro yourself in one line,What are you exploring?,Your skills\na@example.com,Maya Tan,Wave1,About me,Student,Education,Python;Research") });
    expect(parsed.suggestedMapping).toEqual({ emailColumn: 0, nameColumn: 1,
      profileColumns: { preferred_name: 2, bio: 3, headline: 4, current_focus: 5, skill_tags: 6 } });
  });

  it("creates a complete editable profile without granting mentor or admin status", async () => {
    const account = await createManagedAccount({ orgId: seedOrganization.id, email: "profile-import@example.com", name: "Maya Tan", role: "member", status: "pending", invitedByUserId: "usr_avery" });
    const profile = { preferred_name: "Maya", headline: "Student founder", bio: "Building learning tools", current_focus: "Education tools", skill_tags: "Python;User research", seeking_match_types: "Collaborators;Mentors", mentor_expertise_tags: "Leadership" };
    expect(await fillImportedProfile({ ...account, profile })).toBe(true);
    const saved = (await getProfileByMembershipId(account.membership.id))!;
    expect(saved).toMatchObject({ fullName: "Maya Tan", preferredName: "Maya", headline: "Student founder", bio: "Building learning tools", skillTags: ["Python", "User research"], seekingMatchTypes: ["collaborator_match", "mentor_match"], offeringMatchTypes: ["collaborator_match"], mentorExpertiseTags: [], onboardingComplete: true });
    expect(account.membership).toMatchObject({ role: "member", mentorStatus: "not_mentor", accountStatus: "invited" });
    saved.headline = "Member's own edited introduction";
    expect(await fillImportedProfile({ ...account, profile: { ...profile, headline: "Overwrite", industry_tags: "EdTech" } })).toBe(true);
    expect(await getProfileByMembershipId(account.membership.id)).toMatchObject({ headline: "Member's own edited introduction", industryTags: ["EdTech"] });
    expect(await fillImportedProfile({ ...account, profile })).toBe(false);
    expect(getAdminMemberDisplayName({ user: account.user, profile: saved })).toBe("Maya Tan (Maya)");
  });

  it("validates profile fields again on the server and rejects inactive match types", async () => {
    expect(normalizeImportedProfile({ headline: "x".repeat(241) }).error).toContain("240");
    expect(normalizeImportedProfile({ bio: "=IMPORTXML(secret)" }).error).toContain("formula");
    const preview = await buildMemberImportPreview(seedOrganization, { destinationSpaceId: defaultMainSpaceIdForOrg(seedOrganization.id), accessStatus: "active", rows: [{ rowNumber: 2, email: "new@example.com", name: "Person", profile: { seeking_match_types: "nonexistent" } }] });
    expect(preview.rows[0].classification).toBe("invalid");
  });

  it("prefills from a profile while preserving saved Space edits and opt-out", () => {
    const profile = getStore().profiles[0];
    const defaults = spaceIntentDefaults(profile);
    expect(defaults.currentGoal).toBe(profile.currentFocus || profile.idealMatchDescription || profile.startupOneLiner);
    expect(defaults.offers).toEqual(expect.arrayContaining(profile.skillTags));
    const intent = { ...getStore().spaceIntents[0], currentGoal: "Different goal", lookingFor: ["Python"], matchingOptIn: false };
    expect(spaceIntentDefaults(profile, intent)).toBe(intent);
  });
});
