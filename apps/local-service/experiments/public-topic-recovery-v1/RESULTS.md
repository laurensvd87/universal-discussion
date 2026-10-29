# Public discussion evidence: development comparison

29 October 2026. Matching names together with public discussion content is the
promising recovery path. E5 nearest-neighbour similarity alone does not safely
separate the tested product variants and panda species. This is a small DEV
comparison, not representative accuracy or a live activation decision.

The existing packaged local E5 encoder produced vectors for13 **invented public
discussion examples**. Six queries use11 historical non-Wikipedia web vectors:
the owner's recipe/video, five animal pages and four product pages. No new pages
were captured, actual user posts made, external provider contacted or database
changed. Both source/asset/input end pins and encoder release pass; the process
exited0. The first128MiB startup attempt and its empty directory remain retained.
The separately decided completed run uses the verified existing crawler/worker
model setting of512MiB. It took2357.1ms to encode all26 public body/title inputs
and compare them; reported maximum RSS was1,109,916KiB for that standalone
process. This is not per-page latency, an incremental production memory cost,
many-user capacity or a full process-memory accounting proof. Production
integration should share the already loaded worker encoder and serial queue.

| Recovery approach | Correct recommendation | Wrong recommendation | Ambiguous | Below floor/unresolved |
| --- | ---: | ---: | ---: | ---: |
| Same normalized public name | 4 | 0 | 1 | 1 |
| Public discussion E5 similarity | 1 | 0 | 3 | 2 |
| Same name and public semantic evidence | 4 | 0 | 0 | 2 |

All six queries are positive cases: four recommendations is coverage4/6 in
these inspected examples, not an accuracy percentage. Both refusal categories
are missing automatic recovery. General page-to-subject discovery is separate
and still finds the recipe/video's shared **Kapsalon** topic.

The hybrid recovers Giant panda, Red panda, Nintendo Switch family and Steam
Deck family. It refuses Kapsalon (0.8752 against the public recipe example,
below the unchanged0.88 floor) and German Roter Panda. The latter's best two
public prototypes are nearly tied, with Giant panda slightly above Red panda.
Lowering the floor would not establish the correct species. Steam Deck's top
semantic neighbour is the OLED-specific example although the query contains
both LCD and OLED pages: blindly choosing that neighbour would over-specialize
the family topic. The existing0.03 margin prevents that recommendation.

Two additional **derived missing-target library subsets** use the same retained
vectors; they are not fresh pages or additional independent validation:

- With only the hairdresser meaning of Kapsalon in the public library, name-only
  lookup recommends the wrong discussion. Both semantic approaches refuse.
- With the Steam Deck family topic absent but LCD/OLED siblings present, all
  approaches refuse a recommendation; vector-only lookup reports ambiguity.

This supports using literal agreement as a semantic constraint while refusing
an unrelated homonym. It does not justify automatic cross-language aliases,
arbitrary topic merges or universal identity recovery from short comments.
The supplied public examples are informative paragraphs; real brief comments
may provide substantially less evidence.

## Confidence and cost checks

After the first comparison, a pure counterexample found that a competitor just
below0.88 was incorrectly excluded from the margin calculation. Policyv2 keeps
all compatible competitors for that check. Eleven guarded64MiB pure tests pass,
including that boundary, wrong-sense evidence, duplicate-root ambiguity,
per-member agreement, changed public text, Unicode boundaries and Chinese words.
The original actual result remains unchanged. Re-scoring its retained vectors
under the corrected policy preserves the six decisions above and adds the two
declared library subsets. It loads no encoder and grants no SQL authority.

The final re-score measures median0.6741ms/p950.7824ms per query, averaged over
the six cases per repetition. A synthetic64-member/64-public-root numerical
workload takes median4.9096ms/p955.5414ms. That workload repeats existing vectors
solely to measure the scorer's bound: it is not64 new materials or topics and
does not include indexed retrieval, inference, HTTP, PostgreSQL or UI time.

## Retained evidence

These local outputs are ignored by Git; no actual stored page vectors or private
database exports are included in the source commits.

- Completed encoder comparison: source`eca0b635`,
  `data/public-topic-recovery-packaged-runtime-20261029/result.json`, SHA-256
  `7cab34493d043c090be3b6d1aa1dda26cb4316944faa6dcace61c16cf0cc876b`.
- Root audit reauthenticates all29 recorded source/asset/input pins:
  `data/public-topic-recovery-packaged-runtime-root-audit-20261029.json`, SHA-256
  `4eb1ba6ebfdfd73135278adef5cc5966d900ebb3b1a3a4cf54048132656a2084`.
- Margin-only retained re-score: source`a11941c1`,
  `data/public-topic-recovery-margin-review-20261029/result.json`.
- Final margin and missing-target re-score: source`007389b7`,
  `data/public-topic-recovery-margin-and-absence-review-20261029/result.json`.
  All six old numeric score lists are recomputed from the retained public vectors;
  those case hashes are first recorded by these re-scores, not retroactively
  claimed to have been recorded by the original encoder result.

All review is Root-only. Next work is a bounded index of actual published named
root captions and **current public revision bodies**, with digest/revision CAS,
edit/withdrawal invalidation and no Source-derived retention. The existing worker
resource already shares a serial encoder queue through`embedCapturedBody`; no
additional model process is needed. Prototype reads must be indexed and bounded.
Actual publication must recheck that independent public evidence together with
current Source/candidate/identity fences before reusing an occupied ID. Equal
names alone must never perform that recovery. The full project also still needs
static/dynamic unification, owner depth, foreground context, complete18 startup,
migration/recovery, representative quality, genuine UI/provider and live latency
verification before activation.
