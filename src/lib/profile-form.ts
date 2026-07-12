import { nanoid } from "nanoid";

import { parseBoolean, parseTags } from "@/lib/utils";
import type { Membership, Profile, ProfileLink, User } from "@/lib/domain";
import { getProfileReadiness } from "@/lib/activation";
import { buildEmbedding, buildEmbeddingText } from "@/server/matching";

function field(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function fieldNumber(formData: FormData, key: string, fallback = 0) {
  const raw = field(formData, key);
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function validateProfileFormData(formData: FormData) {
  const errors: Array<{ field: string; message: string }> = [];
  const email = field(formData, "email_for_intro");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    errors.push({ field: "email_for_intro", message: "Enter a valid intro email." });
  }

  for (const key of ["linkedin_url", "github_url", "website_url", "x_url"] as const) {
    const value = field(formData, key);
    if (!value) {
      continue;
    }
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Unsupported protocol.");
      }
    } catch {
      errors.push({ field: key, message: "Links must use http:// or https://." });
    }
  }

  const ranges = [
    ["years_of_experience", 0, 80],
    ["ambition_level", 1, 5],
    ["risk_tolerance", 1, 5],
    ["structure_vs_chaos", 1, 5],
    ["max_mentees", 0, 100],
  ] as const;
  for (const [key, min, max] of ranges) {
    const raw = field(formData, key);
    if (!raw) {
      continue;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < min || value > max) {
      errors.push({ field: key, message: `Enter a whole number from ${min} to ${max}.` });
    }
  }

  return { errors, isValid: errors.length === 0 };
}

function completionScore(profile: Profile) {
  const checks = [
    profile.preferredName,
    profile.headline,
    profile.shortBio,
    profile.startupOneLiner,
    profile.startupDescription,
    profile.stage,
    profile.lookingForTypes.length ? "yes" : "",
    profile.desiredRoles.length ? "yes" : "",
    profile.skillTags.length ? "yes" : "",
    profile.helpNeededTags.length ? "yes" : "",
    profile.timeCommitment,
    profile.emailForIntro,
    profile.whatsappNumber,
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}

export function emptyProfileForMember(user: User, membership: Membership) {
  const now = new Date().toISOString();
  const base: Profile = {
    id: `pro_${nanoid(8)}`,
    membershipId: membership.id,
    fullName: user.name,
    preferredName: user.name.split(" ")[0] ?? user.name,
    displayNamePreference: "preferred_name",
    profilePhoto: user.imageUrl,
    headline: "",
    shortBio: "",
    longBio: "",
    city: "",
    country: "",
    timezone: "Asia/Singapore",
    schoolOrCompany: "",
    currentStatus: membership.archetypes.includes("mentor") ? "mentor" : "founder",
    startupName: "",
    startupOneLiner: "",
    startupDescription: "",
    stage: "exploring",
    industryTags: [],
    problemSpaceTags: [],
    businessModelTags: [],
    currentProgress: "",
    tractionSummary: "",
    regionFocus: "",
    lookingForTypes: [],
    desiredRoles: [],
    helpNeededTags: [],
    idealMatchDescription: "",
    skillTags: [],
    yearsOfExperience: 0,
    topStrengths: [],
    canContribute: [],
    priorProjects: "",
    notableWins: "",
    timeCommitment: "part time serious",
    availabilityStart: "",
    remotePreference: "remote",
    preferredGeographies: [],
    meetingFrequencyPreference: "weekly",
    ambitionLevel: 4,
    riskTolerance: 3,
    speedPreference: "balanced",
    decisionStyle: "balanced",
    workStyle: "hybrid",
    communicationStyle: "",
    conflictStyle: "",
    commitmentHorizon: "startup attempt",
    missionVsMarketOrientation: "",
    structureVsChaos: 3,
    mentorExpertiseTags: [],
    mentorStageExperience: [],
    mentorFunctionalStrengths: [],
    mentorAvailability: "",
    mentorOffers: [],
    maxMentees: null,
    mentorshipPreferences: "",
    publicContactEnabled: false,
    emailForIntro: user.email,
    whatsappNumber: "",
    whatsappVisibleAfterAccept: true,
    introOptIn: true,
    profileVisibleInMatching: true,
    profileCompletionPercent: 0,
    lastActiveAt: now,
    featured: false,
    stale: false,
    onboardingComplete: false,
    embeddingText: "",
    profileEmbedding: [],
    createdAt: now,
    updatedAt: now,
  };
  base.embeddingText = buildEmbeddingText(base);
  base.profileEmbedding = buildEmbedding(base.embeddingText);
  base.profileCompletionPercent = completionScore(base);
  return base;
}

export function profileFromFormData({
  formData,
  membership,
  user,
  existingProfile,
}: {
  formData: FormData;
  membership: Membership;
  user: User;
  existingProfile?: Profile;
}) {
  const now = new Date().toISOString();
  const profile = existingProfile
    ? { ...existingProfile }
    : emptyProfileForMember(user, membership);

  profile.fullName = field(formData, "full_name") || user.name;
  profile.preferredName = field(formData, "preferred_name") || profile.preferredName;
  profile.displayNamePreference =
    field(formData, "display_name_preference") || "preferred_name";
  profile.profilePhoto = field(formData, "profile_photo") || user.imageUrl;
  profile.city = field(formData, "city");
  profile.country = field(formData, "country");
  profile.timezone = field(formData, "timezone") || "Asia/Singapore";
  profile.schoolOrCompany = field(formData, "school_or_company");
  profile.currentStatus = field(formData, "current_status");
  profile.headline = field(formData, "headline");
  profile.shortBio = field(formData, "short_bio");
  profile.longBio = field(formData, "long_bio");
  profile.startupName = field(formData, "startup_name");
  profile.startupOneLiner = field(formData, "startup_one_liner");
  profile.startupDescription = field(formData, "startup_description");
  profile.stage = field(formData, "stage");
  profile.industryTags = parseTags(formData.get("industry_tags"));
  profile.problemSpaceTags = parseTags(formData.get("problem_space_tags"));
  profile.businessModelTags = parseTags(formData.get("business_model_tags"));
  profile.currentProgress = field(formData, "current_progress");
  profile.tractionSummary = field(formData, "traction_summary");
  profile.regionFocus = field(formData, "region_focus");
  profile.lookingForTypes = parseTags(formData.get("looking_for_types"));
  profile.desiredRoles = parseTags(formData.get("desired_roles"));
  profile.helpNeededTags = parseTags(formData.get("help_needed_tags"));
  profile.idealMatchDescription = field(formData, "ideal_match_description");
  profile.skillTags = parseTags(formData.get("skill_tags"));
  profile.yearsOfExperience = fieldNumber(formData, "years_of_experience");
  profile.topStrengths = parseTags(formData.get("top_strengths"));
  profile.canContribute = parseTags(formData.get("can_contribute"));
  profile.priorProjects = field(formData, "prior_projects");
  profile.notableWins = field(formData, "notable_wins");
  profile.timeCommitment = field(formData, "time_commitment");
  profile.availabilityStart = field(formData, "availability_start");
  profile.remotePreference = field(formData, "remote_preference");
  profile.preferredGeographies = parseTags(formData.get("preferred_geographies"));
  profile.meetingFrequencyPreference = field(formData, "meeting_frequency_preference");
  profile.ambitionLevel = fieldNumber(formData, "ambition_level", 4);
  profile.riskTolerance = fieldNumber(formData, "risk_tolerance", 3);
  profile.speedPreference = field(formData, "speed_preference");
  profile.decisionStyle = field(formData, "decision_style");
  profile.workStyle = field(formData, "work_style");
  profile.communicationStyle = field(formData, "communication_style");
  profile.conflictStyle = field(formData, "conflict_style");
  profile.commitmentHorizon = field(formData, "commitment_horizon");
  profile.missionVsMarketOrientation = field(
    formData,
    "mission_vs_market_orientation",
  );
  profile.structureVsChaos = fieldNumber(formData, "structure_vs_chaos", 3);
  profile.mentorExpertiseTags = parseTags(formData.get("mentor_expertise_tags"));
  profile.mentorStageExperience = parseTags(formData.get("mentor_stage_experience"));
  profile.mentorFunctionalStrengths = parseTags(
    formData.get("mentor_functional_strengths"),
  );
  profile.mentorAvailability = field(formData, "mentor_availability");
  profile.mentorOffers = parseTags(formData.get("mentor_offers"));
  profile.maxMentees = field(formData, "max_mentees")
    ? fieldNumber(formData, "max_mentees")
    : null;
  profile.mentorshipPreferences = field(formData, "mentorship_preferences");
  profile.publicContactEnabled = parseBoolean(formData.get("public_contact_enabled"));
  profile.emailForIntro = field(formData, "email_for_intro") || user.email;
  profile.whatsappNumber = field(formData, "whatsapp_number");
  profile.whatsappVisibleAfterAccept = parseBoolean(
    formData.get("whatsapp_visible_after_accept"),
  );
  profile.introOptIn = parseBoolean(formData.get("intro_opt_in"));
  profile.profileVisibleInMatching = parseBoolean(
    formData.get("profile_visible_in_matching"),
  );
  profile.lastActiveAt = now;
  profile.updatedAt = now;
  profile.embeddingText = buildEmbeddingText(profile);
  profile.profileEmbedding = buildEmbedding(profile.embeddingText);
  const readiness = getProfileReadiness(profile);
  profile.onboardingComplete = readiness.isReady;
  profile.profileCompletionPercent = readiness.completionPercent;

  const links: ProfileLink[] = [
    { id: `lnk_${nanoid(8)}`, profileId: profile.id, type: "linkedin" as const, url: field(formData, "linkedin_url") },
    { id: `lnk_${nanoid(8)}`, profileId: profile.id, type: "github" as const, url: field(formData, "github_url") },
    { id: `lnk_${nanoid(8)}`, profileId: profile.id, type: "website" as const, url: field(formData, "website_url") },
    { id: `lnk_${nanoid(8)}`, profileId: profile.id, type: "x" as const, url: field(formData, "x_url") },
  ].filter((link) => link.url);

  return { profile, links };
}
