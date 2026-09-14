# Job Match API

A small, transparent, rule-based API that recommends jobs to candidates based on
skill, experience, location and salary fit — and explains every number it produces.

No machine learning, no black box. Every score can be traced back to a rule you can
read in one file: [`src/scoring/scorer.ts`](src/scoring/scorer.ts).

---

## Contents

- [Quick start](#quick-start)
- [Running with Docker](#running-with-docker)
- [API reference](#api-reference)
- [**The scoring formula and why these weights**](#the-scoring-formula-and-why-these-weights) ← the important part
- [Architecture](#architecture)
- [Tests](#tests)
- [Assumptions](#assumptions)
- [What I would do differently with more time](#what-i-would-do-differently-with-more-time)
- [How I used AI tools](#how-i-used-ai-tools)

---

## Quick start

Requires Node.js 20 or newer (developed on Node 22).

```bash
npm install
npm run dev          # starts on http://localhost:3000 with in-memory storage
```

In a second terminal, load some sample data and try it:

```bash
npm run seed         # creates 3 candidates and 5 jobs, prints their ids
curl -s "http://localhost:3000/candidates/<candidate-id>/recommendations?limit=3" | jq
```

Other scripts:

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm test` | Run the full test suite |
| `npm run typecheck` | Typecheck src, tests and scripts |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build |
| `npm run seed` | Post sample data to a running API |

Storage is chosen by environment. With no `DATABASE_URL` the API keeps everything in
memory, so it runs with zero setup. Set `DATABASE_URL` and it uses Postgres instead.
Nothing else changes — same routes, same responses, same scores.

---

## Running with Docker

Brings up the API and a Postgres instance, with the schema applied automatically:

```bash
docker compose up --build
curl http://localhost:3000/health
```

If port 3000 is busy on your machine:

```bash
API_PORT=3010 docker compose up --build
```

Tear down, including the database volume:

```bash
docker compose down -v
```

Notes:
- The schema in [`db/init.sql`](db/init.sql) is applied on first start of an empty volume.
- The bind mount uses the `:z` flag so it works on SELinux hosts such as Fedora and RHEL.
  The flag is ignored everywhere else.
- The image is a multi-stage build: TypeScript is compiled with dev dependencies, and the
  runtime stage installs production dependencies only and runs as the non-root `node` user.

---

## API reference

### `POST /candidates`

```bash
curl -X POST http://localhost:3000/candidates \
  -H 'content-type: application/json' \
  -d '{
    "name": "Asha Rao",
    "skills": ["TypeScript", "Node.js", "PostgreSQL", "Docker"],
    "yearsOfExperience": 5,
    "location": "Bengaluru",
    "expectedSalary": 2000000
  }'
```

Returns `201` with the created candidate including a generated `id`.

### `POST /jobs`

```bash
curl -X POST http://localhost:3000/jobs \
  -H 'content-type: application/json' \
  -d '{
    "title": "Senior Backend Engineer",
    "requiredSkills": [
      { "name": "TypeScript", "importance": "must-have" },
      { "name": "Node.js",    "importance": "must-have" },
      { "name": "Kubernetes", "importance": "nice-to-have" }
    ],
    "minYearsExperience": 4,
    "location": "Bengaluru",
    "salaryRange": { "min": 2000000, "max": 2800000 },
    "remoteAllowed": false
  }'
```

### `GET /candidates/:id/recommendations`

Ranked jobs for one candidate.

| Query param | Default | Meaning |
|---|---|---|
| `limit` | all | Return only the top N results |
| `wSkills` | 50 | Weight for the skills dimension |
| `wExperience` | 20 | Weight for the experience dimension |
| `wLocation` | 15 | Weight for the location dimension |
| `wSalary` | 15 | Weight for the salary dimension |

Weights are normalised to sum to 100, so you can pass ratios such as
`?wSkills=2&wExperience=1&wLocation=1&wSalary=1` and still get a 0–100 score.

```json
{
  "candidateId": "c6ab33b7-…",
  "weights": { "skills": 50, "experience": 20, "location": 15, "salary": 15 },
  "totalEligible": 3,
  "count": 2,
  "recommendations": [
    {
      "jobId": "a1096bd6-…",
      "title": "Remote Platform Engineer",
      "score": 93.0,
      "breakdown": {
        "skills":     { "score": 50,   "max": 50, "detail": "1/1 must-have, 1/1 nice-to-have skills matched" },
        "experience": { "score": 20,   "max": 20, "detail": "5y meets minimum of 3y" },
        "location":   { "score": 10.5, "max": 15, "detail": "different location but remote allowed" },
        "salary":     { "score": 12.5, "max": 15, "detail": "expectation 2000000 falls inside range 1800000-2400000" }
      }
    }
  ]
}
```

`totalEligible` is the number of jobs that passed the must-have filter, before `limit`
was applied. It lets a client tell "only 2 jobs matched" apart from "2 of 47 shown".

### `GET /jobs/:id/recommendations`

The reverse view: best-fit candidates for one job. Same query params, same scoring,
same breakdown shape, with `candidateId` and `name` in place of `jobId` and `title`.

### Others

- `GET /candidates`, `GET /candidates/:id`
- `GET /jobs`, `GET /jobs/:id`
- `GET /health`

Errors are always JSON: `400` for validation failures with a per-field `details` array,
`404` for unknown ids and routes, `500` for anything unexpected.

---

## The scoring formula and why these weights

### Step 1: the hard filter, before any scoring happens

**A job requiring a must-have skill the candidate does not have is removed entirely.**
It is not scored, not ranked, not returned, no matter how well everything else fits.

This is deliberately implemented as a separate function
([`checkEligibility`](src/scoring/scorer.ts)) that runs *before* the scorer, rather than
as a large negative score. Two reasons:

1. **A disqualification is not a discount.** If a job needs Rust and you do not write Rust,
   no amount of salary or location fit changes that. Expressing it as a score would be
   lying about what the number means.
2. **No weight configuration can defeat it.** Because weights are configurable, a
   "penalty" approach could be overridden by a client sending `wSkills=1`. A boolean gate
   cannot be tuned away.

Nice-to-have skills are never part of this gate. They only ever add points.

### Step 2: score the survivors across four dimensions

Default weights, and the reasoning:

| Dimension | Weight | Why this much |
|---|---:|---|
| Skills | **50** | Skills decide whether someone can actually do the job. It is the only dimension that is hard to change in the short term; a candidate can relocate or negotiate salary, but cannot learn Kubernetes by Monday. It gets half the total on its own. |
| Experience | **20** | A meaningful signal, but a *proxy* for skill rather than skill itself. Years and competence correlate loosely. Second largest, but well behind skills. |
| Location | **15** | Real friction, but increasingly negotiable, and fully solved by remote work. |
| Salary | **15** | Equally negotiable in practice. Ranges are usually soft, and a good candidate often moves the number. |

Skills and experience together are 70% of the score, because together they answer
"can this person do this job?". Location and salary are the remaining 30%, because they
answer "would this work out logistically?", which is the easier problem to solve.

The split is a starting point, not a law, which is exactly why it is configurable per
request. A recruiter filling an on-site role in a specific city can send
`?wLocation=40` and get a ranking that reflects their reality.

### Skills — 50 points

```
score = (matched skills / total skills listed on the job) × 50
```

By the time scoring runs, every must-have is already matched, so in practice this
measures **nice-to-have coverage**. A job listing no skills at all scores full marks,
since there is nothing to fail.

Example: a job lists 2 must-haves and 2 nice-to-haves. A candidate with both must-haves
and one nice-to-have scores 3/4 × 50 = **37.5**.

Matching is case- and whitespace-insensitive, so `"  typescript "` matches `"TypeScript"`.

### Experience — 20 points

```
at or above the minimum   →  20
below the minimum         →  (years ÷ minimum) × 20
no minimum specified      →  20
```

**Why penalise rather than exclude.** This was the most considered decision in the whole
scorer, and I chose penalise for three reasons:

1. **`minYearsExperience` is a heuristic, not a requirement.** It is a hiring manager's
   rough proxy for "enough skill". The skills list is the *direct* measurement of the same
   thing, and this API already checks that properly. Excluding on a proxy when you hold the
   real signal throws away information.
2. **The boundary is arbitrary and the cliff is brutal.** A candidate with 2.9 years and a
   candidate with 3.0 years are indistinguishable in practice. A hard filter says one is
   perfect and the other does not exist. A linear penalty says one scores slightly lower,
   which is the truth.
3. **Excluding produces silent, unexplainable results.** The whole point of this API is the
   breakdown. Penalising leaves the job visible with `"2y is below minimum of 3y (66% of
   requirement)"` attached, so a candidate understands *why* it ranked where it did. An
   excluded job just vanishes with no explanation.

The penalty is proportional, not flat, so the gap scales with how far short you are.
Half the required experience costs you half the points. Zero experience against a
three-year minimum scores zero on this dimension — but the job still appears, because
strong skills may still make it worth applying for.

There is deliberately **no bonus for over-qualification**. Fifteen years against a
three-year minimum scores the same 20 as exactly three years. Extra years past the bar
are not evidence of a better match, and rewarding them would quietly bias the whole
ranking towards senior candidates on every job.

### Location — 15 points

```
exact match      →  15      (100%)
remote allowed   →  10.5    ( 70%)
neither          →   0
```

The required ordering is exact > remote > mismatch. I chose **70%** for remote rather than
something closer to full marks because co-location still carries real advantages — onboarding,
team cohesion, timezone overlap — but the gap should not be large enough to bury an
otherwise excellent remote match. At 70%, a remote job loses 4.5 points out of 100, which
reorders near-ties without dominating the ranking. An exact match always beats remote,
even when the job also allows remote.

Comparison is case-insensitive and whitespace-normalised.

### Salary — 15 points

Scored on where the candidate's expectation sits relative to the job's range:

```
range min ≥ expectation           →  15         "comfortably above expectation"
expectation inside the range      →  15 → 7.5   linear, 100% at range min down to 50% at range max
range max just below expectation  →  7.5 → 0    linear over a 10% shortfall tolerance
range max well below expectation  →  0          "near zero", as required
```

The shape follows the brief directly: a job whose max is below expectation scores near
zero, and a job comfortably above expectation scores highest.

Two choices inside that shape are mine:

- **50% at the top of the range.** If your expectation equals the job's maximum, the job
  *can* pay you what you want, but only by going to the very top of its band, which rarely
  happens. Half marks reflects "technically possible, realistically a stretch".
- **A 10% shortfall tolerance instead of a cliff.** Without it, a job paying 1% below
  expectation would score identically to one paying 50% below — both zero. That is clearly
  wrong. Within 10%, the score decays smoothly to zero, because a small gap is a
  negotiation and a large gap is a non-starter.

The dimension is monotonic by construction: raising a job's maximum can never lower its
salary score. There is a test asserting exactly that, because it is the kind of property a
sign error in the formula would silently break.

### Putting it together

Dimension scores are summed and rounded to one decimal. Because weights are normalised to
100, the breakdown always adds up to the total, and the total is always within 0–100.
Ties break on title then id, so results are deterministic and tests are not flaky.

**A worked example.** Asha Rao has TypeScript, Node.js, PostgreSQL and Docker, 5 years,
Bengaluru, expects ₹20L. Against "Remote Platform Engineer" (needs TypeScript, likes
Docker, 3 years minimum, Hyderabad but remote, ₹18L–24L):

| Dimension | Score | Why |
|---|---|---|
| Skills | 50 / 50 | has the must-have and the nice-to-have |
| Experience | 20 / 20 | 5y clears the 3y minimum |
| Location | 10.5 / 15 | different city, but remote is allowed |
| Salary | 12.5 / 15 | ₹20L sits inside the ₹18L–24L band |
| **Total** | **93.0** | |

---

## Architecture

```
src/
├── domain/
│   ├── types.ts          Candidate, Job, RequiredSkill — no framework types
│   └── schemas.ts        Zod schemas; the only place untrusted input is parsed
├── scoring/
│   ├── weights.ts        default weights + normalisation to 100
│   ├── scorer.ts         eligibility gate + four pure dimension scorers
│   └── recommend.ts      filter → score → sort → limit, in both directions
├── repositories/
│   ├── repository.ts     the storage interface
│   ├── memory.ts         in-memory implementation
│   ├── postgres.ts       Postgres implementation
│   └── index.ts          picks one based on DATABASE_URL
├── routes/               thin Express handlers
├── errors.ts             one error middleware: Zod → 400, HttpError → status, else 500
├── app.ts                wiring
└── server.ts             process lifecycle
```

**The organising principle: the scorer does not know that HTTP or a database exists.**
Every scoring function takes plain objects and returns plain objects, synchronously. That
makes the business rules testable with no mocks, no fixtures beyond two literal objects,
and no async, and it means the rules can be reused unchanged by a CLI, a batch job or a
queue consumer.

Everything else supports that centre:

- **Validation happens once, at the edge.** Zod parses request bodies into typed domain
  objects in the route handler. Nothing downstream re-checks, because the types guarantee it.
- **Handlers throw, middleware translates.** Route code has no status-code logic beyond the
  happy path, which keeps it short enough to read at a glance.
- **Storage is an interface with two implementations.** This is what lets the project run
  with zero setup *and* satisfy the Postgres bonus without a single conditional inside a
  route. Both implementations were verified to produce identical scores for identical input.
- **Route mounting order matters.** The recommendation routers mount before the resource
  routers, otherwise `GET /candidates/:id` would shadow `GET /candidates/:id/recommendations`.

### Database schema

Skills are stored inline — `text[]` for candidates, `jsonb` for jobs — rather than in join
tables. The scorer always loads a row's entire skill list and never queries across skills,
so normalising them would add joins and buy nothing.

---

## Tests

```bash
npm test
```

59 tests across three files, weighted heavily towards the scoring logic, which is where
the assignment says the value is.

| File | Focus |
|---|---|
| [`tests/scoring.test.ts`](tests/scoring.test.ts) | Each dimension in isolation, plus weight normalisation |
| [`tests/recommend.test.ts`](tests/recommend.test.ts) | Filtering, ranking, limits, both directions |
| [`tests/api.test.ts`](tests/api.test.ts) | The real Express app via Supertest, no mocks |

Edge cases covered explicitly, including the two the brief calls out:

- **Candidate missing a must-have skill** — absent from results even when the job is a
  far better match on salary, location and experience. Tested as a unit *and* through HTTP.
- **No salary overlap at all** — scores zero on that dimension.
- Salary expectation exactly at the range minimum, exactly at the maximum, just below the
  maximum, and far below it.
- A zero-width salary range (`min === max`), which would divide by zero if written naively.
- **Salary monotonicity** — a property test asserting that a higher range maximum never
  produces a lower score.
- Experience exactly at the minimum, far above it, at zero, and against a job with no minimum.
- Exact location match on a job that also allows remote (exact must still win).
- Skills matched across different casing and stray whitespace.
- A job that lists no skills at all.
- An all-zero weight set, which must return `400` rather than dividing by zero.
- `limit=0`, negative limits, unknown ids, unknown routes, malformed JSON.

---

## Assumptions

1. **Skills match exactly, after normalising case and whitespace.** `"typescript"` matches
   `"TypeScript"`. There is no synonym handling, so `"Node"` and `"Node.js"` are different
   skills, and no seniority parsing, so `"Senior React"` is not `"React"`.
2. **Locations are opaque strings compared for equality.** `"Bengaluru"` and `"Bangalore"`
   do not match, and there is no notion of nearby cities, metro areas or countries.
3. **`expectedSalary` is a single number, not a range,** as specified in the data model.
   Currency and period are not modelled; all figures are assumed to be in the same unit.
4. **Skill proficiency is not modelled.** Having a skill is binary. The data model has no
   place to express "3 years of React" versus "touched React once".
5. **No de-duplication or recency.** Every job in the store is a candidate for
   recommendation, regardless of age or whether the candidate has already seen it.
6. **Jobs are scored independently.** There is no diversity logic, so five near-identical
   jobs from the same company will occupy the top five slots.
7. **IDs are server-generated UUIDs.** Clients cannot choose them.
8. **No authentication, no pagination beyond `limit`, no update or delete endpoints**, per
   the stated scope.

### A known property of the formula, stated plainly

A job that lists exactly one skill the candidate happens to have scores a full 50/50 on
skills — the same as a job listing six skills the candidate fully matches. By the
definition used ("what fraction of what this job asked for does the candidate have?") that
is correct, and in practice such jobs still rank low because the other dimensions catch
them. But it does mean the skills dimension measures *coverage*, not *depth*, and a sparse
job posting is easier to score well on than a detailed one. I would address this with a
demand factor (see below) rather than by changing the definition.

---

## What I would do differently with more time

**Scoring**

- **A demand factor on the skills dimension**, so a job listing six skills that a candidate
  fully matches outranks a job listing one. Something like scaling by
  `log(1 + skillCount)` would reward depth of match without letting verbose postings dominate.
- **Weighted nice-to-haves.** Right now every nice-to-have is worth the same. A job could
  reasonably say one of them matters twice as much as another.
- **Skill proficiency levels**, so the scorer can distinguish familiarity from expertise.
- **Adjacent-skill credit** via a small curated graph, so React implies JavaScript and
  Postgres implies SQL. This is the single biggest accuracy win available, and deliberately
  still rule-based and explainable, not learned.
- **Geographic awareness** — city aliases, then distance or metro-area grouping, so
  "Bangalore" matches "Bengaluru" and a nearby suburb is not treated as a total mismatch.
- **Calibration against real outcomes.** The weights are reasoned, not measured. Given
  historical application and hire data I would check whether 50/20/15/15 actually predicts
  anything, and tune it. That is a statistical exercise, not a machine learning one, and
  the result stays a transparent set of numbers.

**Engineering**

- **Indexed pre-filtering.** Recommendations currently load every job and score it in
  memory, which is O(n) per request. Fine for this scale, wrong at 100k jobs. The must-have
  filter is the natural thing to push into Postgres as a `jsonb` containment query with a
  GIN index, scoring only what survives.
- **Pagination** with cursors, rather than only `limit`.
- **Database migrations** via a proper tool rather than a single `init.sql` applied on
  first boot.
- **Structured logging and request IDs**, plus rate limiting and CORS for a real deployment.
- **A Postgres-backed integration test** in CI using Testcontainers, so the Postgres
  repository is covered automatically rather than by the manual verification I did.
- **OpenAPI spec** generated from the Zod schemas, since they already describe every shape.

---

## How I used AI tools

I used Claude (via Claude Code) throughout this project, and I want to be specific about
where, because "I used AI" on its own is not a useful disclosure.

**Where AI helped most**

- Scaffolding the repetitive layers: Express route boilerplate, Zod schemas, the
  repository interface and its in-memory implementation, the Dockerfile and compose file.
  This is well-trodden structure and writing it by hand adds nothing.
- Generating a broad first pass of test cases. It was good at enumerating edge cases I
  would have reached eventually — the zero-width salary range in particular.
- Drafting the structure of this README.

**Where I directed the design rather than accepting a suggestion**

- **Eligibility as a separate gate, not a score.** The natural first cut treats a missing
  must-have as a large negative. I rejected that: it is semantically wrong, and because
  weights are configurable, a client could tune the penalty away and break the single
  hardest rule in the brief. Splitting `checkEligibility` out of `scoreMatch` was a
  deliberate correction.
- **The salary shortfall tolerance.** The first version of the salary curve dropped
  straight to zero the moment a job's maximum fell below expectation. That means a job
  paying 1% less scores identically to one paying 50% less, which is obviously wrong. The
  10% taper is my addition.
- **No over-qualification bonus.** An early version scaled experience past the minimum. I
  removed it, because it silently biases every ranking towards senior candidates and
  answers a question nobody asked.
- **Weight normalisation.** Hardcoded weights summing to 100 are simpler, but make the
  configurable-weights bonus awkward and let a caller produce a score above 100.
  Normalising any positive weights to 100 fixes both.
- **The `totalEligible` field.** Not requested anywhere. I added it after noticing that
  `limit` makes a result set ambiguous — "3 results" could mean 3 matched or 3 of 47 shown.

**Bugs in AI-generated code that I caught and fixed**

- The Postgres repository crashed with a type error instead of returning `404` when given a
  non-UUID id, because Postgres rejects the comparison rather than returning no rows. Fixed
  with a UUID guard in `findById`.
- An all-zero weight set produced a `500` from a division by zero deep in the scorer. It
  now validates at the route boundary and returns `400`.
- Widening `tsconfig.json` to typecheck `tests/` and `scripts/` silently moved the build
  output from `dist/server.js` to `dist/src/server.js`, breaking the Dockerfile's `CMD`.
  Split into a separate `tsconfig.check.json`.
- The Postgres container refused to read its mounted init script under SELinux on Fedora.
  Fixed with the `:z` relabel flag.
- Both recommendation endpoints ranked the entire pool **twice** per request — once with
  the limit applied for the response, and again without it just to compute
  `totalEligible`. Every job was scored two times. Reworked to score once and slice.

**What I verified rather than assumed**

Every claim in this README was checked by running it. The Docker stack was brought up and
exercised end to end, and the Postgres and in-memory paths were confirmed to produce
identical scores for identical input.
