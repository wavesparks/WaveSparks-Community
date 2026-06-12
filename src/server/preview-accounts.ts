import { seedOrganization, seedProfiles } from "@/data/seed-data";
import type {
  AffiliationType,
  MembershipRole,
  Profile,
} from "@/lib/domain";
import { buildEmbedding, buildEmbeddingText } from "@/server/matching";
import {
  createManagedAccount,
  upsertProfile,
} from "@/server/store";

export type PreviewAccountKind = "admin" | "mentor" | "founder";

export interface PreviewAccountSpec {
  kind: PreviewAccountKind;
  label: string;
  email: string;
  name: string;
  role: MembershipRole;
  affiliationType: AffiliationType;
  archetypes: string[];
  programName: string;
  cohortNameOrYear: string;
  profileTemplateId: string;
  headline: string;
  shortBio: string;
}

export const previewAccountSpecs = [
  {
    kind: "admin",
    label: "Admin preview",
    email: "preview.admin@wavesparks.co",
    name: "Preview Admin",
    role: "org_admin",
    affiliationType: "current participant",
    archetypes: ["operator", "mentor"],
    programName: "Wavespark Preview",
    cohortNameOrYear: "Admin",
    profileTemplateId: "pro_avery",
    headline: "Preview admin with full member and admin access",
    shortBio: "Use this account to review member approval, moderation, and admin analytics surfaces.",
  },
  {
    kind: "mentor",
    label: "Mentor preview",
    email: "preview.mentor@wavesparks.co",
    name: "Preview Mentor",
    role: "member",
    affiliationType: "mentor",
    archetypes: ["mentor"],
    programName: "Wavespark Preview",
    cohortNameOrYear: "Mentor",
    profileTemplateId: "pro_marcus",
    headline: "Preview mentor with matching and intro access",
    shortBio: "Use this account to review mentor match cards, intro requests, and member-only feed actions.",
  },
  {
    kind: "founder",
    label: "Founder preview",
    email: "preview.founder@wavesparks.co",
    name: "Preview Founder",
    role: "member",
    affiliationType: "current participant",
    archetypes: ["founder", "cofounder_seeker", "mentee"],
    programName: "Wavespark Preview",
    cohortNameOrYear: "Founder",
    profileTemplateId: "pro_jules",
    headline: "Preview founder building and searching for collaborators",
    shortBio: "Use this account to review the founder feed, posting, matches, and intro flow.",
  },
] as const satisfies PreviewAccountSpec[];

function profileTemplate(id: string) {
  const template = seedProfiles.find((profile) => profile.id === id);

  if (!template) {
    throw new Error(`Missing preview profile template: ${id}`);
  }

  return template;
}

function buildPreviewProfile(spec: PreviewAccountSpec, membershipId: string) {
  const now = new Date().toISOString();
  const template = profileTemplate(spec.profileTemplateId);
  const profile: Profile = {
    ...template,
    id: `pro_preview_${spec.kind}`,
    membershipId,
    fullName: spec.name,
    preferredName: spec.name.replace(/^Preview\s+/, ""),
    profilePhoto: `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(spec.name)}`,
    headline: spec.headline,
    shortBio: spec.shortBio,
    longBio: `${spec.shortBio} This profile is reserved for product preview and QA validation.`,
    schoolOrCompany: "Wavespark",
    currentStatus: spec.kind,
    startupName: spec.kind === "founder" ? "Preview Startup" : "Wavespark",
    startupOneLiner:
      spec.kind === "founder"
        ? "A preview startup used to validate the founder journey."
        : "Preview account used to validate Wavespark role permissions.",
    startupDescription:
      spec.kind === "founder"
        ? "A test founder profile with complete onboarding, posting, matching, and intro access."
        : "A test profile with complete onboarding for role-specific product review.",
    lookingForTypes:
      spec.kind === "mentor" ? ["founders"] : ["cofounder", "mentor", "collaborators"],
    desiredRoles: spec.kind === "founder" ? ["engineering", "growth"] : template.desiredRoles,
    canContribute:
      spec.kind === "admin"
        ? ["member operations", "moderation", "admin review"]
        : template.canContribute,
    emailForIntro: spec.email,
    profileCompletionPercent: 100,
    lastActiveAt: now,
    featured: true,
    stale: false,
    onboardingComplete: true,
    createdAt: template.createdAt,
    updatedAt: now,
    embeddingText: "",
    profileEmbedding: [],
  };
  profile.embeddingText = buildEmbeddingText(profile);
  profile.profileEmbedding = buildEmbedding(profile.embeddingText);
  return profile;
}

export async function provisionPreviewAccounts({
  password,
  orgId = seedOrganization.id,
}: {
  password: string;
  orgId?: string;
}) {
  if (password.trim().length < 12) {
    throw new Error("Preview account password must be at least 12 characters.");
  }

  const provisioned = [];

  for (const spec of previewAccountSpecs) {
    const { user, membership } = await createManagedAccount({
      orgId,
      email: spec.email,
      name: spec.name,
      password,
      role: spec.role,
      status: "approved",
      affiliationType: spec.affiliationType,
      archetypes: [...spec.archetypes],
      programName: spec.programName,
      cohortNameOrYear: spec.cohortNameOrYear,
      approvalNote: "Provisioned preview test account.",
    });
    const profile = await upsertProfile(
      buildPreviewProfile(spec, membership.id),
      [],
      { orgId },
    );

    provisioned.push({ spec, user, membership, profile });
  }

  return provisioned;
}
