# WaveSparks Community Member User Manual

Version: 1.0
Audit baseline: Code and current interface as of July 29, 2026
Intended audience: Regular members invited to join WaveSparks Community

> This guide describes behavior implemented in the current codebase. Organization names, events, members, and content vary by deployment. Refer to the deployed interface for the exact English button labels.

## 1. Product Purpose and the Complete Member Journey

WaveSparks Community is an invitation-only member community organized around Spaces. A Member maintains one global profile shared across Spaces and, within an authorized Main Space or Event Space, can browse content, discover people, receive match suggestions, request introductions, and share useful resources.

A typical Member lifecycle is:

1. Receive an invitation email from the organization.
2. Register or sign in to a Clerk account using the verified email address associated with the invitation.
3. Accept the invitation and connect the local member identity.
4. Complete the global Profile.
5. Select an authorized Main Space or Event from My Spaces.
6. Browse Feed, People, Knowledge, and Opportunities, and participate in community interactions.
7. Set a separate Matching intent for each Space, review match suggestions, and provide feedback.
8. Request or respond to an Introduction; exchange contact details after acceptance.
9. Continue maintaining the Profile, notifications, saved content, and cross-Space history.
10. Exit according to the data rules in this guide when an event ends, access is removed, or the account is suspended or deleted.

![My Spaces home](../assets/manuals/member-home.png)

## 2. Access Model: What to Know Before You Begin

Signing in successfully does not grant access to every Space. Access to a specific Space requires all of the following:

- The community account status is `connected`.
- The organization has assigned that Space to the Member.
- The Space access status is `active`.
- The Space lifecycle status is `upcoming`, `active`, or `ended`.

Members cannot see `draft` or `archived` Spaces. An `ended` Event appears under Past events and, in the current version, remains available for browsing and interaction. Access ends only after the Event is archived.

The Main Space is also invitation-only. A Member invited only to a specific Event sees a locked Main Space card but does not automatically receive Main Space access. Members cannot independently request to join, RSVP, check in, unsubscribe from an Event, or leave a Space.

Each Space has its own Feed, follows, saved items, Matching intent, match results, and Introductions. The global Profile and account-level Inbox are shared across Spaces.

## 3. Accepting an Invitation, Registering, and Signing In

### 3.1 Standard flow

1. Open the invitation email sent by WaveSparks or Clerk.
2. Click the invitation link within its seven-day validity period.
3. If you are not signed in, register or sign in as prompted.
4. Use the exact email address named in the invitation, and make sure that address is verified.
5. After verification, the system marks the invitation as accepted and connects the Clerk identity to the local Member account.
6. Complete the Profile on first entry; on later visits, select a Space from the organization home page.

The invitation link contains a single-use random token. When opened, the token is exchanged for a secure handoff cookie that remains valid for approximately 15 minutes, and the token is removed from the address bar. Do not forward an invitation link to anyone else.

### 3.2 Resolving invitation failures

- **Invalid:** The link is incomplete or the token is invalid. Open the original email and try again.
- **Expired:** The invitation is more than seven days old. Ask an Admin to resend it.
- **Inactive:** The invitation has already been accepted or revoked. Sign in normally or contact an Admin.
- **Email mismatch:** Sign out of the current Clerk account and sign in with the invited email address. That email must be verified.
- **Account conflict:** The current identity is already connected to a different local record. An Admin must investigate; changing a display email cannot bypass this check.
- **Pending page:** The account is not yet connected, has been suspended, or has been deprovisioned. Contact an Admin.

In production, the application does not connect a local member merely because an email address appears to match. Do not create another account with a similar email address in an attempt to claim the invitation.

### 3.3 Signing out and account credentials

Sign out from the account menu in the upper-right corner. Passwords, MFA, active sessions, and other Clerk account operations depend on the deployed Clerk configuration, so the available controls may vary. The application currently has no separate local Account Settings page.

## 4. My Spaces and the Event Lifecycle

The organization home page groups accessible Spaces as follows:

- **Main Space:** The long-running community Space. Availability depends on access granted by an Admin.
- **Your events:** Event Spaces whose lifecycle status is `upcoming` or `active`.
- **Past events:** Event Spaces whose lifecycle status is `ended`.

An Event is a dated community Space with a lifecycle; it is not a ticketing or scheduling product. The current version has no registration capacity, payment, check-in, livestream, course-completion, or certificate workflow.

When only one Space is accessible, some legacy links may redirect automatically to that Space. When multiple Spaces are accessible, legacy organization-level Feed or Matches links generally return to My Spaces. Select the correct Space before continuing.

## 5. Completing the Global Profile

The Profile is shared across every Space and can be saved as a draft one step at a time. An incomplete Profile still permits access to Home and limited browsing of Feed, Knowledge, Opportunities, and existing Introductions. However, interactive features such as People, Matches, posting, commenting, following, saving, and requesting or responding to an Introduction remain restricted.

### 5.1 The four Profile steps

1. **About you**
   - Name, Preferred name, display preference, and avatar;
   - City, country, time zone, school or company, and current status;
   - Headline and Bio;
   - LinkedIn, GitHub, personal website, and X links.
2. **Interests & experience**
   - Problems of interest, Current focus, and technical and product experience;
   - Skills, industries, and problem-domain tags;
   - Project or startup name, stage, description, and progress.
3. **Connections**
   - What you are looking for and what you can offer;
   - Target roles, help needed, and potential contributions;
   - Time commitment, start timing, remote preference, region, meeting frequency, and ideal match.
4. **Contact & preferences**
   - Working and communication preferences;
   - Introduction contact email;
   - WhatsApp number and whether to share it after accepting an Introduction;
   - Whether to accept new Introductions.

![Profile setup](../assets/manuals/member-profile-setup.png)

### 5.2 Completion requirements

The system considers a Profile complete only when all seven of the following are present:

- Preferred name;
- Headline;
- Bio;
- Current focus;
- At least one Looking for type;
- At least one Skill tag;
- A valid Introduction email.

The global Profile completion rule requires a Looking for selection even if you intend to disable Matching in every Space. This is a limitation of the current version.

### 5.3 Formatting and privacy

- External links must use HTTP or HTTPS.
- An avatar can use a public image URL or an uploaded JPG, PNG, or WebP file of up to 2 MB.
- Uploaded avatars use a public asset URL. Do not upload identity documents or private images.
- The Introduction email is used only for introductions and does not change the Clerk sign-in email.
- Public social links in the Profile are displayed in member profiles within the current Space.

## 6. Space Navigation and Feed

Within a Space, the top navigation includes Feed, People, Matches, Knowledge, Opportunities, and Introductions. Use the Space switcher to confirm the current context. Posts, follows, saved items, and Matching activity apply only to the current Space.

![Space Feed](../assets/manuals/member-feed.png)

### 6.1 Publishing content

The following post types are currently supported:

- General update;
- Question;
- Resource;
- Announcement;
- Opportunity;
- Looking for cofounder;
- Looking for mentor.

A post can include a title, body, tags, relevant roles, project context, an external-link preview, `@mention` references, and images. When a regular Member publishes an Opportunity, the source is fixed as participant/member; a Member cannot select organizer or mentor as the source.

Primary limits are:

- Title: up to 160 characters; body: up to 10,000 characters.
- A General update may omit the title; every other post type requires one.
- A post must contain at least a body or an image.
- Up to four images per post; each image can be up to 5 MB and must be JPG, PNG, or WebP.
- Images are processed into WebP, with a longest edge of no more than 2,400 px and a maximum of 40 megapixels.
- Comments can contain up to 2,000 characters.
- A post can reference up to 10 distinct members and include up to 20 mention ranges.

### 6.2 Browsing and interacting

Feed supports search and filters for content type, tags, author identity, startup stage, industry, and roles needed. Follow relationships and match relationships influence recommended content.

A Member can:

- Open a post and add a comment.
- Follow or unfollow the author.
- Save or unsave a post.
- Request a General introduction to the post author.

The current version does not support self-service editing or deletion of posts or comments, likes or reactions, reporting, blocking, muting, or direct messaging. Contact an Admin when content requires moderation.

## 7. People and Member Discovery

The People directory displays only members in the current Space whose accounts are connected, whose Space access is `active`, and whose Profiles are complete.

Search by name, project, or skill, and filter by affiliation, Approved Mentor status, startup stage, industry, needs, and skills. A member profile may display:

- Display name, Affiliation, Headline, Bio, and Current focus;
- Project, startup stage, experience, Skills, Needs, and industry tags;
- Public LinkedIn, GitHub, website, and X links;
- An Approved Mentor's expertise, supported stages, Offering, availability, and capacity.

Following applies only within the current Space and can influence Feed recommendations. The other member is not notified when followed.

## 8. Configuring Matching for Each Space

Matching requires three layers of eligibility: a complete global Profile, Matching enabled in the current Space, and a complete personal intent with opt-in for the current Space.

### 8.1 Setting an intent

On the Matches page, provide:

- Current goal;
- Looking for;
- What I can offer;
- Include me in match suggestions.

For an intent to be complete, it must include a Current goal and at least one item under either Looking for or Offer. Configure every Space separately; settings from the Main Space are not copied to an Event.

### 8.2 Understanding match results

![Member Matches page](../assets/manuals/member-matches.png)

A match card shows a 0-100 Fit index, an explanation, and shared tags. The score represents the fit between the current Profiles and intents. It is not a probability of successful collaboration, a credit score, a reputation score, or an evaluation of service quality.

A candidate must also satisfy all of the following:

- Have `active` access to the current Space.
- Have a `connected` account and a complete Profile.
- Accept Introductions.
- Have a complete intent and opt in to Matching in the current Space.
- Not be hidden by an Admin or marked Not relevant by you.

You can filter by match type and mark a result Helpful or Not relevant. Not relevant requires a reason; the result is then hidden, and the dismissal persists across later recomputations. In the current version, feedback does not immediately retrain any public weighting model.

## 9. Complete Introduction Workflow

An Introduction is a controlled request inside the platform, not a chat thread. It can be initiated from:

- A member profile in People;
- A match card in Matches;
- A post author.

If the recipient is an Approved Mentor who accepts mentoring requests, you can request a Mentoring introduction from the profile or a mentor match. A request initiated from a post author is always a General introduction.

### 9.1 Requesting an Introduction

1. Confirm that both participants are in the current Space and have complete Profiles.
2. Select General or, when permitted, Mentoring.
3. Complete Purpose, Note, and Suggested opening message.
4. Submit the request; its status becomes `pending`.

Within the same organization, the same pair of members can have at most one `pending` request at a time, regardless of direction, type, or source Space. The requester currently cannot withdraw a request.

### 9.2 Responding and sharing contact details

Request status transitions are `pending → accepted` or `pending → declined`. The system can also change an invalid request to `expired`.

- **Pending:** The request awaits the recipient's response. It does not grant either participant access to a new Space.
- **Accepted:** Both participants can see each other's Introduction email. A WhatsApp number appears only if its owner chose to share it after accepting an Introduction.
- **Declined:** The result remains in history, but the recipient's contact details are not disclosed.
- **Expired:** The request may expire when an account, Mentor qualification, Space access, or another prerequisite is no longer valid.

Admins can view contact details in member Profiles for legitimate community operations. Therefore, “visible after acceptance” describes visibility between the regular participants; it does not hide those details from organization administrators.

The platform has no built-in direct messaging, video meetings, or calendar. After acceptance, communicate through an external channel agreed upon by both participants.

## 10. Knowledge, Opportunities, Saved Items, and Notifications

### 10.1 Knowledge

Knowledge includes Library and Saved. You can search Resources, Featured content, active discussions, and posts you have saved. Saved items are isolated by Space.

### 10.2 Opportunities

Opportunities aggregates opportunity-related content. Filter by organizers, participants, mentors, or all sources, and use detailed filters similar to Feed. A regular Member can publish only with a participant/member source.

### 10.3 Inbox and in-app notifications

Current notification types include:

- Membership approved;
- Introduction requested, accepted, or declined;
- Manual introduction;
- Admin note;
- Post mention and Comment mention.

There are no follow notifications, like notifications, push notifications, or daily digests. When Resend is not configured, in-app notifications are still created, but product emails are skipped. Clerk sends the initial invitation email.

The Global Inbox retains accepted and declined Introduction history even if you later lose access to the source Space. Pending and expired items normally appear only while the source Space remains accessible. Content mentions remain usable only while the content is visible and you still have access to its Space.

## 11. Event Completion, Access Changes, and Account Status

### 11.1 An Event becomes ended or archived

- **`ended`:** The Event moves to Past events. In the current version, posting, commenting, Matching, and Introductions remain available.
- **`archived`:** The Event is no longer visible or accessible to Members.

### 11.2 Space access is removed

Feed, People, Matches, Knowledge, and Opportunities for that Space become inaccessible. Accepted and declined Introduction history may remain in the Global Inbox, but that history does not restore Space access.

### 11.3 An account is suspended or deprovisioned

An account that is `suspended`, `deprovisioned`, or not yet connected is sent to Pending and cannot continue using the community. Contact an Admin to investigate the invitation or account status.

## 12. Account Deletion and Data Retention

The application currently has no self-service control for deleting the local community account, exporting personal data, suspending the account, or leaving a Space. If the deployed Clerk configuration allows a user to delete their identity, local data is anonymized only after Clerk successfully sends the `user.deleted` Webhook.

Anonymization has the following effects:

- The name becomes Former member.
- Avatar, Bio, location, project, Matching, mentoring, contact, and related Profile details are cleared.
- The Clerk ID is removed and the account becomes deprovisioned/suspended.
- Invitations, account links, matches, follows, saved items, and notifications are deleted.
- Pending Introductions expire and their contact details are removed.
- Existing posts and comments are retained, with the author displayed as Former member.

To request deletion, data export, or departure from a Space, first contact the organization Admin. Confirm that both the Clerk identity deletion and the local Webhook processing have completed.

## 13. Privacy and Security Guidance

- Profiles, posts, and interactions are available only to active participants in the current Space.
- Social links appear in member profiles. Add only links you intend to share.
- Introduction email and an authorized WhatsApp number become visible to the two participants only after a request is accepted. Admins can still view Profile details for community operations.
- Avatars use public asset URLs; post images are retrieved through authenticated application endpoints.
- Do not forward invitation links or publish passwords, API keys, identity documents, or other sensitive information in posts.
- There is currently no reporting control for suspicious Introductions or content. Contact an Admin.

## 14. Explicitly Out of Scope in the Current Version

- Points, levels, leaderboards, earnable badges, or certificates;
- Event RSVP, ticketing, check-in, livestream, or course-completion workflows;
- Direct messages, group chat, voice calls, or video meetings;
- Self-service editing or deletion of posts and comments, likes, reporting, blocking, or muting;
- Self-service requests to join or leave a Space, or withdrawal of an Introduction;
- Personal data export or local account deletion;
- Standalone Project management, task management, or collaboration boards.

Interface tags, the Approved Mentor label, lifecycle statuses, and the Profile completion percentage are classifications or progress indicators. They are not reward points or achievement badges.

## 15. Frequently Asked Questions

### Why am I still on Pending after signing in?

The local invitation may not have been accepted successfully, the email may be unverified, or the account may be suspended or deprovisioned. Re-enter through a valid invitation. If the issue continues, ask an Admin to inspect the account status instead of registering repeatedly.

### Why can I see Feed but cannot comment or follow?

An incomplete Profile permits limited browsing but restricts interaction. Complete all seven required fields and try again.

### Why do my Matching settings for one Event not appear in another Space?

Matching intent, results, feedback, follows, and saved items are isolated by Space. This is expected behavior.

### Why can I still post after an Event has ended?

In the current lifecycle, `ended` means Past event, not read-only. Access stops after an Admin archives the Event.

### Why is there no in-app chat after an Introduction is accepted?

The platform handles discovery, the request, mutual consent, and contact exchange. Subsequent communication takes place in an external tool selected by both participants.

### What should I do if an email does not arrive?

Check the in-app Inbox and the email account's spam folder first. Clerk sends invitation emails, while Resend normally sends other product notifications. Ask an Admin to inspect the corresponding provider.

## 16. Quick Self-Check

- I signed in with the verified email address named in the invitation.
- I can see the correct Space under My Spaces.
- I completed all seven required Profile fields.
- My Introduction email is correct, and my public social links are appropriate to display.
- I completed an intent and opted in separately in every Space where I want Matching.
- I understand that Fit index represents compatibility only.
- I will not publish sensitive contact details in a post before accepting an Introduction.
- I know that access changes, content moderation, and account deletion require assistance from an Admin.
