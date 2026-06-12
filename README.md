# Wavespark Community Platform

Semi-private, admin-gated founder community software for Wavespark and future client communities.

## What’s in this MVP

- Multi-tenant org routing under `/org/[slug]`
- Clerk-backed sign-in/sign-up and user invitations, with local fallback auth for unconfigured development
- Structured onboarding and profile completion flow
- Community feed, limited member directory, knowledge library, opportunities, post detail, comments, saved posts, and intro requests
- AI-assisted cofounder and mentor matches with explainable scoring
- Admin console for approvals, moderation, manual intros, analytics, and org settings
- Drizzle schema, generated SQL migration, seed script, and match recompute cron stub

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS v4
- Clerk user management
- Auth.js / NextAuth local fallback credentials
- Drizzle ORM + drizzle-kit
- PostgreSQL-ready schema with `pgvector`
- Vitest + Playwright

## Local setup

1. Install dependencies:

```bash
pnpm install
```

2. Copy env vars:

```bash
cp .env.example .env.local
```

3. Start the app:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), then head to [http://localhost:3000/org/wavespark/signin](http://localhost:3000/org/wavespark/signin).

## Auth behavior

- Production authentication is handled by Clerk. The Vercel Clerk integration auto-provisions `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`; the app's org-scoped sign-in/sign-up pages pass their Clerk routes directly.
- If Clerk keys are missing, the app falls back to local Auth.js credentials and seeded demo personas so the product can still be exercised without external auth setup.
- Admins can invite or update members from `/org/wavespark/admin/members`. With Clerk configured, the action sends a Clerk invitation and stores the Wavespark membership state locally.
- `letsbuild@wavesparks.co` is a default bootstrap admin. Add more comma-separated admin emails with `WAVESPARK_ADMIN_EMAILS`.
- In local fallback mode, set `WAVESPARK_ADMIN_PASSWORD` so the bootstrap admin can sign in without Clerk.

## Database workflow

Generate SQL from the Drizzle schema:

```bash
pnpm db:generate
```

Run migrations against Postgres:

```bash
pnpm db:migrate
```

Seed the database when `DATABASE_URL` is configured:

```bash
pnpm db:seed
```

If `DATABASE_URL` is absent, the app still runs with the in-memory seeded community dataset used by the UI and tests.

Provision production-style preview accounts for role testing:

```bash
pnpm db:preview-accounts
```

This creates or updates one approved admin, mentor, and founder account. Set
`WAVESPARK_PREVIEW_PASSWORD` to control the shared temporary password; otherwise
the script generates one and writes the credentials to
`/tmp/wavesparks-preview-accounts.txt`.

## Useful scripts

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm cron:matches
pnpm readiness:prod
```

## Production rollout checklist

Before promoting a deployment to production:

1. Configure production environment variables in Vercel:

```bash
NEXT_PUBLIC_APP_URL=https://app.wavesparks.co
DATABASE_URL=<postgres-url-with-pgvector>
CRON_SECRET=<long-random-secret>
AUTH_DEV_DEMO_ENABLED=false
WAVESPARK_ADMIN_EMAILS=letsbuild@wavesparks.co
WAVESPARK_PREVIEW_PASSWORD=<strong-shared-preview-password>
RESEND_API_KEY=<resend-key>
RESEND_FROM_EMAIL=<verified-sender>
SUPABASE_URL=<supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_BUCKET=wavesparks
```

The Vercel Clerk integration should supply `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
`CLERK_SECRET_KEY`. Optional Clerk route overrides are only needed if you want Clerk's
global defaults to match the Wavespark org routes:

```bash
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/org/wavespark/signin
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/org/wavespark/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/org/wavespark
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/org/wavespark
```

2. Run the production checks and database setup:

```bash
pnpm readiness:prod
pnpm db:migrate
pnpm db:bootstrap
```

`pnpm readiness:prod` expects the real production environment to be present, as it is in
Vercel/CI. It blocks localhost URLs, placeholder secrets, Clerk test keys, demo auth, and
partial Resend/Supabase configuration before the deployment is promoted. It does not require
`NEXTAUTH_SECRET` when Clerk is configured and local fallback auth is disabled.

3. Confirm DNS points the app domain to Vercel. `app.wavesparks.co` should resolve to Vercel before it becomes the member-facing URL.

4. Keep Vercel Authentication on preview deployments only. Production access should be controlled by the app sign-in, onboarding, and approval flow.

5. After the first admin signs in through Clerk, invite managed members from the admin members page.

## Verification

The current implementation was verified with:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm readiness:prod
```

## Notes

- Member discovery uses a limited approved-member directory. Regular members can search safe profile summaries, but contact details remain hidden.
- Contact details remain hidden until an intro request is accepted.
- Upload routes for avatars and org logos are included and expect Supabase Storage credentials.
- Email notifications use Resend when configured and otherwise log the attempted delivery in development.
