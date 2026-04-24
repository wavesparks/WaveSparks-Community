# Wavespark Community Platform

Semi-private, admin-gated founder community software for Wavespark and future client communities.

## What’s in this MVP

- Multi-tenant org routing under `/org/[slug]`
- Social sign-in via Auth.js with Google, GitHub, LinkedIn, plus demo personas for local development
- Structured onboarding and profile completion flow
- Community feed, opportunities, post detail, comments, and intro requests
- AI-assisted cofounder and mentor matches with explainable scoring
- Admin console for approvals, moderation, manual intros, analytics, and org settings
- Drizzle schema, generated SQL migration, seed script, and match recompute cron stub

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS v4
- Auth.js / NextAuth
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

- If real OAuth credentials are configured, the sign-in page shows Google, GitHub, and/or LinkedIn.
- If `AUTH_DEV_DEMO_ENABLED=true`, the sign-in page also shows seeded demo personas so the product can be exercised locally without external auth setup.
- First sign-in creates a pending membership if the user is not already known to the org.

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

## Useful scripts

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm cron:matches
```

## Verification

The current implementation was verified with:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Notes

- Member discovery is intentionally limited. There is no full people directory for regular members.
- Contact details remain hidden until an intro request is accepted.
- Upload routes for avatars and org logos are included and expect Supabase Storage credentials.
- Email notifications use Resend when configured and otherwise log the attempted delivery in development.
