# Wavesparks Admin Lifecycle Guide

This guide describes the operational model for accounts, invitations, Main Community access, Event participation, moderation, and matching.

## Operating model

The Admin console is the daily management surface. Clerk manages identity and the organization account connection; Wavesparks manages every community entitlement.

| Concern | Authority |
| --- | --- |
| Identity, primary email, credentials, sessions | Clerk |
| Invitation creation and acceptance | Clerk, initiated and tracked by Wavesparks |
| Global role | `memberships.role` in Wavesparks, synchronized to Clerk |
| Account connection and global safety | `memberships.account_status` |
| Main Community or Event access | `space_memberships.access_status` |
| Core profile | One account-level Wavesparks profile |
| Event/Main goals and matching opt-in | One `space_intent` per member and Space |
| Content, social activity, and matching | The explicit current Space |

Legacy `memberships.status` and Cohort records remain during migration compatibility. They are not the authority for Main Community or Event access.

## Access model

Every protected read and write uses the same rule:

```text
connected account
+ account not globally suspended or deprovisioned
+ active Space entitlement
+ Space lifecycle permits member access
= effective Space access
```

Main Community and Events are independent boundaries:

- Event access never grants Main Community access.
- Main Community access never reveals an Event.
- Removing access from one Space does not change another Space.
- A person may participate in any number of Events and Main Community at the same time.
- Promotion to Main does not copy Event posts, follows, matches, feedback, or introductions.

## 1. Use Members for accounts and invitations

Open `/org/wavesparks/admin/members` to search and filter account records, inspect invitation state, see Space-access chips, and perform account-level safety actions.

Members owns:

- Name, primary email, and Clerk connection
- Global `Member` or `Admin` role
- Account status and invitation status
- Space access across Main Community and Events
- Invitation errors, retries, and administrative notes

Do not interpret a connected Clerk account as community access. A connected account with no active Space entitlement cannot enter Main Community or an Event.

### Account states

| State | Meaning | Effect |
| --- | --- | --- |
| `invited` | An account invitation exists or connection is incomplete. | No Space can be entered yet. |
| `connected` | The Clerk organization account is connected. | Active Space entitlements may become effective. |
| `suspended` | A reversible global safety block. | Overrides access to every Space without rewriting each roster. |
| `deprovisioned` | The organization account is no longer provisioned. | Blocks every Space until explicitly restored. |

Clerk webhooks may update this account relationship. They must never create a Main Community or Event entitlement.

### Global Admin role

An Admin can audit and manage every Space. That authority does not make the Admin a social participant. To post, browse People, follow, send introductions, or enter matching, the Admin must have an explicit active entitlement to that Space.

When inviting an Admin, the UI confirms the elevated global permission. Selecting no destination Space is valid and prevents the Admin from appearing in participant rosters or matching pools.

## 2. Invite one person

Choose **Invite people**, then **One person**.

1. Enter the exact email and optional name.
2. Choose `Member` or `Admin`.
3. For a Member, choose the destination Main Community or Event and the initial Space access.
4. For an Admin, confirm the global permission and choose a destination only if the Admin should also participate socially.
5. Create the invitation and review the result.

For an existing Clerk user, Wavesparks connects the organization account and the selected active entitlement can take effect immediately. For a new user, Wavesparks creates a targeted Clerk invitation. The person accepts that account invitation once; all already-assigned Space entitlements then become available according to their own status and lifecycle.

The success message is **Invitation created**, not **Email delivered**. Delivery cannot be guaranteed by the application.

### Invitation states

| State | Meaning | Typical action |
| --- | --- | --- |
| Empty | No current invitation is tracked. | Create one if appropriate. |
| `pending` | Clerk accepted a usable invitation. | Wait, resend, or revoke. |
| `accepted` | The account connection completed. | Manage Space access separately. |
| `revoked` | The ticket can no longer be used. | Create a new invitation if needed. |
| `expired` | The ticket expired. | Retry with a new ticket. |
| `failed` | Clerk did not confirm the operation. | Review the row error and retry. |

## 3. Import a list into one destination Space

Choose **Invite people** from Members or **Add participants** from an Event. Event entry points preselect that Event.

The workflow is deliberately review-first:

1. Upload `.csv` or `.xlsx`, or paste CSV-formatted rows.
2. Map required Email and optional Name fields.
3. Choose one destination Space and its initial access.
4. Correct or remove problem rows in preview.
5. Confirm **Invite N people**.
6. Review row-level results and retry only failed invitations.

Selecting a file never sends invitations. Files are parsed in memory and are not retained. Limits are 2 MB, the first worksheet, 20 columns, and 100 non-empty data rows. Bulk import always creates ordinary Members; it cannot grant Admin.

Preview distinguishes new invitations, retryable invitations, existing accounts, existing Space access, duplicates, invalid rows, and rejected/suspended conflicts. The first occurrence of a duplicate email wins. Invalid rows do not block valid rows.

Existing account profile data and global roles are not overwritten. Import adds only the requested destination entitlement when safe. Rejected, suspended, removed, or globally blocked records require explicit resolution in member details.

## 4. Use Spaces for community boundaries

Open `/org/wavesparks/admin/spaces`.

Every organization has exactly one **Main Community** and any number of **Events**. The legacy Admin Cohorts URLs redirect into this model; Event is the product-facing object.

The Main Community is permanent, invitation-only, always active, and cannot be ended or archived. Its locked card never reveals posts, members, or counts to people without access.

### Event lifecycle

| Lifecycle | Member behavior |
| --- | --- |
| `draft` | Admin-only setup; participants cannot enter. |
| `upcoming` | Active participants can enter before the start date. |
| `active` | Participants can read, interact, and match in the Event. |
| `ended` | Displayed as a Past Event; full interaction and matching continue. |
| `archived` | Hidden from participants; access and matching stop while data is retained. |

Ending an Event is not archiving it. Use archive only when member access should close. Archived Events can be restored without copying or recreating their data.

An Event detail page keeps Overview, Participants, Content, Matching, and Settings in the same Space boundary. Counts never include members or activity from another Space.

## 5. Add Event participants to Main Community

From an Event, select eligible participants and use **Add N to Main Community**.

The operation:

- Creates an active Main Community entitlement immediately
- Is idempotent for people already in Main
- Preserves the source Event entitlement
- Does not duplicate account invitations for connected users
- Does not copy Event content, follows, matches, feedback, or introduction state
- Reports `Added`, `Already in Main`, `Account conflict`, or `Failed` per person

Rejected, suspended, removed, or globally blocked access is never silently restored. Resolve the conflict explicitly before adding the person.

## 6. Manage Space access separately from account safety

### Space access states

| State | Meaning |
| --- | --- |
| `active` | Entitlement is usable when the account and lifecycle also permit access. |
| `waitlist` | No member access yet; retained for a Space-specific decision. |
| `rejected` | Access was declined and requires explicit reconsideration. |
| `suspended` | Access is paused in this Space only. |
| `removed` | Access was removed from this Space only. |

Use a Space-level state when the decision concerns one Event or Main Community. Use global account suspension only for safety or provisioning issues that must override every Space.

High-impact actions such as granting Admin, global suspension, deprovisioning, rejecting access, or removing access require confirmation. Main/Event removal never modifies another roster.

## 7. Keep content and interaction inside the current Space

Canonical member URLs include the Space slug:

```text
/org/:orgSlug/s/:spaceSlug/feed
/org/:orgSlug/s/:spaceSlug/people
/org/:orgSlug/s/:spaceSlug/matches
/org/:orgSlug/s/:spaceSlug/knowledge
/org/:orgSlug/s/:spaceSlug/opportunities
/org/:orgSlug/s/:spaceSlug/requests
/org/:orgSlug/s/:spaceSlug/compose
/org/:orgSlug/s/:spaceSlug/posts/:postId
```

The Space must also be explicit in every mutation. A cookie or last-visited value must never decide where a post, follow, intro, or match belongs.

Posts belong to one Space. Comments inherit the post's Space. Saved-post reads, notification links, direct post links, and People profiles all recheck current access. There is no anonymous Main Community feed.

Follows, matches, feedback, and pending introductions record their source Space. The same pair may have only one unresolved introduction across the organization, preventing duplicate requests from overlapping Spaces. Accepted introductions remain private account history but grant no content or roster access elsewhere.

## 8. Operate matching per Space

Matching candidates must have all of the following in the same Space:

- Connected account
- Active Space entitlement
- Completed core profile
- Completed Space intent
- Space matching opt-in enabled
- A lifecycle of `upcoming`, `active`, or `ended`

An ended Event continues matching. An archived Event stops matching and hides its results. Roster, intent, or Space-post changes recompute only the affected Space; results are replaced atomically for that Space rather than deleting organization-wide matches.

See [AI matching engine](ai-matching-engine.md) for scoring and embedding details.

## 9. Reconcile Clerk without granting access

Reconciliation is dry-run by default and requires an explicit environment:

```bash
pnpm clerk:reconcile -- --environment=development
pnpm clerk:reconcile -- --environment=development --apply
pnpm clerk:reconcile -- --environment=production
pnpm clerk:reconcile -- --environment=production --apply --confirm-production
```

Review account connections, invitation state, global roles, stale invitations, and untracked Clerk organization memberships. Reconciliation repairs Clerk drift; it does not infer or create Space entitlements.

Production database writes also require both write flags:

```bash
pnpm db:migrate -- --environment=production --apply --confirm-production
```

Space migrations stop on duplicates, orphans, cross-organization references, or conflicting suspension/access records. Resolve those records manually rather than merging them automatically.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Connected user sees only My Spaces | Confirm an active entitlement exists for the intended Space. |
| Event participant cannot see Main | This is expected until **Add to Main Community** grants Main access. |
| Main member cannot see an Event | Confirm a separate active Event entitlement. |
| Past Event disappeared | Confirm it is `ended`, not `archived`. |
| Admin is absent from People or matching | Explicitly add the Admin to that Space as a participant. |
| User can read but cannot post or view People | Complete the global core profile. |
| User has no matches | Check core profile, Space intent, matching opt-in, matching settings, and candidate count in that Space. |
| Invitation exists but email is missing | Confirm `pending`, then resend if necessary; creation does not prove delivery. |
| Import row is blocked | Resolve global account or destination-Space conflict in member details. |
| Notification link is denied | The recipient no longer has effective access to its labeled Space. |
| Suspended account still has active chips | Global suspension overrides those entitlements without rewriting them. |

## Release verification checklist

- [ ] Event-only, Main-only, multi-Event, Main-plus-Event, Admin, removed, archived, and globally suspended access are verified.
- [ ] Feed, post links, People, Knowledge, saved posts, notifications, follows, intros, and matching cannot leak across Spaces.
- [ ] CSV/XLSX import requires and reports one destination Space.
- [ ] Add to Main is idempotent and preserves Event access.
- [ ] Ended Events remain interactive; archived Events are hidden from members.
- [ ] Global Admin audit access does not create social participation.
- [ ] Clerk webhooks and reconciliation never create Space access.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` pass.
