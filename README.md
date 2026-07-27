# Wavesparks Community Platform

Private, invitation-only founder community software for Wavesparks and future client communities.

## What’s in this MVP

- Multi-tenant organization routing under `/org/[slug]`
- Clerk-backed sign-in with application-owned, invitation-only membership
- A `My Spaces` home that separates the permanent **Main Community** from independent **Event** spaces
- Space-scoped feeds, People, Knowledge, Opportunities, saved posts, follows, introductions, notifications, and AI matching
- One global core profile plus a separate goal, needs, offers, and matching opt-in for each Space
- Admin `Members / Spaces` workspaces with CSV/XLSX import, account safety controls, Event lifecycle management, and explicit `Add to Main Community`
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

Open [http://localhost:3000](http://localhost:3000), then head to [http://localhost:3000/org/wavesparks/signin](http://localhost:3000/org/wavesparks/signin).

## Auth behavior

- Authentication is handled by Clerk. The Vercel Clerk integration auto-provisions `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.
- `CLERK_JWT_KEY` is optional but recommended so the OAuth handoff API can verify client session tokens directly during preview-domain sign-in flows.
- If Clerk keys are missing, authenticated app areas are unavailable until `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are configured.
- `memberships.account_status` represents the application-owned account relationship (`invited`, `connected`, `suspended`, or `deprovisioned`). It does not grant community access.
- `memberships.role` controls only account permissions (`member` or `org_admin`), while `memberships.mentor_status` independently records mentor designation (`not_mentor`, `needs_review`, or `approved`). `Approved mentor` never implies Admin.
- `space_memberships.access_status` is the authority for Main Community or Event access. Main and Event entitlements are independent, and one person may belong to any combination of Spaces.
- Effective access requires a connected, non-suspended account, an active entitlement for the requested Space, and a lifecycle that permits member access.
- Clerk webhooks synchronize user identity only. They never create memberships, roles, Main Community access, or Event access.
- `/org/wavesparks` is the authenticated `My Spaces` home. Canonical community routes include the Space explicitly: `/org/wavesparks/s/[spaceSlug]/...`.
- Main Community is invitation-only and has no anonymous or locked-content preview. An Event-only participant sees a locked Main card, not Main posts, people, or counts.
- `/org/wavesparks/admin/members` manages accounts and invitations. `/org/wavesparks/admin/spaces` manages the permanent Main Community and independent Events.
- Admins can upload or paste up to 100 CSV/XLSX rows, map fields, preview classifications, choose one destination Space, confirm, inspect row-level results, and retry failed invitations.
- A global Admin can audit every Space but must explicitly join a Space before appearing in its participant roster, posting, using People, or entering its matching pool.
- An Approved mentor must likewise have active access to the current Space. Only the canonical local designation enables mentor badges, service fields, mentor matching, Mentor opportunity sources, and the account-level Mentoring workspace; descriptive affiliation and archetype fields grant nothing.
- Wavesparks reports an invitation as sent only after Clerk accepts the application-level identity invitation. Clerk sends the email, while the Wavesparks one-time authorization token is stored only as a hash in Neon; delivery failures are stored on the local invitation for retry.
- Public registration and shared invitation codes are disabled. New accounts start at `/org/wavesparks/accept-invitation` from a personal, expiring Wavesparks link and complete identity verification with Clerk.
- Wavesparks Admin is the membership and authorization surface. Clerk application invitations only bootstrap identity; Clerk Organizations are intentionally unused.
- Clerk owns identity, verified email, credentials, and sessions. Wavesparks/Neon owns organizations, memberships, roles, invitation state, Space entitlements, profiles, content, and matching.
- `letsbuild@wavesparks.co` is a default bootstrap admin. Add more comma-separated admin emails with `WAVESPARK_ADMIN_EMAILS`.

## Space behavior

- Every organization has exactly one permanent Main Community. It is always active and cannot be ended or archived.
- Events move through `draft`, `upcoming`, `active`, `ended`, and `archived`. An ended Event appears under Past Events and remains fully interactive; only archive closes member access and matching.
- Posts belong to exactly one Space. Comments inherit their post's Space, and saved-post reads recheck access through the post.
- People, follows, matches, feedback, and pending introductions are isolated by Space. Promotion to Main never copies Event activity or grants access in the other direction.
- Profile and the global Inbox are account-level. Space-specific notifications carry a Space label and are reauthorized when opened.

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

The Space migration uses expand, backfill, and compatibility stages. Its preflight deliberately
aborts on duplicate memberships, orphaned records, cross-organization references, or conflicting
access data. Resolve those records explicitly; migrations do not guess which production record
to keep or silently restore rejected, suspended, or removed access.

Seed the database when `DATABASE_URL` is configured:

```bash
pnpm db:seed -- --environment=development --apply
```

If `DATABASE_URL` is absent, the app still runs with the in-memory seeded community dataset used by the UI and tests.

Provision production-style preview accounts for role testing:

```bash
pnpm db:preview-accounts -- --environment=development --apply
```

This creates or updates connected Member, Approved Mentor, Administrator, and
Administrator + Approved Mentor accounts with explicit Main Community access. Set up matching
Clerk users for the printed emails to sign in. The
script writes a summary to `/tmp/wavesparks-preview-accounts.txt`.

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
pnpm env:audit
```

## Production rollout checklist

Before promoting a deployment to production:

1. Configure production environment variables in Vercel:

```bash
NEXT_PUBLIC_APP_URL=https://app.wavesparks.co
DATABASE_URL=<postgres-url-with-pgvector>
SPACE_SCOPED_READS_ENABLED=true
OPENAI_API_KEY=<production-embedding-key>
CRON_SECRET=<long-random-secret>
WAVESPARK_ADMIN_EMAILS=letsbuild@wavesparks.co
BLOB_READ_WRITE_TOKEN=<vercel-blob-read-write-token>
# Optional for ordinary product notifications; membership invitations use Clerk:
RESEND_API_KEY=<resend-key>
RESEND_FROM_EMAIL=Wavesparks <notification@wavesparks.co>
```

The Vercel Clerk integration should supply `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
`CLERK_SECRET_KEY`. Clerk production domains also need the DNS records shown in the
Clerk Dashboard, including the Frontend API CNAME:

Before promotion, set Clerk `force_organization_selection` to `false` and read the setting
back from the production instance. Restricted sign-up may remain enabled because Clerk
application invitations bootstrap invited identities. Wavesparks users must never be required
to select or join a Clerk Organization.

For preview-domain OAuth handoff, also add Clerk's JWT verification key as
`CLERK_JWT_KEY` when available from the Clerk Dashboard. Keep `CLERK_SECRET_KEY`
configured too; the app uses it for Clerk user identity operations.

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
global defaults to match the Wavesparks org routes:

```bash
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/org/wavesparks/signin
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/org/wavesparks/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/org/wavesparks
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/org/wavesparks
```

Keep the Clerk application home URL and custom sign-in routes pointed at the community app
domain, not the marketing site. Create invitations from Wavesparks Admin: Wavesparks creates
the local authorization invitation, then Clerk sends an application-level identity invitation
back to `/api/internal/membership-invitations/accept`.

2. Run the production checks and database setup:

```bash
pnpm readiness:prod -- --env-only
pnpm db:migrate -- --environment=production
pnpm db:migrate -- --environment=production --apply --confirm-production
pnpm cron:matches -- --environment=production
pnpm cron:matches -- --environment=production --apply --confirm-production
pnpm invitations:migrate -- --environment=production
pnpm invitations:migrate -- --environment=production --apply --confirm-production
pnpm readiness:prod
```

Production database writes require both `--apply` and `--confirm-production`. Always review
the dry-run report before applying it and run a new dry-run afterward to confirm that no
actionable differences remain.

The invitation migration is also dry-run by default. It finds accounts that still have a
pending legacy Clerk Organization invitation, prints only membership IDs and counts, then
creates a new local one-time invitation and a Clerk application-level identity invitation when
explicitly applied. After successful delivery it revokes the superseded Organization invitation. Re-running the command
skips an already delivered local invitation, and it never prints an email address or raw token.

The `--env-only` pass validates configuration before any write. The full
`pnpm readiness:prod` pass runs after migrations and also performs a read-only Space audit:
every organization must have one active Main Community, Space relationships must remain
organization-safe, and posts, follows, matching rows, intros, and content notifications
must not have a null `space_id`. Resend is optional for ordinary product notifications and is
not part of the membership-invitation critical path.

3. Confirm DNS points the app domain to Vercel. `app.wavesparks.co` should resolve to Vercel before it becomes the member-facing URL.

4. Keep Vercel Authentication on preview deployments only. Production access should be controlled by Clerk sign-in, global account safety, explicit Space entitlements, and profile interaction gates.

5. After the first admin signs in through Clerk, create Events from the Admin Spaces page and invite people from Members or the destination Space. Add Event participants to Main only through the explicit **Add to Main Community** action.

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

- There is no public community feed. Every content read, direct post link, saved post, People view, notification link, and cache lookup must pass Space access checks.
- Member discovery is limited to active members of the current Space. Regular members can search safe profile summaries, but contact details remain hidden.
- Contact details remain hidden until an intro request is accepted.
- Accepted introductions remain private account history, but never grant content access in another Space.
- Upload routes for avatars and org logos use Vercel Blob and expect `BLOB_READ_WRITE_TOKEN`.
- Email notifications use Resend when configured and otherwise log the attempted delivery.
