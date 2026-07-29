# WaveSparks Community Mentor User Manual

Version: 1.0
Audit baseline: Codebase and current interface as of July 29, 2026
Intended audience: WaveSparks Community Mentors approved by an organization

> Mentor is a separate approval status layered on top of Member identity; it is not an Admin role. Except where this manual says otherwise, Mentors follow the same access, Profile, content, and privacy rules as Members.

## 1. The Mentor Role and End-to-End Journey

A WaveSparks Mentor is an organization-approved member who can participate in authorized Spaces, present professional expertise, appear in Mentor matching, and receive Mentoring introductions.

The platform supports discovery, matching, requests, consent, and contact exchange. Mentoring logistics, communication, meeting notes, goal tracking, and outcome evaluation take place in external tools.

A typical lifecycle is:

1. An Admin creates or maintains the member record and grants `approved` Mentor status.
2. The Mentor accepts the seven-day invitation and connects an account using the corresponding verified email address.
3. The Mentor completes the Member Profile and Mentor-specific details.
4. The Mentor opts in to introductions and adds `mentor_match` to Offering.
5. In an authorized Space, the Mentor participates in the community, publishes content, and configures matching intent.
6. Members discover the Mentor and send General or Mentoring introductions.
7. The Mentor reviews the queue in the Mentoring workspace, then accepts or declines in the source Space.
8. After acceptance, both people exchange contact details and continue mentoring outside the platform.
9. The Mentor pauses new requests when needed and keeps profile information and history current.
10. The Mentor exits the relevant experiences if approval is revoked, Space access ends, or the account is deleted.

![Mentor workspace](../assets/manuals/mentor-workspace.png)

## 2. Identity, Permissions, and Access Requirements

The system separates permissions into three dimensions:

- Organization role: `member` or `org_admin`;
- Mentor status: `not_mentor`, `needs_review`, or `approved`;
- Space permission: whether the person has `active` access to a specific Space.

Global Mentor capabilities require both `mentor_status = approved` and a `connected` account. Accessing a specific Space still requires active access to that Space, and the Space lifecycle must be `upcoming`, `active`, or `ended`.

An Approved Mentor does not automatically become an Admin. Mentor approval does not allow someone to create Events, invite members, approve accounts, export profiles, view organization-wide analytics, or moderate content. An Admin who wants to post or participate in Matching as a regular member must also explicitly join the relevant Space.

## 3. Receiving Mentor Approval and Accepting an Invitation

There is currently no self-service Mentor application or automatic certification flow. An Admin can grant Approved Mentor status while inviting a member or change the Mentor status after the member connects.

The standard invitation flow is:

1. An Admin creates a managed member, selects Member or Approved Mentor, and assigns at least one Space.
2. Clerk sends the identity invitation; the link remains valid for seven days.
3. The invitee opens `/org/[slug]/accept-invitation` and signs up or signs in.
4. The invitee uses the exact email address from the invitation and verifies it.
5. After successful verification, the account changes from invited to connected.

A new invitation cannot initially set the member to `needs_review`. A user cannot join a Space independently, promote themselves to Mentor, or bypass server-side eligibility checks by changing client-side fields.

## 4. Completing the Profile and Mentor Details

One global Profile is shared across all Spaces. Profile completion requires at least:

- Preferred name;
- Headline;
- Bio;
- Current focus;
- At least one Looking for type;
- At least one Skill tag;
- Introduction email.

A Mentor should also maintain:

- Mentoring topics;
- Startup stages served;
- Functional strengths;
- Mentoring offers;
- Availability;
- Max mentees, from 0 to 100;
- Mentorship preferences;
- Whether introductions are accepted;
- Whether WhatsApp is shared after acceptance.

![Mentor Profile settings](../assets/manuals/mentor-profile-settings.png)

Mentor-specific fields are saved only after the server confirms Approved status. The Introduction email in the Profile is used as an introduction contact; changing it does not change the Clerk sign-in email.

## 5. Accepting or Pausing New Mentoring Requests

Receiving new Mentoring requests requires all of the following:

- Mentor status is approved;
- Account status is connected;
- `introOptIn` is enabled;
- Global Offering includes `mentor_match`;
- Access to the target Space is active;
- The Profile and matching intent for that Space meet the relevant entry requirements.

Ways to pause:

- Turn off "Accept introductions" to pause all new General and Mentoring introductions.
- Remove `mentor_match` from Offering to pause new Mentor matches and direct Mentoring requests while retaining ordinary introductions if desired.

`maxMentees` and Availability currently inform profile display and matching scores; they are not enforced capacity limits. There is no separate vacation, full-capacity, or waitlist status. When personal capacity is reached, manually pause the relevant Offering or introductions.

## 6. Participating in a Space

My Spaces shows the Main Space, Your events, and Past events. Inside a specific Space, Mentors have the same community capabilities as Members:

- Browse Feed, People, Matches, Knowledge, Opportunities, and Introductions;
- Publish a General update, Question, Resource, Announcement, Opportunity, Looking for cofounder, or Looking for mentor post;
- Comment and use `@mention`;
- Follow members and save posts;
- Search for members and view profiles;
- Request a General introduction.

When publishing an Opportunity, an Approved Mentor can apply the Mentor source label. The People page displays the Approved Mentor badge and Mentor expertise information.

Content limits are the same as for Members: titles are limited to 160 characters, post bodies to 10,000 characters, and comments to 2,000 characters. A post can include up to four JPG, PNG, or WebP images, each no larger than 5 MB.

Members and Mentors currently cannot edit or delete their own posts or comments. The product also has no likes, reporting, blocking, direct messages, or standalone Project management. Admins handle content moderation.

## 7. Mentor Matching

Matching is scoped independently to each Space. On a Space's Matches page, a Mentor completes:

- Current goal;
- Looking for;
- What I can offer;
- Include me in match suggestions.

The intent is complete only when Current goal is present and at least one of Looking for or Offer is filled in.

![Mentor matching](../assets/manuals/mentor-matches.png)

Eligibility as a Mentor match candidate normally also requires:

- Approved Mentor status and a connected account;
- Active access to the current Space;
- A complete global Profile;
- A complete matching intent for the current Space, with Matching opt-in enabled;
- Both `introOptIn` and the `mentor_match` Offering enabled;
- Matching enabled for the current Space by an Admin;
- A Space that is not archived.

The 1-100 Fit index shown on a match card combines semantic similarity, Skills, startup stage, Availability, working style, location, and other factors. A Mentor's stage experience, Availability, and Capacity contribute to the result. The score is not a probability of success, public reputation, service-quality rating, or mentee review.

A suggestion can be marked Helpful or Not relevant. Not relevant hides the result and retains the dismissal. This feedback is not a public review and does not immediately retrain matching weights.

## 8. Mentoring Introductions

### 8.1 Request Sources

A Mentoring request can originate from:

- An Approved Mentor's profile on the People page, with Mentoring selected;
- A `mentor_match` match card.

An introduction initiated from a post author is always General and cannot be presented as Mentoring.

The server revalidates that both people share the Space, permissions remain valid, profiles are complete, the recipient is still an Approved Mentor, introductions are still accepted, and `mentor_match` is still offered. A person cannot send a request to themselves.

Within an organization, the same pair of members can have only one pending Introduction at a time, regardless of direction, type, or Space.

### 8.2 Request Content and Statuses

The requester provides a Purpose, Note, and Suggested opening message. A request has one of these statuses:

- `pending`: waiting for the Mentor;
- `accepted`: approved, with contact details exchanged;
- `declined`: refused, without exchanging contact details;
- `expired`: made ineligible by account, access, qualification, or other eligibility changes.

### 8.3 Mentoring Workspace

The account-level workspace at `/org/[slug]/mentoring` aggregates incoming Mentoring requests from Spaces that remain accessible. It supports All, Pending, Accepted, Declined, and Expired filters and loads up to 40 recent records.

The workspace shows only Mentoring requests received by the signed-in Mentor. It does not reveal other Mentors' queues and is not an Admin dashboard. The actual Accept or Decline action takes place on the Introductions page in the request's source Space.

### 8.4 Accepting or Declining

1. Open the workspace and confirm which Space the request came from.
2. Read the Purpose, Note, and suggested opening message.
3. Open Introductions in the source Space.
4. Select Accept or Decline.
5. After acceptance, both people can see each other's Introduction email. WhatsApp appears only if its owner opted to share it after acceptance.
6. Use a mutually agreed external channel to arrange the first conversation.

The platform has no built-in chat, video, Calendar, or meeting room. Acceptance means consenting to make contact; it does not create a persistent mentoring-relationship record or grant access to another Space.

## 9. Working After the Introduction

The current product does not store or manage:

- Meeting schedules, reminders, or attendance;
- A mentee caseload dashboard;
- Mentoring goals, action items, or progress;
- Meeting notes or attachments;
- A completed or terminated mentoring-relationship status;
- Star ratings, Testimonials, or outcome data.

Mentors should use external channels to agree on the scope of the first conversation, time zone, meeting frequency, privacy boundaries, and whether to continue. Do not publish sensitive mentee information in public posts.

Accepted and declined history remains in the account-level Inbox. Some historical records can remain visible after access to the source Space is lost. Pending and expired records generally require continued access to the source Space.

## 10. Notifications and Email

Mentoring uses the general Introduction notification types, primarily requested, accepted, and declined. A Mentor may also receive Post mention, Comment mention, Admin note, Manual introduction, and Membership approved notifications.

- New requests are normally sent through Resend to the Mentor's Introduction email.
- Acceptance or decline normally triggers an email to the requester.
- Account and Space access are rechecked before sending.
- If Resend is not configured, the in-app notification remains available while email is skipped and logged.
- Initial member invitations are sent by Clerk, not Resend.

There is currently no notification-preference center, Digest, push notification, Mentoring-specific scheduling reminder, or overdue follow-up. Mentors also have no email retry control.

## 11. Data, Analytics, and Exports

Mentors currently have no personal analytics dashboard or self-service export. There is no Mentee list CSV, Mentoring-request CSV, match-history export, or personal outcome report.

Organization Admins can export all member Profiles and contact information and can view Mentor Offering data. Enter only the data needed for community operations and follow the organization's privacy policy.

## 12. Changes to Approval, Access, and Account Status

### 12.1 Mentor Approval Is Revoked

- The Approved Mentor badge and Mentor-specific details are no longer displayed;
- The person is no longer eligible for Mentor matching;
- Pending incoming Mentoring requests automatically become expired;
- The Mentoring workspace becomes inaccessible;
- Accepted and declined history is not deleted solely because approval changed;
- Ordinary Member access remains only where account and Space access still permit it.

### 12.2 Space Access Ends

The Mentor can no longer access that Space's Feed, People, Matches, or pending requests. Accepted or declined records can remain in account history, but they do not restore Space access.

### 12.3 Clerk Identity Is Deleted

After the `user.deleted` Webhook succeeds, the local Profile and contact details are anonymized, the account is deactivated, Mentor status returns to `not_mentor`, related follow, save, notification, and match data is deleted, and pending Introductions expire. Existing posts and comments remain, but their author is displayed as Former member.

The application has no self-service control for leaving a Space, deleting the local account, or downloading personal data. Contact an Admin when needed, and confirm that deletion completed in both Clerk and the local Webhook flow.

## 13. Privacy and Professional Boundaries

- Profiles and interactions are available only to active members of the current Space; public social links appear on the Profile.
- Introduction email and authorized WhatsApp details are shown only to the two participants after acceptance. Organization Admins can still access these details for operations.
- Avatars use public asset URLs. Do not upload identity documents, client data, or confidential files.
- Before accepting, review the Purpose, boundaries, and available time. Use Decline when the request is not appropriate.
- Mentoring communication takes place in external tools. The organization should separately define confidentiality, recordkeeping, incident response, and code-of-conduct processes.
- There is currently no reporting or blocking interface. Contact an Admin about inappropriate behavior.

## 14. Capabilities Mentors Do Not Currently Have

- Self-service Mentor application, approval, or renewal;
- Automatic Admin privileges;
- Event creation, editing, or management;
- Member invitations or participant management;
- Project CRUD or project management;
- Mentoring schedules, sessions, progress tracking, or enforced capacity;
- In-platform chat, calls, or Calendar integration;
- Mentor ratings, public reviews, certificates, or points;
- Personal analytics or Mentor data exports;
- Self-service editing or deletion of posts, leaving a Space, or deleting a local account.

## 15. Frequently Asked Questions

### I am already an Approved Mentor. Why can I not see an Event?

Mentor status is a global qualification, while Space access is granted independently. Ask an Admin to check your active access to the Event and its lifecycle state.

### Why can other people not send me a Mentoring request?

Confirm that the account is connected, the Profile is complete, `introOptIn` is enabled, Offering includes `mentor_match`, current Space access is active, and Matching is enabled for the Space.

### Does reaching Max mentees automatically stop new requests?

No. That value currently informs display and scoring. Manually remove `mentor_match` or turn off acceptance of introductions.

### Why can I Accept or Decline only inside the Space?

The Mentoring workspace is an aggregate view across Spaces. Final actions remain in the source Space so the system can revalidate both participants' permissions and the request context.

### Where do I schedule a meeting after accepting?

Use the exchanged email address or authorized WhatsApp details and arrange the meeting through an external tool. The platform currently does not provide calendar or session management.

### Can a Mentor moderate inappropriate posts?

Only if the Mentor also has an Admin role. Otherwise, send the content and Space details to an Admin.

## 16. Mentor Quick Self-Check

- My account is connected and my Mentor status is approved.
- I have active access to the target Space.
- I satisfy all seven Member Profile completion requirements.
- My Mentor topics, stages, Strengths, Offering, Availability, and Capacity are accurate.
- When I want to receive requests, I enable `introOptIn` and offer `mentor_match`.
- I complete intent and opt in independently for every Space where I want to participate in Matching.
- I regularly check the Mentoring workspace and the source Space Inbox.
- I understand that scheduling, recordkeeping, and outcome tracking happen outside the platform after acceptance.
- When I want to pause new requests, I disable the relevant Offering or introductions.
