const env = {
  appUrl: process.env.NEXTAUTH_URL ?? "http://localhost:3000",
  nextAuthSecret: process.env.NEXTAUTH_SECRET ?? "development-secret",
  databaseUrl: process.env.DATABASE_URL,
  openAiApiKey: process.env.OPENAI_API_KEY,
  resendApiKey: process.env.RESEND_API_KEY,
  resendFromEmail:
    process.env.RESEND_FROM_EMAIL ?? "hello@wavespark.community",
  cronSecret: process.env.CRON_SECRET,
  authDevDemoEnabled:
    process.env.AUTH_DEV_DEMO_ENABLED === undefined
      ? true
      : process.env.AUTH_DEV_DEMO_ENABLED === "true",
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  githubId: process.env.GITHUB_ID,
  githubSecret: process.env.GITHUB_SECRET,
  linkedinClientId: process.env.LINKEDIN_CLIENT_ID,
  linkedinClientSecret: process.env.LINKEDIN_CLIENT_SECRET,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseBucket: process.env.SUPABASE_BUCKET ?? "wavesparks",
  wavesparkAdminEmails: process.env.WAVESPARK_ADMIN_EMAILS ?? "",
};

export function isBootstrapAdminEmail(email?: string | null) {
  if (!email) {
    return false;
  }

  const adminEmails = env.wavesparkAdminEmails
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return adminEmails.includes(email.toLowerCase().trim());
}

export function isOAuthConfigured(provider: "google" | "github" | "linkedin") {
  switch (provider) {
    case "google":
      return Boolean(env.googleClientId && env.googleClientSecret);
    case "github":
      return Boolean(env.githubId && env.githubSecret);
    case "linkedin":
      return Boolean(env.linkedinClientId && env.linkedinClientSecret);
  }
}

export { env };
