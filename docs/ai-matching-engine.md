# Wavespark AI matching engine

## Decision

The previous engine was not an empty shell: it had deterministic profile heuristics and explanations. Its 24-dimensional "embedding" was only a character-bucket hash, however, no OpenAI request was made, posts were ignored, and every approved pair could receive a co-founder match without explicit intent. Ranking was also capped globally, which could starve members outside the top pairs.

The production engine is now an explainable hybrid. It uses explicit member intent as a hard gate, six configurable structured and semantic factors for scoring, private member feedback for suppression and quality review, and recorded run metadata for operations.

## Eligibility and direction

A recommendation is considered only when both memberships are `approved`, both profiles satisfy onboarding readiness, and both members allow matching.

Matching types are organization-defined templates:

- `mutual`: both profiles must select the type under both seeking and offering.
- `seeker_provider`: the source must seek the type and the target must offer it.

There is no automatic co-founder, mentor, collaborator, activity, featured-profile, or reputation boost.

## Score

Each factor is normalized to `0..1`. Admin-configured integer weights must total 100.

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

For seeker-to-provider types, needs are scored against the target's offering. For mutual types, forward and reverse fit are combined with a harmonic mean so one weak direction cannot be hidden by one strong direction.

The explanation names the strongest weighted factors and concrete overlapping tags. Confidence is separate from fit: it reports profile signal coverage, not the probability that two people will work well together.

Default score bands are `high >= 75`, `good >= 60`, and `emerging < 60`. Each matching type also has an Admin-controlled minimum from 35 to 80. At most 12 candidates are stored per source member and matching type.

## Embeddings

Production uses OpenAI `text-embedding-3-large` shortened to 1,024 dimensions. The model was selected for stronger multilingual retrieval quality than the small model while keeping vectors and transfer costs materially below the default 3,072 dimensions.

Wavespark creates two vectors per profile:

- Seeking: venture context, ideal match, desired roles, help needed, and constraints.
- Offering: biography, skills, strengths, contributions, experience, mentoring context, and venture context.

The matching-type description is not embedded because type membership is already a hard gate and repeated template text would inflate similarity. Inputs are capped at 6,000 characters and sent in batches of 64.

If `OPENAI_API_KEY` is absent or the provider fails, the run uses a deterministic token-hash fallback. Its model name, failed embedding status, degraded count, and error are visible to Admins. It is suitable for tests and continuity, not equivalent to production semantic quality.

## Post policy

Posts are intentionally narrow inputs. Only the author's five newest active intent posts from the last 90 days are eligible: asks, opportunities, co-founder requests, and mentor requests. Each body contributes at most 500 characters, and the resulting vector is blended into seeking intent at 20%.

General updates, archived or hidden posts, comments, saves, follows, moderation history, and engagement counts do not affect matching. This keeps the score understandable and limits popularity feedback loops.

## Storage and retrieval

Vectors stay in the existing Neon Postgres database through `pgvector`; no second vector database is required. The current community is small, so exact scoring provides deterministic results and perfect recall without an approximate index. An HNSW index and SQL candidate preselection should be considered only when an organization approaches roughly 10,000 matchable profiles or measured recompute latency requires it.

Profile contact fields, email, WhatsApp, Clerk identifiers, comments, and private introduction content are excluded from embedding text.

## Feedback loop

Members can mark a recommendation Helpful or Not relevant and select a controlled reason. Not relevant immediately dismisses the match and remains effective if the pair disappears and later returns. Admins see organization-level totals by type and reason, while each feedback record also snapshots the algorithm version and score for evaluation.

Feedback does not automatically mutate weights. Weight changes remain an explicit Admin decision so sparse or coordinated feedback cannot silently reshape matching. A future calibration job should require a minimum sample size, offline evaluation, and a versioned rollout before using aggregate feedback to recommend weight changes.

## Operations

Every recompute records a run with status, algorithm version, active type count, eligible profile count, match count, refreshed embeddings, degraded embeddings, and provider error when applicable.

Recompute is full-organization because profile or configuration changes can alter every member's ranking. Match generation is capped per source and type, and prior member dismissals plus Admin visibility flags are preserved when records are regenerated.

Primary references: [OpenAI embeddings guide](https://platform.openai.com/docs/guides/embeddings), [pgvector](https://github.com/pgvector/pgvector), and [Neon pgvector](https://neon.com/docs/extensions/pgvector).
