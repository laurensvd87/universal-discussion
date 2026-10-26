# ADR-133: paired inputs and broad hierarchy development

Date: 2026-10-19. Status: active development, NOT activated in the application.

The owner explicitly asks us to continue until a workable fast hierarchical topic
assignment is implemented, trying genuinely promising alternatives rather than
tuning the closed ADR-131/132 test sets. The owner also approved the known pairing
recovery token for the specific authenticated HTTP check in RAM only. That check
is complete: 100 health requests, all HTTP 200, 126.7192 ms total, p95 85.1117 ms.
No token was printed, copied, changed or used for inference. Health latency is not
discussion or matching latency. Earlier notes saying permission is still needed
are historical, not a new credential restriction or authorization for other uses.

## Evidence motivating a different experiment

The three previously examined Kapsalon pages remain diagnostic, not fresh gold.
Their retained-title embeddings correct the apparent subject but transfer is
uncalibrated. A body/title common-ancestor restriction alone cannot promote a
generic body decision to a specific title-supported topic. We therefore compare
explicitly versioned weighted body/title representations instead of silently
changing the original encoder or calling title transfer already calibrated.

A fixed hash sample of 120 public retained Source metadata rows and aggregate
inventory found that the current catalog is overwhelmingly Wikipedia in German,
English, French and Spanish. Existing narrow synthetic tasks do not establish
coverage for those subjects or languages. This inventory has informed design;
it is DEVELOPMENT data forever, not a future independent calibration or test set.
The sample and metadata-only annotation stay ignored on D:, not in the repository.

## Implemented experimental pieces

- `hierarchical-e5-paired-input.js`: privately compiled, immutable weighted input
  identity, exact endpoints, max-scaled normalization for interior weights,
  explicit zero-vector unavailability, no implicit missing-field fallback.
- `hierarchical-e5-prototype-scores.js`: exact bounded multi-descriptor scores,
  descendant maxima and sibling/parent contrasts; no confidence or assignments.
- `hierarchical-e5-prototype-policy.js`: trusted-scorer deepest unique eligible
  path. Root ambiguity abstains, child ambiguity retains a supported parent.
  Explicit rules are uncalibrated until separately measured; no forced leaf.
- A separately authored candidate taxonomy of 63 nodes, 16 roots, depth at most
  three, two positive descriptions per node. These descriptions are model inputs,
  not independent page labels. Candidate edges are not owner-approved policy.
- An explicit, inert-by-default development runner and own-child Windows resource
  supervisor under `apps/local-service/experiments/topic-encoder/hierarchical-e5-paired-v1/`.

## Development protocol

Seal blind partial metadata labels and all protocol, taxonomy, code and asset
hashes before predictions. Compare body weights 1, .75, .5, .25, 0 using existing
body vectors and newly encoded retained titles. Compare direct-root descriptor
ranking with descendant-union ranking. Encode label plus positive description,
never exclusion-bearing scope text. Prototype preparation passes each descriptor
as both input fields through the same declared paired adapter.

Read only the fixed 120 Sources and exact normalized embedding mirrors in one
repeatable-read, read-only app-role transaction. Recheck metadata against the
inventory; changed inputs fail instead of being silently relabelled. Close the
database before model initialization. Retain no Source vectors or raw page text.
No page fetches, provider calls, canonical writes, migration or runtime activation.

One sequential E5 session, 246 encodes; own child max RSS/private commit 1536 MiB,
host physical/commit reserve 1024 MiB, C: reserve 768 MiB, wall 180 seconds. Bounded
local results and logs use exclusive creation, no hidden rerun or overwritten
evidence. Preserve the running crawler and application processes throughout.

Unknown names are insufficient labels, not negatives. Title-grounded root
compatibility is not independently verified full-page correctness. Partial labels
do not prohibit body-supported descendants; root accuracy, justified specificity,
coverage and unknown denominators must be separate. Ranking margins are not
probabilities. No production claim follows from this pilot. A promising method
needs separate calibration and genuinely fresh, appropriately grouped evidence
before applying new classifications to owner data.

## Further direction, not implemented or selected

For Wikipedia, exact entity identities can connect translations independently of
E5 similarity. Structured Wikidata edges are potentially useful, but instance-of,
subclass-of and taxonomic-parent relations are not interchangeable discussion
parents. A bounded reviewed mapping would be required; no ontology import,
external lookup of owner inventory, entity inference or network dependency has
been introduced by this ADR. General web pages still require contextual matching.

Primary references: [E5 model card](https://huggingface.co/intfloat/multilingual-e5-small),
[MediaWiki page properties](https://www.mediawiki.org/wiki/API:Pageprops),
[Wikidata data access](https://www.wikidata.org/wiki/Wikidata:Data_access),
[Wikidata structured-data licensing](https://www.wikidata.org/wiki/Wikidata:Licensing).

## Production state

Schema 9 and ADR-128 checked seal
`a1d301bc315ed497832b9aba60ecfeb79aa1b28f43678b91e6f1155c3f09909d`
are unchanged. API 19868, worker 36616, dashboard 6644 and crawler 26616 retain
their start times. Keep the crawler running; no duplicate, reset or replay.
The earlier shadow schema remains unregistered and has no canonical bridge or
new write authority. Preserve all accepted discussions, pairing and sign-in.
Owner admin bootstrap and additional provider QA remain outside this work.
