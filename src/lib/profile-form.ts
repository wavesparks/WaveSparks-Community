import { nanoid } from "nanoid";

import { parseBoolean, parseTags } from "@/lib/utils";
import type { MatchTypeConfig, Membership, Profile, ProfileLink, User } from "@/lib/domain";
import { getProfileReadiness } from "@/lib/activation";
import { legacySeekingMatchTypes } from "@/lib/match-config";
import { canonicalLegacyBio } from "@/lib/profile-bio";
import { LOCAL_EMBEDDING_MODEL } from "@/server/embeddings";
import { buildEmbedding, buildMatchingEmbeddingTexts } from "@/server/matching";

function field(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function submittedField(formData: FormData, keys: string[], fallback = "") {
  const submittedKey = keys.find((key) => formData.has(key));
  return submittedKey ? field(formData, submittedKey) : fallback;
}

function submittedTags(formData: FormData, key: string, fallback: string[]) {
  return formData.has(key) ? parseTags(formData.get(key)) : fallback;
}

function fieldNumber(formData: FormData, key: string, fallback = 0) {
  const raw = field(formData, key);
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function submittedNumber(formData: FormData, key: string, fallback = 0) {
  return formData.has(key) ? fieldNumber(formData, key, fallback) : fallback;
}

function submittedBoolean(formData: FormData, key: string, fallback: boolean) {
  return formData.has(key) ? parseBoolean(formData.get(key)) : fallback;
}

function bioExcerpt(value: string, maxLength = 180) {
  if (value.length <= maxLength) {
    return value;
  }

  const excerpt = value.slice(0, maxLength + 1);
  const lastSpace = excerpt.lastIndexOf(" ");
  return `${excerpt.slice(0, lastSpace > maxLength * 0.6 ? lastSpace : maxLength).trimEnd()}…`;
}

export { validateProfileFormData } from "@/lib/profile-form-validation";

function completionScore(profile: Profile) {
  const checks = [
    profile.preferredName,
    profile.headline,
    profile.bio,
    profile.currentFocus,
    profile.seekingMatchTypes.length ? "yes" : "",
    profile.skillTags.length ? "yes" : "",
    profile.emailForIntro,
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
    bio: "",
    problemInterest: "",
    currentFocus: "",
    technicalExperienceLevel: "not_sure",
    technicalExperience: "",
    city: "",
    country: "",
    timezone: "Asia/Singapore",
    schoolOrCompany: "",
    currentStatus: membership.archetypes.includes("mentor") ? "mentor" : "exploring",
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
    seekingMatchTypes: [],
    offeringMatchTypes: [],
    desiredRoles: [],
    helpNeededTags: [],
    idealMatchDescription: "",
    skillTags: [],
    yearsOfExperience: 0,
    topStrengths: [],
    canContribute: [],
    priorProjects: "",
    notableWins: "",
    timeCommitment: "exploratory",
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
    commitmentHorizon: "serious experiment",
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
    seekingEmbeddingText: "",
    offeringEmbeddingText: "",
    seekingEmbedding: [],
    offeringEmbedding: [],
    embeddingModel: LOCAL_EMBEDDING_MODEL,
    embeddingStatus: "pending",
    createdAt: now,
    updatedAt: now,
  };
  const texts = buildMatchingEmbeddingTexts(base);
  base.seekingEmbeddingText = texts.seekingProfileText;
  base.offeringEmbeddingText = texts.offeringText;
  base.seekingEmbedding = buildEmbedding(texts.seekingProfileText);
  base.offeringEmbedding = buildEmbedding(texts.offeringText);
  base.profileCompletionPercent = completionScore(base);
  return base;
}

export function profileFromFormData({
  formData,
  membership,
  user,
  existingProfile,
  existingLinks = [],
  matchTypeConfigs = [],
}: {
  formData: FormData;
  membership: Membership;
  user: User;
  existingProfile?: Profile;
  existingLinks?: ProfileLink[];
  matchTypeConfigs?: MatchTypeConfig[];
}) {
  const now = new Date().toISOString();
  const profile = existingProfile
    ? { ...existingProfile }
    : emptyProfileForMember(user, membership);

  profile.fullName = submittedField(formData, ["full_name"], profile.fullName) || user.name;
  profile.preferredName =
    submittedField(formData, ["preferred_name"], profile.preferredName) || profile.preferredName;
  profile.displayNamePreference =
    submittedField(formData, ["display_name_preference"], profile.displayNamePreference) ||
    "preferred_name";
  profile.profilePhoto =
    submittedField(formData, ["profile_photo"], profile.profilePhoto) || user.imageUrl;
  profile.city = submittedField(formData, ["city"], profile.city);
  profile.country = submittedField(formData, ["country"], profile.country);
  profile.timezone =
    submittedField(formData, ["timezone"], profile.timezone) || "Asia/Singapore";
  profile.schoolOrCompany = submittedField(
    formData,
    ["school_or_company"],
    profile.schoolOrCompany,
  );
  profile.currentStatus = submittedField(
    formData,
    ["current_status"],
    profile.currentStatus,
  );
  profile.headline = submittedField(formData, ["headline"], profile.headline);
  const existingBio = profile.bio || canonicalLegacyBio(profile.shortBio, profile.longBio);
  if (formData.has("bio")) {
    // The current form has one canonical field, so an empty value is an
    // intentional clear rather than a cue to fall back to legacy content.
    profile.bio = field(formData, "bio");
  } else if (formData.has("long_bio") || formData.has("short_bio")) {
    // Older clients submitted both fields. Prefer the richer answer, while
    // still retaining a short-only answer when the long field was left blank.
    profile.bio = canonicalLegacyBio(
      field(formData, "short_bio"),
      field(formData, "long_bio"),
    );
  } else {
    profile.bio = existingBio;
  }
  // Keep the old columns synchronized during the migration window. The short
  // value is derived, never collected as a second answer.
  profile.longBio = profile.bio;
  profile.shortBio = bioExcerpt(profile.bio);
  profile.problemInterest = submittedField(
    formData,
    ["problem_interest"],
    profile.problemInterest,
  );
  profile.currentFocus = submittedField(
    formData,
    ["current_focus"],
    profile.currentFocus,
  );
  profile.technicalExperienceLevel = submittedField(
    formData,
    ["technical_experience_level"],
    profile.technicalExperienceLevel || "not_sure",
  );
  profile.technicalExperience = submittedField(
    formData,
    ["technical_experience"],
    profile.technicalExperience,
  );
  profile.startupName = submittedField(formData, ["startup_name"], profile.startupName);
  profile.startupOneLiner = submittedField(
    formData,
    ["startup_one_liner"],
    profile.startupOneLiner,
  );
  profile.startupDescription = submittedField(
    formData,
    ["startup_description"],
    profile.startupDescription,
  );
  profile.stage = submittedField(formData, ["stage"], profile.stage);
  profile.industryTags = submittedTags(formData, "industry_tags", profile.industryTags);
  profile.problemSpaceTags = submittedTags(
    formData,
    "problem_space_tags",
    profile.problemSpaceTags,
  );
  profile.businessModelTags = submittedTags(
    formData,
    "business_model_tags",
    profile.businessModelTags,
  );
  profile.currentProgress = submittedField(
    formData,
    ["current_progress"],
    profile.currentProgress,
  );
  profile.tractionSummary = submittedField(
    formData,
    ["traction_summary"],
    profile.tractionSummary,
  );
  profile.regionFocus = submittedField(formData, ["region_focus"], profile.regionFocus);
  const selectedSeekingTypes = formData
    .getAll("seeking_match_types")
    .map(String)
    .filter(Boolean);
  const selectedOfferingTypes = formData
    .getAll("offering_match_types")
    .map(String)
    .filter(Boolean);
  const usesConfiguredMatchingIntent = field(formData, "matching_intent_version") === "2";
  const hasSeekingIntentSubmission =
    usesConfiguredMatchingIntent ||
    formData.has("seeking_match_types") ||
    formData.has("looking_for_types");
  const hasOfferingIntentSubmission =
    usesConfiguredMatchingIntent || formData.has("offering_match_types");
  const configBySlug = new Map(
    matchTypeConfigs.filter((config) => config.active).map((config) => [config.slug, config]),
  );
  const configuredSlugs = new Set(configBySlug.keys());
  const selectedConfiguredTypes = (values: string[]) => [
    ...new Set(values.filter((value) => configuredSlugs.has(value))),
  ];
  if (hasSeekingIntentSubmission) {
    profile.seekingMatchTypes = usesConfiguredMatchingIntent
      ? selectedConfiguredTypes(selectedSeekingTypes)
      : selectedSeekingTypes.length
        ? [...new Set(selectedSeekingTypes)]
        : legacySeekingMatchTypes(parseTags(formData.get("looking_for_types")));
    profile.lookingForTypes = profile.seekingMatchTypes.map(
      (slug) => configBySlug.get(slug)?.name ?? slug,
    );
  }
  if (hasOfferingIntentSubmission) {
    profile.offeringMatchTypes = usesConfiguredMatchingIntent
      ? selectedConfiguredTypes(selectedOfferingTypes)
      : selectedOfferingTypes.length
        ? [...new Set(selectedOfferingTypes)]
        : [];
  } else if (!existingProfile || formData.has("looking_for_types")) {
    // Legacy forms only described what a member was looking for. Preserve the
    // historical symmetric defaults for those submissions.
    profile.offeringMatchTypes = [
      ...(profile.seekingMatchTypes.includes("cofounder_match") ? ["cofounder_match"] : []),
      ...(profile.seekingMatchTypes.includes("collaborator_match")
        ? ["collaborator_match"]
        : []),
      ...(membership.archetypes.includes("mentor") ? ["mentor_match"] : []),
    ];
  }
  profile.desiredRoles = submittedTags(formData, "desired_roles", profile.desiredRoles);
  profile.helpNeededTags = submittedTags(formData, "help_needed_tags", profile.helpNeededTags);
  profile.idealMatchDescription = submittedField(
    formData,
    ["ideal_match_description"],
    profile.idealMatchDescription,
  );
  profile.skillTags = submittedTags(formData, "skill_tags", profile.skillTags);
  profile.yearsOfExperience = submittedNumber(
    formData,
    "years_of_experience",
    profile.yearsOfExperience,
  );
  profile.topStrengths = submittedTags(formData, "top_strengths", profile.topStrengths);
  profile.canContribute = submittedTags(formData, "can_contribute", profile.canContribute);
  profile.priorProjects = submittedField(formData, ["prior_projects"], profile.priorProjects);
  profile.notableWins = submittedField(formData, ["notable_wins"], profile.notableWins);
  profile.timeCommitment = submittedField(
    formData,
    ["time_commitment"],
    profile.timeCommitment,
  );
  profile.availabilityStart = submittedField(
    formData,
    ["availability_start"],
    profile.availabilityStart,
  );
  profile.remotePreference = submittedField(
    formData,
    ["remote_preference"],
    profile.remotePreference,
  );
  profile.preferredGeographies = submittedTags(
    formData,
    "preferred_geographies",
    profile.preferredGeographies,
  );
  profile.meetingFrequencyPreference = submittedField(
    formData,
    ["meeting_frequency_preference"],
    profile.meetingFrequencyPreference,
  );
  profile.ambitionLevel = submittedNumber(formData, "ambition_level", profile.ambitionLevel);
  profile.riskTolerance = submittedNumber(formData, "risk_tolerance", profile.riskTolerance);
  profile.speedPreference = submittedField(
    formData,
    ["speed_preference"],
    profile.speedPreference,
  );
  profile.decisionStyle = submittedField(
    formData,
    ["decision_style"],
    profile.decisionStyle,
  );
  profile.workStyle = submittedField(formData, ["work_style"], profile.workStyle);
  profile.communicationStyle = submittedField(
    formData,
    ["communication_style"],
    profile.communicationStyle,
  );
  profile.conflictStyle = submittedField(
    formData,
    ["conflict_style"],
    profile.conflictStyle,
  );
  profile.commitmentHorizon = submittedField(
    formData,
    ["commitment_horizon"],
    profile.commitmentHorizon,
  );
  profile.missionVsMarketOrientation = submittedField(
    formData,
    ["mission_vs_market_orientation"],
    profile.missionVsMarketOrientation,
  );
  profile.structureVsChaos = submittedNumber(
    formData,
    "structure_vs_chaos",
    profile.structureVsChaos,
  );
  profile.mentorExpertiseTags = submittedTags(
    formData,
    "mentor_expertise_tags",
    profile.mentorExpertiseTags,
  );
  profile.mentorStageExperience = submittedTags(
    formData,
    "mentor_stage_experience",
    profile.mentorStageExperience,
  );
  profile.mentorFunctionalStrengths = submittedTags(
    formData,
    "mentor_functional_strengths",
    profile.mentorFunctionalStrengths,
  );
  profile.mentorAvailability = submittedField(
    formData,
    ["mentor_availability"],
    profile.mentorAvailability,
  );
  profile.mentorOffers = submittedTags(formData, "mentor_offers", profile.mentorOffers);
  profile.maxMentees = formData.has("max_mentees")
    ? field(formData, "max_mentees")
    ? fieldNumber(formData, "max_mentees")
    : null
    : profile.maxMentees;
  profile.mentorshipPreferences = submittedField(
    formData,
    ["mentorship_preferences"],
    profile.mentorshipPreferences,
  );
  profile.publicContactEnabled = submittedBoolean(
    formData,
    "public_contact_enabled",
    profile.publicContactEnabled,
  );
  profile.emailForIntro =
    submittedField(formData, ["email_for_intro"], profile.emailForIntro) || user.email;
  profile.whatsappNumber = submittedField(
    formData,
    ["whatsapp_number"],
    profile.whatsappNumber,
  );
  const isFullProfileForm = field(formData, "profile_form_version") === "2";
  profile.whatsappVisibleAfterAccept = isFullProfileForm
    ? parseBoolean(formData.get("whatsapp_visible_after_accept"))
    : submittedBoolean(
        formData,
        "whatsapp_visible_after_accept",
        profile.whatsappVisibleAfterAccept,
      );
  profile.introOptIn = isFullProfileForm
    ? parseBoolean(formData.get("intro_opt_in"))
    : submittedBoolean(formData, "intro_opt_in", profile.introOptIn);
  // Matching visibility is now controlled independently by each Space intent.
  // Keep the legacy field stable during the compatibility window so editing a
  // global profile cannot silently opt someone out of every Space.
  profile.profileVisibleInMatching = existingProfile?.profileVisibleInMatching ?? true;
  profile.lastActiveAt = now;
  profile.updatedAt = now;
  const texts = buildMatchingEmbeddingTexts(profile);
  const matchingTextChanged =
    !existingProfile ||
    existingProfile.seekingEmbeddingText !== texts.seekingProfileText ||
    existingProfile.offeringEmbeddingText !== texts.offeringText;
  if (matchingTextChanged) {
    profile.seekingEmbeddingText = texts.seekingProfileText;
    profile.offeringEmbeddingText = texts.offeringText;
    profile.seekingEmbedding = buildEmbedding(texts.seekingProfileText);
    profile.offeringEmbedding = buildEmbedding(texts.offeringText);
    profile.embeddingModel = LOCAL_EMBEDDING_MODEL;
    profile.embeddingSourceHash = undefined;
    profile.embeddingStatus = "pending";
    profile.embeddingError = undefined;
    profile.embeddingUpdatedAt = undefined;
  }
  const readiness = getProfileReadiness(profile);
  profile.onboardingComplete = readiness.isReady;
  profile.profileCompletionPercent = readiness.completionPercent;

  const linkFields = ["linkedin_url", "github_url", "website_url", "x_url"] as const;
  const hasLinkSubmission = linkFields.some((key) => formData.has(key));
  let links: ProfileLink[] | undefined;
  if (!existingProfile || isFullProfileForm) {
    links = linkFields
      .map((key) => ({
        id: `lnk_${nanoid(8)}`,
        profileId: profile.id,
        type: key.replace("_url", "") as ProfileLink["type"],
        url: field(formData, key),
      }))
      .filter((link) => link.url);
  } else if (hasLinkSubmission) {
    const submittedTypes = new Set(
      linkFields
        .filter((key) => formData.has(key))
        .map((key) => key.replace("_url", "") as ProfileLink["type"]),
    );
    links = [
      ...existingLinks.filter((link) => !submittedTypes.has(link.type)),
      ...linkFields
        .filter((key) => formData.has(key))
        .map((key) => ({
          id: `lnk_${nanoid(8)}`,
          profileId: profile.id,
          type: key.replace("_url", "") as ProfileLink["type"],
          url: field(formData, key),
        }))
        .filter((link) => link.url),
    ];
  }

  return { profile, links };
}
