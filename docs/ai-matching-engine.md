# Wavesparks AI Matching Engine

## Decision

Matching is computed inside one explicit Space. Main Community and each Event have independent candidate pools, intents, posts, results, feedback, and run history.

The engine is an explainable, calibrated hybrid (`hybrid-v4`): explicit matching-type direction is a hard gate, six structured and semantic factors determine fit, evidence coverage limits how high a result can score, and private feedback suppresses unwanted recommendations. It never treats organization membership alone as eligibility.

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

## Score and calibration

Every visible recommendation has an integer score from `1..100`. The number is a versioned fit index, not a claim that the introduction has that percentage chance of succeeding. Member cards render it as `82/100 match`, never `82% compatible`.

Each factor produces both fit and evidence quality:

- `s_f`: observed fit from `0..1`
- `q_f`: how much relevant evidence is actually present from `0..1`

Unknown values have `q_f = 0`; they are not treated as conflicts or agreement. In particular, imported `0` values for the 1–5 ambition, risk, and structure scales are unknown and can never create working-style points.

Admin-configured integer weights total 100. Fit is normalized only across observed evidence, then pulled toward a conservative baseline according to coverage:

```text
fit = sum(w_f * q_f * s_f) / sum(w_f * q_f)
coverage = sum(w_f * q_f) / sum(w_f)
adjusted_fit = 0.35 + coverage * (fit - 0.35)
```

`adjusted_fit` is mapped to `1..100` with a fixed piecewise calibration curve. Sparse profiles therefore cannot reach a high score from one coincidental signal.

```text
adjusted fit  0.00  0.25  0.35  0.50  0.65  0.78  0.90  1.00
score            1    25    40    60    75    86    95   100
```

For seeker-to-provider types, the source's needs are compared with the target's offering. For mutual types, forward and reverse semantic and capability fit use a harmonic mean so one strong direction cannot hide one weak direction. A mutual result needs observable core evidence in both directions and a minimum directional fit of `0.20`.

High-score safeguards:

- Evidence coverage below `0.50` caps the score at 69.
- Coverage from `0.50..0.64` caps it at 79.
- Coverage from `0.65..0.79` caps it at 89.
- Core need-to-offer fit below `0.65` cannot reach 85.
- A default multi-factor type needs at least two independent strong factors to reach 80.
- A known severe availability conflict caps a mutual result below 60. Commitment conflicts use an explicit matrix (for example, mentoring-only versus a building role, or full-time versus exploratory); an ordinary difference such as exploratory versus serious part-time is not treated as severe.
- Mentor-provider results require an organization-level Approved Mentor designation. Availability and preferred mentee capacity are ranking guidance only; a mentor pauses new matches and direct mentoring requests by turning off the mentor offering.

The default factor emphasis is type-specific:

| Type | Semantic | Skills | Venture | Availability | Work style | Location |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Co-founder | 25 | 20 | 15 | 15 | 20 | 5 |
| Collaborator | 30 | 30 | 15 | 15 | 5 | 5 |
| Mentor | 35 | 30 | 20 | 10 | 5 | 0 |

Explanations name only factors with observed, positive contribution, show the strongest concrete need-to-offer pair in each relevant direction, and then show relevant tags. They never claim working-style or availability compatibility when those fields are missing. Confidence reports evidence coverage, not the probability that two people will work well together.

Default score bands are `high >= 80`, `good >= 65`, and `emerging < 65`. Bands remain available for visual styling and Admin filtering, but member UI always shows the numeric score. Each matching type also has an Admin-controlled minimum from 35 to 80. At most 12 candidates are stored per source member and matching type in each Space.

Equal scores are ordered by confidence, number of contributing evidence families, and then a stable versioned hash. Opaque profile ID order is only the final fallback.

## Two embedding layers

Production uses OpenAI `text-embedding-3-large` shortened to 1,024 dimensions. Input is capped at 6,000 characters and sent in batches of 64.

### Global profile embeddings

The reusable core profile produces seeking and offering vectors from venture context, desired roles, help needed, experience, skills, strengths, contribution, constraints, and mentoring context.

These vectors contain no Space-private activity. A post from one Event can never enter the reusable profile embedding and leak semantic context into another Space.

### Space intent embeddings

Each `space_intent` produces separate seeking and offering vectors:

- Seeking uses the current goal, local `looking for` values, and eligible recent intent posts from this Space.
- Offering uses local `can offer` values.

The engine blends the current Space intent vector into the reusable profile vector at 60%. It also adds the Space's explicit `looking for` and `can offer` values directly to the structured directional capability comparison. This makes a member's current Event goal dominate stale global context without leaking that private intent into another Space.

Vectors are compared or blended only when their embedding model identifiers match. Provider embeddings and the local token-hash fallback can have the same dimensions but do not share a vector space. Local fallback semantic evidence receives reduced quality so it cannot manufacture a very high score on its own.

The matching-type description is not embedded because type participation is already a hard gate and repeated template text would inflate similarity.

If `OPENAI_API_KEY` is absent or the provider fails, the run uses the deterministic multilingual token-hash fallback. The fallback model, degraded counts, and provider error are recorded. It supports tests and continuity but is not equivalent to production semantic quality.

Structured tags are normalized, aliased, deduplicated, and compared directionally: the denominator is what the seeker needs, rather than the smaller of both sets. Matching-type labels such as `mentor`, `co-founder`, and `collaborator` are eligibility signals, not skills. Within a candidate pool, rarer exact needs receive more weight than ubiquitous tags; a shared broad sector can provide context but cannot create a high score by itself.

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

Member and Admin reads accept only records whose `algorithm_version` equals the running engine version. Older rows remain temporarily available to the atomic recompute so stable dismissal and Admin-visibility state can be carried forward, but they are never presented as current scores. The `hybrid-v4` migration removes any out-of-range derived rows, enforces the `1..100` database range, and updates only matching-type weights that still exactly equal the legacy defaults; Admin-customized weights are preserved.

## Feedback

Members can mark a recommendation **Helpful** or **Not relevant** and select a controlled reason. Feedback is tied to the match's Space. A dismissal in one Event does not dismiss the same pair in Main Community or another Event.

Not relevant immediately hides the recommendation and remains effective if the stable match disappears and later returns. Feedback does not mutate weights automatically. After each match type has enough labeled outcomes, its fixed curve can be replaced with an offline, versioned isotonic calibration using Helpful, Not relevant, and accepted introductions. Missing clicks are not negative labels. A learned calibration is published only after held-out temporal validation; online requests never silently change weights.

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

After deploying a new algorithm version, first dry-run `pnpm cron:matches -- --environment=production`, then run `pnpm cron:matches -- --environment=production --apply --confirm-production` so every organization and eligible Space receives current scores immediately. The daily Vercel Cron also enumerates every organization as a fallback; an Admin-triggered per-organization or per-Space recompute remains available for targeted refreshes.

Primary references: [OpenAI embeddings guide](https://platform.openai.com/docs/guides/embeddings), [pgvector](https://github.com/pgvector/pgvector), and [Neon pgvector](https://neon.com/docs/extensions/pgvector).
