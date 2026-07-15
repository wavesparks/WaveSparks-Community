# Wavesparks AI Matching Engine

## Decision

Matching is computed inside one explicit Space. Main Community and each Event have independent candidate pools, intents, posts, results, feedback, and run history.

The engine is an explainable hybrid: explicit matching-type direction is a hard gate, six structured and semantic factors determine fit, and private feedback suppresses unwanted recommendations. It never treats organization membership alone as eligibility.

## Isolation invariants

`recomputeMatchesForSpace(spaceId)` is the canonical operation.

- Candidates come only from the requested Space.
- A pair who share two Spaces can have two independent match records and explanations.
- Adding an Event participant to Main does not copy Event matches or feedback.
- A profile update recomputes only Spaces that the member can actively use.
- A Space intent, post, roster, or matching-setting change affects only that Space.
- Replacement deletes and inserts results for one Space atomically; it never clears another Space's matches.
- Match reads and feedback writes reauthorize the current Space.

## Eligibility

A candidate must satisfy every condition:

1. The account status is `connected`.
2. The candidate has an `active` entitlement to this Space.
3. The global core profile is complete.
4. The Space intent is complete.
5. Matching is enabled for the Space.
6. The member has opted into matching in this Space.
7. The Space lifecycle is `upcoming`, `active`, or `ended`.

`draft` and `archived` Spaces do not match. An `ended` Event is a Past Event and continues matching until an Admin archives it.

Global Admin authority is not eligibility. An Admin must explicitly join the Space, complete the same profile and intent gates, and opt in before entering its social matching pool.

## Intent and direction

Each Space stores its own current goal, `looking for` list, `can offer` list, and matching opt-in. Updating these values in one Event cannot affect Main Community or another Event.

Organization-defined matching types retain two directions:

- `mutual`: both profiles must participate on both seeking and offering sides.
- `seeker_provider`: the source seeks the type and the target offers it.

There is no automatic co-founder, mentor, collaborator, activity, featured-profile, or reputation boost.

## Score

Each factor is normalized to `0..1`. Admin-configured integer weights total 100.

```text
score = round(
  semantic * w_semantic +
  skills * w_skills +
  venture * w_venture +
  availability * w_availability +
  work_style * w_work_style +
  location * w_location
)
```

For seeker-to-provider types, the source's needs are compared with the target's offering. For mutual types, forward and reverse fit use a harmonic mean so one strong direction cannot hide one weak direction.

Explanations name the strongest weighted factors and concrete overlapping tags. Confidence reports signal coverage, not the probability that two people will work well together.

Default score bands are `high >= 75`, `good >= 60`, and `emerging < 60`. Each matching type also has an Admin-controlled minimum from 35 to 80. At most 12 candidates are stored per source member and matching type in each Space.

## Two embedding layers

Production uses OpenAI `text-embedding-3-large` shortened to 1,024 dimensions. Input is capped at 6,000 characters and sent in batches of 64.

### Global profile embeddings

The reusable core profile produces seeking and offering vectors from venture context, desired roles, help needed, experience, skills, strengths, contribution, constraints, and mentoring context.

These vectors contain no Space-private activity. A post from one Event can never enter the reusable profile embedding and leak semantic context into another Space.

### Space intent embeddings

Each `space_intent` produces separate seeking and offering vectors:

- Seeking uses the current goal, local `looking for` values, and eligible recent intent posts from this Space.
- Offering uses local `can offer` values.

The engine blends the current Space intent vector into the reusable profile vector at 20%. This lets the same person receive different results in different communities while keeping stable profile semantics reusable.

The matching-type description is not embedded because type participation is already a hard gate and repeated template text would inflate similarity.

If `OPENAI_API_KEY` is absent or the provider fails, the run uses the deterministic multilingual token-hash fallback. The fallback model, degraded counts, and provider error are recorded. It supports tests and continuity but is not equivalent to production semantic quality.

## Space-local post policy

Posts are a narrow local signal. Only the author's five newest active intent posts from the current Space and last 90 days are eligible:

- Ask
- Opportunity
- Looking for co-founder
- Looking for mentor

Each body contributes at most 500 characters. General updates, posts from another Space, archived or hidden posts, comments, saves, follows, moderation history, engagement counts, private introduction content, and contact details do not affect the embedding or score.

## Storage and replacement

Vectors stay in PostgreSQL through `pgvector`; no second vector database is required. Exact scoring is appropriate for the current community size. Consider HNSW and SQL preselection only when a single Space approaches roughly 10,000 eligible profiles or measured recompute latency requires it.

Every match and match run carries `space_id`. Recompute preserves existing dismissal and Admin-visibility state for stable match IDs. Feedback remains stored separately so a Space replacement does not erase historical judgments.

## Feedback

Members can mark a recommendation **Helpful** or **Not relevant** and select a controlled reason. Feedback is tied to the match's Space. A dismissal in one Event does not dismiss the same pair in Main Community or another Event.

Not relevant immediately hides the recommendation and remains effective if the stable match disappears and later returns. Feedback does not mutate weights automatically; calibration requires enough data, offline evaluation, and a versioned Admin decision.

## Operations

Each Space recompute records:

- Space ID and algorithm version
- Run status and skip reason
- Active matching-type count
- Eligible profile count
- Match count
- Refreshed global profile embeddings
- Refreshed Space intent embeddings
- Degraded embedding count and provider error

Archived, draft, or matching-disabled Spaces complete as skipped and clear visible results for that Space only. Upcoming, active, and ended Spaces continue normal recomputation.

The organization-level maintenance command is a coordinator only: it enumerates matchable Spaces and calls the Space operation independently for each one.

Primary references: [OpenAI embeddings guide](https://platform.openai.com/docs/guides/embeddings), [pgvector](https://github.com/pgvector/pgvector), and [Neon pgvector](https://neon.com/docs/extensions/pgvector).
