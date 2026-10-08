# Precision-first Topic partition checkpoint, 2026-10-08

All results below are offline and socket-denied. No live Source, Topic,
discussion, SQLite row, browser asset, provider request or stored vector was
changed. Source-like records contain only the already retained URL, title and
body-E5 vector for the retained-data candidate. The focus candidate instead
computes a second E5 vector and lexical facets from synthetic title + at most
384 lead characters **in memory only**. Its extra representation is not
approved for retention or production.

| Frozen candidate | Luna test true/false joins | Luna challenge true/false joins | Independent multilingual true/false joins |
| --- | ---: | ---: | ---: |
| Current production planner, body E5 | 0/0 of 24/166 | 0/0 of 48/1,492 | not run here |
| Retained-data v3, body E5 + title cues | 7/0 of 24/166 | 6/0 of 48/1,492 | 0/0 of 24/252 |
| Ephemeral focus E5 + train-calibrated facet gate | 10/0 of 24/166 | 33/0 of 48/1,492 | 0/0 of 24/252 |

“True/false joins” means joined same-Topic pairs / joined different-Topic
pairs; the denominators are all labeled same/different pairs. A zero false
count on these invented examples is **not** a measured false-join rate on the
web. The V3 and focus candidates were frozen before the test/challenge and
new multilingual set were scored, and were not changed afterward. Input-order
checks were identical for three tested permutations. Test/challenge singleton
no-match articles stayed singleton (4/4 and 8/8 respectively). The synthetic
challenge may still be easier than real opposing-publisher articles.

The first conservative title-phrase candidate joined 0/24 validation true
pairs, zero false. The less strict v2 joined 15/24 but made four false pair
joins between a vehicle's navigation update and its charging-port issue.
Both failed promotion. V3 reduced false joins but had low recall, especially
on implicit wording. The focus representation improves English recall but
its trained lexical gate is English-oriented and rejects multilingual pairs.

The independently authored 24-page multilingual set has four fictional
families, each with two adjacent developments and three languages/viewpoints
per development. With the unchanged focus E5 representation, 22/24 articles
had a correct same-event *first neighbor*, and 21/24 had both same-event
partners as their first two neighbors; the body representation had 15/24 and
11/24. This is retrieval evidence, **not** safe same-Topic admission: body
reciprocal-first pairs included three wrong event pairs. Focus reciprocal-first
pairs had eight correct and zero wrong on this small set, but that was observed
after scoring and cannot be promoted without a fresh independent challenge.
Focus true-pair cosine ranged 0.869–0.920, so the English 0.90 admission floor
excluded many translated matches. The focus false-pair maximum was 0.878 in
this particular set, not a universal separation guarantee.

## Frozen dynamic-local focus graph v4 (later checkpoint)

This separate candidate was developed on Luna train/validation and the
*already scored* first multilingual set, then frozen at SHA-256
`800ebb28c914ba3188686f88c422ac29c902d2c9853a46eeb5af99f33e2eeb19`.
Its one-shot results were 11/24 true, zero false on Luna test; 44/48 true,
zero false on Luna challenge; and **0/72 true, zero false** on a newly
authored 48-page multilingual challenge. All tested input orders were stable.
The fresh set has six fictional entities, each with two different
developments covered in English and two other languages. Its SHA-256 is
`a9739faf8a306588f07296cfe5744829538d7423f2952c8ce4655331904ef4a9`.
The challenge was corrected to genuinely multilingual text and frozen before
v4 was run; its author did not inspect the matcher or scores.

For that fresh set, focus E5 ranked a correct same-development partner first
for 34/48 articles and put one in the first three for 46/48. Median
same-development cosine was 0.847, below the candidate's 0.90 direct gate;
the maximum different-development cosine was 0.891. Thus broad retrieval is
promising, but safe admission remains unsolved. The v4 triangle branch
also checks every outside page and can suppress a valid cross-language group
as the catalog grows. It is **not** the scalable local-hypothesis method
requested by the owner despite its stronger English score.

On a hash-pinned CC BY 4.0 CDEC-WN real-language subset, v4 joined 33/54
same-storyline pairs and zero cross-storyline pairs among 48 Wikinews articles.
Those are single-publisher disaster storylines, not atomic discussion Topic
labels or an opposing-view test; within-storyline joins may be too broad.
This is useful stress evidence but not release validation. No article text or
vector was written to the repository. The research archive remains ignored.

The practical method is two-layered: retrieve nearby candidate pages broadly
from vectors/title postings without a global neighbor-lead gate, then demand
specific same-event evidence to share a primary Topic. Competing *event
hypotheses in that local neighborhood*, not total page count, change the
evidence demand. More independent reports of the same event can corroborate;
a different nearby development requires an explicit guard. Inconclusive
candidates can still expose their separate discussions as **related**, which
reduces empty-forum UX without misrouting roots. The existing app already
has a related-discussion read path, so this design must improve its candidate
retrieval rather than duplicate that UI.

Next evidence: freeze any new dynamic-local method before scoring a new
multilingual challenge; compare partition false joins, opposing viewpoints,
related candidate recall, duplicates, order, and growth. A real
cross-publisher, provenance-reviewed set and owner/Trust activation decision
remain necessary before changing the live grouping rule, storing a focus
vector/facets, or migrating Source-anchored roots. Do not tune either frozen
candidate on these already scored holdouts.

Reproduce the one-shot candidate scoring and descriptive neighbor audits with
the commands in [README.md](README.md). The scripts check SHA-256 of the
candidate code and synthetic corpora. The first and second multilingual
challenges are now both scored; any later
candidate must use a third independent holdout or genuine labeled pages.
