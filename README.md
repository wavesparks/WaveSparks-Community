# Wavesparks Community

Wavesparks Community is a private, invitation-only community platform for founders, mentors, and operations teams. It models the long-running Main Community and every standalone Event as a clearly bounded `Space`, then provides content, member discovery, AI-powered matching, introductions, and operations tooling inside each Space.

> [!IMPORTANT]
> The current codebase must not yet be treated as production-safe. The first-production-environment bootstrap has a P0 issue that prevents the initial administrator account from completing its Clerk binding, and five routes still authorize administrators by email instead of `clerk_user_id`, which is a P1 risk. See [Release blockers and known risks](#release-blockers-and-known-risks). Do not open the application to production traffic until these issues are fixed and regression-tested.

## Documentation

| Audience | English edition | Simplified Chinese edition |
| --- | --- | --- |
| Member | [Lifecycle manual](docs/manuals/member-guide.en.md) / [PDF](output/pdf/wavesparks-member-user-manual-en.pdf) | [Lifecycle manual](docs/manuals/member-guide.zh-CN.md) / [PDF](output/pdf/wavesparks-member-user-manual-zh-CN.pdf) |
| Mentor | [Lifecycle manual](docs/manuals/mentor-guide.en.md) / [PDF](output/pdf/wavesparks-mentor-user-manual-en.pdf) | [Lifecycle manual](docs/manuals/mentor-guide.zh-CN.md) / [PDF](output/pdf/wavesparks-mentor-user-manual-zh-CN.pdf) |
| Admin | [Operations and infrastructure manual](docs/manuals/admin-guide.en.md) / [PDF](output/pdf/wavesparks-admin-operations-manual-en.pdf) | [Operations and infrastructure manual](docs/manuals/admin-guide.zh-CN.md) / [PDF](output/pdf/wavesparks-admin-operations-manual-zh-CN.pdf) |

Additional technical documentation:

- [User lifecycle guide](docs/user-lifecycle-guide.md)
- [Admin lifecycle guide](docs/admin-lifecycle-guide.md)
- [AI matching engine](docs/ai-matching-engine.md)

The six PDFs are generated from their corresponding Markdown sources. After changing manual content or screenshots, run:

```bash
python3 -m pip install -r requirements-docs.txt
python3 scripts/build-manual-pdfs.py
```

Use Python 3.11 or newer. Rendering dependencies are pinned in `requirements-docs.txt`. Before committing, regenerate all manuals with `--strict`, then check page counts, searchable text, tables of contents, page numbers, and every rendered page:

```bash
python3 scripts/build-manual-pdfs.py --strict
```

## Product model

### Core principles

- **Personal invitations only:** there is no public registration, shared invitation code, or anonymous community feed.
- **Identity and authorization are separate:** Clerk manages identity, credentials, and sessions; Wavesparks and Neon manage accounts, roles, invitations, and Space access.
- **The Main Community and Events are independent:** attending an Event does not grant Main Community access, and joining Main does not grant access to any Event.
- **One global profile, many Space-specific intents:** the core Profile is reused across Spaces, while goals, needs, offers, and matching participation are stored independently for each Space.
- **Data is Space-scoped by default:** posts, member directories, follows, matches, feedback, and pending introductions belong to an explicit Space.
- **Contact details are disclosed late:** ordinary participants see each other's private contact details only after an introduction is accepted; authorized Admins may inspect member details for operations purposes.

### Three independent permission dimensions

| Dimension | Stored field | States | Controls |
| --- | --- | --- | --- |
| Account role | `memberships.role` | `member` / `org_admin` | Access to the Admin console |
| Mentor qualification | `memberships.mentor_status` | `not_mentor` / `needs_review` / `approved` | Mentor badge, service profile, mentor matching, and the Mentoring workspace |
| Space access | `space_memberships.access_status` | `active` / `waitlist` / `rejected` / `suspended` / `removed` | Access to one specific Main Community or Event |

An `approved` mentor is not an Admin, and an Admin does not automatically become a social participant in any Space. An administrator who needs to appear in the member directory, publish posts, or join matching must be explicitly added to that Space.

Valid Space access follows one consistent rule:

```text
Clerk identity bound through the invitation flow
+ account_status = connected
+ account is not suspended or deprovisioned
+ current Space entitlement = active
+ current Space lifecycle permits member access
= valid access
```

The legacy `memberships.status` field and old Cohort records exist only for migration compatibility. They are not the final authority for Main Community or Event access.

## Roles and complete feature set

### Member

The complete Member journey is: receive a personal invitation, create or sign in to Clerk with the invited email, complete the local account binding, enter an authorized Space from My Spaces, complete the global Profile, participate in content and connections, configure matching intent for each Space, and manage introductions and notifications.

Implemented capabilities:

- View My Spaces at `/org/:slug`, including the Main Community, current and upcoming Events, and Past Events.
- Browse a Space Feed and filter it by content type, tags, and other criteria.
- Publish seven post types: General update, Question, Opportunity, Looking for co-founder, Looking for mentor, Resource, and Announcement.
- Add comments, follow or unfollow members, and save or unsave posts.
- Browse the People directory and member profiles in the current Space.
- Request a standard introduction from a member profile, post, or match result.
- Browse corresponding content in the Knowledge and Opportunities views.
- Maintain one core Profile shared across Spaces; changes to the avatar, experience, skills, and preferences apply everywhere.
- Record current goals, needs, offers, and matching participation separately for each Space.
- Review AI recommendations in each Space and submit Helpful or Not relevant feedback with a reason.
- Process current-Space requests under Space Introductions, and review cross-Space introduction history and notifications in the account-level Inbox.
- Unlock email, WhatsApp, or other private contact details for both participants only after an introduction is accepted.

The Profile requires seven items before interaction restrictions are lifted: preferred name, headline, bio, current focus, at least one seeking match type, at least one skill tag, and an introduction email address. A bound account with valid Space access may read before completing the Profile; posting, commenting, People, following, requesting introductions, and matching require a complete Profile.

### Mentor

Mentor is an account-level qualification represented by `mentor_status = approved`. It can be combined with either a Member or Admin role, but it grants no extra Admin rights and no cross-Space access.

Implemented capabilities:

- Display the Approved mentor marker and a mentor service profile.
- Configure a mentor introduction, support formats, areas of expertise, availability, and preferred mentee capacity.
- Appear in mentor discovery and mentor-type matching within authorized Spaces.
- Publish Mentor-sourced Opportunities.
- Receive mentoring requests created from either a standard mentor match or the Request mentoring action on a member profile.
- Manage requests in the account-level `/org/:slug/mentoring` workspace using All, Needs response, Accepted, Declined, and Expired queues.
- Accept or decline a mentoring request; contact details become visible to both parties only after acceptance.
- Turn off the mentor matching offering to pause new mentor recommendations and direct mentoring requests.

Availability and capacity are currently descriptive and ranking signals; they do not automatically reject excess requests. A mentor must still have an active entitlement to the source Space and remains subject to the same Profile, privacy, and lifecycle rules as every other member.

### Admin

The Admin console lives at `/org/:slug/admin` and covers accounts, invitations, Spaces, content, connections, matching, and community settings.

| Workspace | Primary capabilities |
| --- | --- |
| Overview | Review summary metrics for members, content, introductions, and recent activity |
| Members | Search and filter accounts; invite one person; import CSV, XLSX, or pasted rows in bulk; inspect row-level results; retry or revoke invitations; and change roles, mentor qualifications, account states, and Space access |
| Community & Events | Manage the permanent Main Community; create, update, end, archive, or restore Events; maintain participant lists; explicitly run Add to Main Community; and inspect Space-level activity and matching audits |
| Profiles | Inspect complete member Profiles and private contact details, flag Profile status, and export CSV |
| Posts | Moderate posts and comments across Spaces; archive or restore posts; and remove or restore comments, images, and link previews |
| Requests | Inspect introductions by Space and source, and create manual introductions for eligible members |
| Matches | Inspect recommendations; manually refresh at organization level while relevant Profile changes trigger smaller recomputations; configure match categories, direction, minimum score, and weights; and review anonymized feedback and run history |
| Analytics | Review community metrics for connected accounts, complete Profiles, introductions, teams, and related activity |
| Settings | Update the community name, description, brand images, and invitation guidance |

The UI requires explicit confirmation for high-impact operations such as granting Admin access, globally suspending or closing an account, and rejecting or removing Space access. Removing access from one Space does not rewrite membership in any other Space.

## Explicitly unsupported product capabilities

The following capabilities are not implemented, and neither product nor operations documentation should imply otherwise:

- Points, reputation, leaderboards, earnable badges, or certificates. Approved mentor is a qualification marker, not a gamification badge.
- Event RSVP, check-in, or ticketing.
- Direct messages, post likes, user reporting, or blocking.
- Member self-service for leaving a Space, deleting an account, or exporting personal data.
- Author self-service for editing or deleting published posts or comments; Admins currently archive, remove, or restore them.
- Automatic copying of posts, follows, matches, feedback, or introductions between Events and the Main Community.
- Automatic rejection of mentoring requests based on mentor capacity.
- Resend webhook ingestion, delivery-state synchronization, or in-product email alerts.

## Space lifecycle and isolation

Every organization has exactly one permanent Main Community. It remains `active` and cannot be ended or archived. Events use the following lifecycle:

| State | Member visibility | Content and interaction | Matching |
| --- | --- | --- | --- |
| `draft` | Not available to members | Disabled | Skipped |
| `upcoming` | Available to members with an active entitlement | Enabled | Available |
| `active` | Available to members with an active entitlement | Enabled | Available |
| `ended` | Listed as a Past Event | Still readable and interactive | Still available |
| `archived` | Hidden from members | Member access disabled; data retained for Admin audit | Skipped, and visible results for the Space are cleared |

Ending an Event does not close it. Only archiving disables member access. Every post belongs to one Space, comments inherit the post boundary, and saved-post and notification links revalidate access when opened.

## Invitations, sign-in, and the account lifecycle

### Invitation flow

1. An Admin selects the account role, mentor qualification, destination Space, and initial Space access in Wavesparks.
2. Wavesparks creates or updates the local user, membership, Space entitlement, and one-time invitation in Neon.
3. The raw local token appears only in the invitation URL. The database stores only its SHA-256 hash, and the invitation expires after seven days.
4. Wavesparks creates a Clerk application invitation. Clerk sends the invitation email; this path does not depend on Resend.
5. Opening the link exchanges the URL token for a 15-minute, `HttpOnly` invitation handoff cookie.
6. The invitee creates or signs in to a Clerk account. The server fetches the Clerk user again and requires an exact match between a verified Clerk email address and the invited email.
7. The acceptance transaction atomically writes `users.clerk_user_id`, changes `account_status` to `connected`, and consumes the invitation.
8. Production requests subsequently find the local account by `clerk_user_id`. Ordinary Clerk webhooks are not allowed to claim an account by email.

Invitation states are `pending`, `accepted`, `revoked`, and `expired`. A delivery failure retains an auditable error so an Admin can retry it. A success message means Clerk accepted the send request; it does not guarantee delivery to the inbox.

### Account states

| `account_status` | Meaning | Effect |
| --- | --- | --- |
| `invited` | A local account exists, but identity binding is incomplete | No Space can be accessed |
| `connected` | A Clerk user was bound by the invitation transaction | Active Space entitlements can be used |
| `suspended` | Reversible global security suspension | Overrides access to every Space |
| `deprovisioned` | The organization account is closed | Overrides access to every Space until explicitly restored by an Admin |

Clerk Organizations are intentionally not used in this project. The Clerk webhook only synchronizes identity fields for already-bound users and triggers anonymization on `user.deleted`; it never creates memberships, roles, or Space access.

## Route map

The examples below use `wavesparks` as `:slug`.

### Account-level routes

| Route | Purpose |
| --- | --- |
| `/org/wavesparks` | My Spaces home |
| `/org/wavesparks/accept-invitation` | Personal invitation landing page |
| `/org/wavesparks/signin` | Clerk sign-in |
| `/org/wavesparks/sign-up` | Invitation-only Clerk sign-up |
| `/org/wavesparks/auth/complete` | Account completion after sign-in or invitation acceptance |
| `/org/wavesparks/pending` | Explanation for an unconnected or suspended account |
| `/org/wavesparks/onboarding` | Core Profile onboarding |
| `/org/wavesparks/profile` | Global Profile settings |
| `/org/wavesparks/requests` | Cross-Space introduction history and notification Inbox |
| `/org/wavesparks/mentoring` | Account-level workspace for an Approved mentor |

### Canonical Space-level routes

```text
/org/:slug/s/:spaceSlug/feed
/org/:slug/s/:spaceSlug/people
/org/:slug/s/:spaceSlug/people/:membershipId
/org/:slug/s/:spaceSlug/matches
/org/:slug/s/:spaceSlug/knowledge
/org/:slug/s/:spaceSlug/opportunities
/org/:slug/s/:spaceSlug/requests
/org/:slug/s/:spaceSlug/compose
/org/:slug/s/:spaceSlug/posts/:postId
```

Legacy organization-level Feed, People, Matches, Knowledge, Opportunities, and Compose routes only redirect to an explicit Space or My Spaces. Legacy Admin Cohorts routes redirect to Community & Events. A legacy post deep link first reauthorizes the post's Space, then decides whether to redirect.

### Admin routes

```text
/org/:slug/admin
/org/:slug/admin/members
/org/:slug/admin/spaces
/org/:slug/admin/spaces/:spaceId
/org/:slug/admin/profiles
/org/:slug/admin/profiles/export
/org/:slug/admin/posts
/org/:slug/admin/requests
/org/:slug/admin/matches
/org/:slug/admin/analytics
/org/:slug/admin/settings
```

## System architecture

```mermaid
flowchart LR
  U["Member / Mentor / Admin"] --> N["Next.js 16 App Router"]
  N --> C["Clerk\nidentity, credentials, sessions, identity invitations"]
  N --> DB["Neon PostgreSQL + pgvector\nauthorization, Profiles, Spaces, content, matches, introductions"]
  N --> O["OpenAI Embeddings\nsemantic vectors"]
  N --> B["Vercel Blob\navatars, logos, private post media"]
  N --> R["Resend\nordinary product notification email"]
  V["Vercel\ndeployments, functions, Cron, logs"] --> N
  V --> DB
```

### Technology stack

- Next.js `16.2.4` with the App Router and React `19.2.4`
- TypeScript 5 and Tailwind CSS 4
- Clerk `@clerk/nextjs` 7
- Neon PostgreSQL, Drizzle ORM and Kit, and `pgvector`
- OpenAI `text-embedding-3-large`
- Vercel Blob and Resend
- Vitest, Testing Library, and Playwright
- pnpm `10.19.0`

> This project's Next.js version contains breaking API and convention changes. Before changing Next.js-related code, read the relevant guide under `node_modules/next/dist/docs/`.

### Repository structure

```text
src/app/                 App Router pages and API Route Handlers
src/actions/             Member and Admin Server Actions
src/components/          Community, Admin, layout, and UI components
src/db/                  Drizzle client and schema
src/lib/                 Authentication, authorization, Profile, Space, and configuration logic
src/server/              Stores, matching, invitations, notifications, media, and view models
drizzle/                 SQL migrations and metadata
scripts/                 Migration, seed, bootstrap, environment audit, readiness, and matching tasks
tests/                   Vitest, component, route, domain, and Playwright E2E tests
docs/                    Lifecycle and technical documentation plus manual sources for all three roles
output/pdf/              Generated English and Simplified Chinese PDF manuals
```

## Local development

### Prerequisites

- A current Node.js LTS release compatible with Next.js 16
- pnpm `10.19.0`
- Optional: local or Neon PostgreSQL with `pgvector`
- Optional: Clerk test instance, OpenAI, Vercel Blob, and Resend credentials

### Start the application

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000/org/wavesparks/signin`.

When `DATABASE_URL` is absent, the application uses in-memory seed data intended for UI work and tests. It is not a persistent development environment. PostgreSQL is required to validate migrations, concurrency, constraints, or production behavior.

### Environment variables

| Variable | Production requirement | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Required, although a Vercel system URL can be used as a fallback | Community application root URL; it must point to the app domain, not the marketing site |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Required; use `pk_live_` | Clerk browser identity configuration |
| `CLERK_SECRET_KEY` | Required; use `sk_live_` | Clerk backend API and user verification |
| `CLERK_JWT_KEY` | Optional but recommended | Local JWT verification for preview-domain OAuth handoff; the secret key is used if this is absent |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Required | Verifies Svix signatures at `/api/webhooks/clerk` |
| `NEXT_PUBLIC_CLERK_PROXY_URL` | Optional | Set only when the same proxy domain is enabled in the Clerk Dashboard |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Optional | Defaults to `/org/wavesparks/signin` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Optional | Defaults to `/org/wavesparks/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | Optional | Defaults to `/org/wavesparks` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | Optional | Defaults to `/org/wavesparks` |
| `DATABASE_URL` | Required | Neon/PostgreSQL connection string with `pgvector` support |
| `SPACE_SCOPED_READS_ENABLED` | Must explicitly equal `true` | Global switch for Space-scoped reads; production fails closed when it is missing or not true |
| `OPENAI_API_KEY` | Required by readiness checks | Production semantic embeddings; failures degrade to a local deterministic token hash |
| `RESEND_API_KEY` | Optional but expected | Ordinary product notification email; not used for membership invitations |
| `RESEND_FROM_EMAIL` | Configure together with the Resend key | Notification sender |
| `CRON_SECRET` | Required; at least 32 characters recommended | Protects matching recomputation and media-cleanup endpoints |
| `BLOB_READ_WRITE_TOKEN` | Optional but expected | Storage for avatars, logos, post images, and link thumbnails |
| `WAVESPARK_ADMIN_EMAILS` | Required by readiness checks | Bootstrap administrator email list; **does not complete Clerk identity binding** |
| `E2E_CLERK_ADMIN_EMAIL` | Test only | Clerk E2E Admin test account |
| `E2E_CLERK_USER_EMAIL` | Test only | Clerk E2E Member test account |

Scripts load `.env.<environment>.local`, `.env.local`, `.env.<environment>`, and `.env` in that priority order without replacing variables already present in the process. Never commit sensitive values. `NEXT_PUBLIC_*` values are exposed to the browser and must not contain secrets.

## Database, migrations, and seed data

Generate Drizzle SQL:

```bash
pnpm db:generate
```

Dry-run a development migration first, then apply it explicitly:

```bash
pnpm db:migrate -- --environment=development
pnpm db:migrate -- --environment=development --apply
```

Production writes require both `--apply` and `--confirm-production`:

```bash
pnpm db:migrate -- --environment=production
pnpm db:migrate -- --environment=production --apply --confirm-production
```

The Space migration uses an expand, backfill, and compatibility sequence. Preflight checks stop on duplicate memberships, orphaned rows, cross-organization references, or conflicting access states instead of guessing which production record to keep.

Development data and preview accounts:

```bash
pnpm db:seed -- --environment=development
pnpm db:seed -- --environment=development --apply

pnpm db:preview-accounts -- --environment=development
pnpm db:preview-accounts -- --environment=development --apply
```

`db:preview-accounts` creates local records and Main entitlements for Member, Approved Mentor, Admin, and Admin plus Approved Mentor roles. Matching Clerk test users must still be created before they can sign in. A summary is written to `/tmp/wavesparks-preview-accounts.txt`.

### Legacy invitation migration

```bash
pnpm invitations:migrate -- --environment=production
pnpm invitations:migrate -- --environment=production --apply --confirm-production
```

This command defaults to a dry run. It migrates legacy Clerk Organization invitations to Wavesparks one-time invitations plus Clerk application invitations, then revokes the legacy invitations after success. Logs contain only membership IDs and counts, never email addresses or raw tokens.

## AI matching engine

The current algorithm version is `hybrid-v4`:

- Candidates are matched only inside the same Space, and their accounts, Profiles, Space intents, opt-in states, and the Space lifecycle must all be eligible.
- Admin-configured matching supports mutual or seeker-to-provider direction, a minimum quality score, and configurable weights. Default categories cover co-founder, collaborator, and mentor.
- Production embeddings use 1,024-dimensional vectors from `text-embedding-3-large` and are stored in PostgreSQL `pgvector`.
- A global Profile embedding contains no Space-private activity. A Space intent embedding uses only goals, offers, needs, and eligible recent intent posts from that Space.
- Private contact details, comments, saves, follows, interaction counts, moderation history, and introduction content are excluded from embeddings.
- The score is a versioned `1..100` fit index, not a probability of success. Sparse evidence is constrained by coverage caps.
- No more than 12 candidates are stored for each source member, match type, and Space combination.
- If OpenAI is missing or fails, the engine uses a deterministic multilingual token-hash fallback and records degradation counts and errors. Fallback results do not provide production-level semantic quality.
- Helpful and Not relevant feedback is stored per Space. Not relevant hides a stable match; feedback does not automatically retrain or change weights online.

See [AI matching engine](docs/ai-matching-engine.md) for the complete formula, evidence-quality rules, directional comparisons, calibration curve, and recomputation semantics.

Manual maintenance commands:

```bash
pnpm cron:matches -- --environment=development
pnpm cron:matches -- --environment=development --apply

pnpm cron:matches -- --environment=production
pnpm cron:matches -- --environment=production --apply --confirm-production
```

## Media and email

- Avatars and organization logos use public Vercel Blob URLs. Both accept JPG, PNG, or WebP files up to 2 MB.
- Post images use private Vercel Blob storage and are served through application routes that revalidate Space access. Each image may be up to 5 MB, accepts JPG, PNG, or WebP, and is processed with Sharp.
- Link previews limit response size, validate content types, and block local or private-network addresses. Their thumbnails are also served through a private read route.
- Cron removes orphaned or failed post media.
- Clerk sends identity invitations. Resend sends ordinary product notifications only. If Resend is not configured, the application records `email skipped` without affecting the invitation flow.
- There is currently no Resend webhook or delivery-state persistence. Delivery, bounce, and complaint information is available only in the Resend Dashboard.

## Scheduled tasks

Vercel configuration lives in `vercel.json`; all schedules use UTC:

| UTC schedule | Path | Purpose |
| --- | --- | --- |
| Daily at `08:00` | `/api/internal/matches/recompute` | Enumerate organizations and eligible Spaces, then refresh recommendations |
| Daily at `08:30` | `/api/internal/post-media/cleanup` | Remove expired media that was never claimed by a post |

Vercel Cron invokes these routes with `GET` and authorizes them with `Authorization: Bearer <CRON_SECRET>`. The matching endpoint additionally accepts `x-cron-secret`; the media-cleanup endpoint accepts only the Bearer header. A matching `GET` never falls back to a browser session, preventing a cross-site top-level navigation with a Lax cookie from triggering a write.

## Tests and quality gates

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm test:e2e:clerk
pnpm build
```

- `pnpm test`: Vitest domain, component, authorization, migration, and Route Handler tests.
- `pnpm test:e2e`: isolated Playwright flows using local signed cookies and in-memory data, email, and media.
- `pnpm test:e2e:clerk`: sign-in and invitation flows against a real Clerk test instance.
- `pnpm test:e2e:preview`: browser verification against a deployed Preview.
- `pnpm qa:prelaunch`: prelaunch matching QA restricted to development. It rejects a production Vercel environment or a database fingerprint matching production.

Production configuration and data preflight:

```bash
pnpm env:audit
pnpm readiness:prod -- --env-only
pnpm readiness:prod
```

`env:audit` verifies that development and production do not share a database, that development Clerk keys are test keys, and that production Clerk keys are live keys. After migrations, the full readiness check performs a read-only Space audit: every organization must have exactly one active Main Community; Space relationships must contain no duplicates or cross-organization references; and posts, follows, matches, feedback, introductions, and content notifications must not have a null `space_id`.

## Vercel deployment and operations

Recommended workflow:

1. Configure Preview and Production Vercel environments separately. Never share Neon or Clerk resources between development and production.
2. Confirm that `NEXT_PUBLIC_APP_URL` is the community app domain. Clerk application home, sign-in and sign-up redirects, and invitation callbacks must also target that domain.
3. Use live keys in the Clerk production instance, configure custom-domain DNS and the `/api/webhooks/clerk` endpoint, and keep `force_organization_selection=false`.
4. Enable `pgvector` in Neon. Dry-run the migration, then apply it using both production confirmation flags.
5. Run `pnpm readiness:prod -- --env-only` first, then run the full `pnpm readiness:prod` after migrations.
6. Deploy a Preview and smoke-test Member, Mentor, and Admin paths together with invitations, media, email, Cron, and permission boundaries.
7. Resolve the release blockers in this README before promoting the verified build to Production.
8. After release, inspect Vercel Runtime Logs and Cron results, Neon connections and storage, Clerk webhooks and invitation delivery, and Resend bounces and complaints.

Environment variable changes affect new deployments only, so redeploy after each change. Use a staged database process of backward-compatible migration, application deployment, and cleanup migration. Rolling back the application does not roll back the database.

See the [Admin operations and infrastructure manual](docs/manuals/admin-guide.en.md) for routine maintenance, credential rotation, backup and restore, rollback, and incident-response procedures for every platform. Official references:

- [Vercel Environment Variables](https://vercel.com/docs/environment-variables), [Runtime Logs](https://vercel.com/docs/logs/runtime), and [Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- [Clerk Production](https://clerk.com/docs/guides/development/deployment/production), [API key rotation](https://clerk.com/docs/guides/secure/rotate-api-keys), and [Webhooks](https://clerk.com/docs/guides/development/webhooks/syncing)
- [Neon branching](https://neon.com/docs/guides/branching-intro), [restore](https://neon.com/docs/guides/branch-restore), and [connection pooling](https://neon.com/docs/connect/connection-pooling)
- [Resend domains](https://resend.com/docs/dashboard/domains/introduction), [API keys](https://resend.com/docs/dashboard/api-keys/introduction), and [email logs](https://resend.com/docs/dashboard/emails/introduction)

## Security, privacy, and deletion

- Every community read, deep link, saved item, notification, and cached read must revalidate exact Space access.
- Production Clerk sessions bind by `clerk_user_id`. Email is only an invitation-matching attribute verified by Clerk and must not become the routine authorization key.
- The Clerk webhook verifies signatures and stores `svix-id` for idempotency. Organization-related events are ignored.
- Link previews defend against SSRF by blocking loopback and private-network addresses, rejecting unsafe redirects, and limiting HTML and image sizes.
- Post media uses private Blob storage with `private, no-store` responses. Avatars and logos currently use public Blob storage.
- Contact details are not publicly displayed and never enter matching embeddings. Authorized Admins can inspect them in Profile management, and both participants can see them after an accepted introduction.
- When Clerk sends `user.deleted`, Wavesparks anonymizes the identity as Former member, removes authentication binding, Profile, matches, follows, saves, and notifications, and terminates pending introductions. Existing posts and comments remain to preserve community history but are attributed to the anonymized author.
- Admin Profile CSV exports contain sensitive data. Download them with least privilege, store them encrypted, and delete them according to the retention policy.
- Store secrets only in Vercel or uncommitted local environment files. After rotating Clerk, Neon, Resend, Blob, or Cron credentials, redeploy and run smoke tests.

## Release blockers and known risks

### P0: A fresh production bootstrap cannot create a usable first Admin

`pnpm db:bootstrap` currently creates `users` and an `org_admin` membership for addresses in `WAVESPARK_ADMIN_EMAILS`, but every new record remains in this state:

```text
users.clerk_user_id = NULL
memberships.account_status = invited
no membership_invitations record
no Clerk application invitation
```

The shared production authentication path finds accounts only by `clerk_user_id` and explicitly forbids automatic email claiming. The one-time invitation acceptance transaction is the only valid binding point. Consequently, after bootstrapping an empty production database, even a Clerk user with the same email cannot become a valid viewer or enter the Admin UI to invite themselves. The default `letsbuild@wavesparks.co` address and `WAVESPARK_ADMIN_EMAILS` are local data-bootstrap settings, not identity authorization.

Before launch, implement and verify a controlled first-Admin binding flow. For example, bootstrap could generate and send the standard one-time invitation, or an operator-only command could perform a one-time, auditable binding behind strong confirmation. Do not restore automatic account claiming by email on sign-in. This README documents the problem without changing the current implementation.

Running bootstrap again preserves the binding for an existing production Admin whose membership is already `connected`, but that does not solve initial administration in a new environment.

### P1: Five routes still authorize Admins by email

The following routes pass `getCurrentAuthIdentity().email` directly to `getViewerRecordByEmailAndSlug(...)` instead of following the production Clerk ID binding rule:

| Route | Risky operation |
| --- | --- |
| `POST /api/internal/preview-accounts` | Create or update preview-role accounts |
| `POST /api/internal/matches/recompute` in the non-Cron Admin session branch | Trigger matching writes |
| `POST /api/admin/member-import/parse` | Enter the Admin bulk-import flow and parse a member file |
| `GET /org/:slug/admin/profiles/export` | Export a CSV containing private Profile data |
| `POST /api/uploads/org-logo` | Change the organization logo |

This creates an inconsistent authentication model: a session with a Clerk-verified email matching a local Admin address, but without a binding completed by the invitation transaction, may reach these direct routes even though it cannot open normal Admin pages. Bootstrap itself creates exactly such an email-present, Clerk-ID-unbound Admin record, so this P1 risk compounds the P0 bootstrap issue.

Before launch, migrate these routes to `clerk_user_id` and the shared viewer context, retaining explicit email lookup only for the isolated E2E provider. Add route tests proving that an equal email with a different or missing Clerk ID is rejected. `/api/internal/preview-accounts` must also fail closed in production. As requested, the current documentation records these risks without changing application code.

### Additional operating boundaries

- Without Resend configuration, ordinary notifications are logged only. There is no webhook or delivery-state synchronization.
- An OpenAI failure still produces degraded matching. Operations must monitor `degradedEmbeddingCount` and must not treat the fallback as an equal-quality service.
- Admins can inspect audit data for every Space, but still need an explicit entitlement to participate socially.
- An `ended` Event remains fully interactive. Archive it if operations intend to close access.
- An application rollback is not a database rollback. Production migrations must remain compatible with both adjacent application versions, and recovery must be rehearsed first.

## Command reference

```bash
# Development
pnpm dev
pnpm build

# Quality
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm test:e2e:clerk

# Database
pnpm db:generate
pnpm db:migrate -- --environment=development
pnpm db:seed -- --environment=development
pnpm db:bootstrap -- --environment=production

# Operations
pnpm env:audit
pnpm readiness:prod -- --env-only
pnpm readiness:prod
pnpm cron:matches -- --environment=production
pnpm invitations:migrate -- --environment=production
```

All mutating scripts default to dry-run mode. Add `--apply` for development writes. Production writes require both `--apply` and `--confirm-production`. Until the P0 bootstrap blocker is resolved, never interpret a successful `db:bootstrap` log as proof that the first Admin can sign in.
