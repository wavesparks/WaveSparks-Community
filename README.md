# Wavespark Community Platform

Semi-private, admin-gated founder community software for Wavespark and future client communities.

## What’s in this MVP

- Multi-tenant org routing under `/org/[slug]`
- Clerk-backed invitation-only account creation and sign-in
- Structured onboarding and profile completion flow
- Community feed, limited member directory, knowledge library, opportunities, post detail, comments, saved posts, and intro requests
- Admin-configurable AI matching with separate seeking/offering intent, explainable scoring, and feedback
- Admin console for cohort pools, approvals, moderation, manual intros, analytics, and org settings
- Drizzle schema, generated SQL migration, seed script, and match recompute cron stub

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS v4
- Clerk user management
- Drizzle ORM + drizzle-kit
- PostgreSQL-ready schema with `pgvector`
- Vitest + Playwright

## Lifecycle guides

- [User lifecycle guide](docs/user-lifecycle-guide.md)
- [Admin lifecycle guide](docs/admin-lifecycle-guide.md)
- [AI matching engine](docs/ai-matching-engine.md)

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

- Authentication is handled by Clerk. The Vercel Clerk integration auto-provisions `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.
- `CLERK_JWT_KEY` is optional but recommended so the OAuth handoff API can verify client session tokens directly during preview-domain sign-in flows.
- If Clerk keys are missing, authenticated app areas are unavailable until `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are configured.
- Admins can create event cohorts from `/org/wavespark/admin/cohorts`, import students into a waitlist pool, and promote selected students into the main community.
- Admins invite or update members from `/org/wavespark/admin/members`. Wavespark confirms the Clerk membership or targeted invitation before reporting success and stores the Clerk state locally.
- Public registration and shared invitation codes are disabled. New accounts start at `/org/wavespark/accept-invitation` from a personal Clerk ticket.
- Do not use Clerk Dashboard as the daily invitation surface. Dashboard invitations cannot establish the complete Wavespark review workflow.
- Clerk owns identity, primary email, credentials, and sessions. Wavespark Admin actions own organization roles and membership; Wavespark stores approval, profiles, content, and matching.
- `letsbuild@wavesparks.co` is a default bootstrap admin. Add more comma-separated admin emails with `WAVESPARK_ADMIN_EMAILS`.

## Database workflow

Generate SQL from the Drizzle schema:

```bash
pnpm db:generate
```

Run migrations against Postgres:

```bash
pnpm db:migrate -- --environment=development
pnpm db:migrate -- --environment=development --apply
```

Seed the database when `DATABASE_URL` is configured:

```bash
pnpm db:seed -- --environment=development --apply
```

If `DATABASE_URL` is absent, the app still runs with the in-memory seeded community dataset used by the UI and tests.

Provision production-style preview accounts for role testing:

```bash
pnpm db:preview-accounts -- --environment=development --apply
```

This creates or updates one approved admin, mentor, and founder account. Set
up matching Clerk users or invitations for the printed emails to sign in. The
script writes a summary to `/tmp/wavesparks-preview-accounts.txt`.

Preview or reconcile Clerk Organizations:

```bash
pnpm clerk:reconcile -- --environment=development
pnpm clerk:reconcile -- --environment=development --apply
pnpm clerk:reconcile -- --environment=production
```

Reconciliation is dry-run by default. Production is preview-only and writes
`/tmp/wavespark-clerk-reconcile-production.json`; production apply is blocked.

## Useful scripts

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm test:e2e:clerk
pnpm build
pnpm cron:matches -- --environment=development
pnpm readiness:prod
pnpm clerk:reconcile -- --environment=development
pnpm env:audit
```

## Production rollout checklist

Before promoting a deployment to production:

1. Configure production environment variables in Vercel:

```bash
NEXT_PUBLIC_APP_URL=https://app.wavesparks.co
DATABASE_URL=<postgres-url-with-pgvector>
OPENAI_API_KEY=<production-embedding-key>
CRON_SECRET=<long-random-secret>
WAVESPARK_ADMIN_EMAILS=letsbuild@wavesparks.co
BLOB_READ_WRITE_TOKEN=<vercel-blob-read-write-token>
# Optional custom notification email delivery:
RESEND_API_KEY=<resend-key>
RESEND_FROM_EMAIL=<verified-sender>
```

The Vercel Clerk integration should supply `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
`CLERK_SECRET_KEY`. Clerk production domains also need the DNS records shown in the
Clerk Dashboard, including the Frontend API CNAME:

For preview-domain OAuth handoff, also add Clerk's JWT verification key as
`CLERK_JWT_KEY` when available from the Clerk Dashboard. Keep `CLERK_SECRET_KEY`
configured too; the app still uses it for Clerk backend operations.

```bash
clerk.wavesparks.co CNAME frontend-api.clerk.services
```

Only set `NEXT_PUBLIC_CLERK_PROXY_URL` after enabling proxying for the domain in
Clerk. Without that Clerk-side domain setting, proxied Frontend API requests are
rejected as an invalid host.

Add the webhook signing secret from the Clerk webhook endpoint too:

```bash
CLERK_WEBHOOK_SIGNING_SECRET=<whsec_...>
```

Optional Clerk route overrides are only needed if you want Clerk's
global defaults to match the Wavespark org routes:

```bash
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/org/wavespark/signin
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/org/wavespark/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/org/wavespark
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/org/wavespark
```

Keep the Clerk application home URL and custom sign-in routes pointed at the community app
domain, not the marketing site. Create invitations from Wavespark Admin so they use the
dedicated `/org/wavespark/accept-invitation` redirect.

2. Run the production checks and database setup:

```bash
pnpm readiness:prod
pnpm db:migrate -- --environment=production
pnpm clerk:reconcile -- --environment=production
```

Production database writes require both `--apply` and `--confirm-production`. This release
does not apply Clerk reconciliation changes to production.

`pnpm readiness:prod` expects the real production environment to be present, as it is in
Vercel/CI. It blocks localhost URLs, placeholder secrets, Clerk test keys, and partial
Resend configuration before the deployment is promoted. Missing Resend configuration is
a warning because Clerk organization invitations still send through Clerk, but custom
product notification emails will be skipped.

3. Confirm DNS points the app domain to Vercel. `app.wavesparks.co` should resolve to Vercel before it becomes the member-facing URL.

4. Keep Vercel Authentication on preview deployments only. Production access should be controlled by the app sign-in, onboarding, and approval flow.

5. After the first admin signs in through Clerk, create event cohorts from the admin cohorts page or invite managed members from the admin members page.

For future Clerk work in this project, install Clerk skills and restart the agent after installation:

```bash
npx skills add clerk/skills
```

## Verification

The current implementation was verified with:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm test:e2e:clerk
pnpm build
pnpm readiness:prod
```

## Notes

- Member discovery uses a limited approved-member directory. Regular members can search safe profile summaries, but contact details remain hidden.
- Contact details remain hidden until an intro request is accepted.
- Upload routes for avatars and org logos use Vercel Blob and expect `BLOB_READ_WRITE_TOKEN`.
- Email notifications use Resend when configured and otherwise log the attempted delivery.
