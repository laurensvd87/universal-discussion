# Public capture v4 — prospective ADR141 library only

New namespace `hierarchy-real-root-public-capture/v4` accepts exactly two
manifest phases: `training-expansion` with **80** cases and `test` with **32**.
No traincal/calibration/development alias, variable count, count override or old
namespace fallback. This library adds no executable CLI, wrapper, supervisor,
capture authorization or automatic attempt. No capture has been performed by
its implementation/tests. Frozen v3 and every previous probe/result remain
untouched.

The mechanical runtime delta from frozen capture v3 is limited to namespace,
phase name, exact phase counts and the matching exported limit name
`maxTrainingExpansionCases:80`. A source-equality test verifies the remainder
against v3 (normalizing only line endings/trailing whitespace). No new extraction
algorithm, model, learned policy or input representation is introduced.

The future root-owned protocol/wrapper must bind the sealed exact 112 case
identities, split/group exclusions and source-byte hashes before execution.
This collector validates an exact manifest of bounded `{id,url}` records and
rejects duplicate IDs/URLs, but fixed cardinality alone does **not** prove the
reviewed cohort or entity independence. Curation is not inferred, read or
substituted here. There is no wrapper/run file in this slice.

## Unchanged capture protections

Only the existing literal EN/DE/NL/FR/ES Wikipedia HTTPS origins and explicit
manifest article URLs are eligible. Same existing DNS-pinned public fetcher,
redirect refusal, robots/TDM/indexing decisions, 404/410 absent-policy handling,
no private/loopback aliases, page-byte/MIME/compression limits, deadlines,
per-origin pacing, no link traversal/retry and response-buffer erasure.

Shared dependencies are unchanged:

- `../../../src/crawler/public-fetch.js`, `robots.js`, `static-capture.js`;
- `../hierarchical-public-capture-v2/robots-deny-space-repair.js` (the existing
  exact known-snapshot repair, not a general robots relaxation);
- `../html-metadata-prune-v1/prune.js` (quoted transport metadata only).

The same pruned input reaches both legacy static extraction and the bounded
explicit Wikipedia prose-lead diagnostic. Policy/visibility exclusions and
text/attribute/depth/token limits remain identical. No whole-page/menu fallback.
The exact original raw-response and decoded-HTML hashes, prune receipt,
extracted title/current/lead hashes and attribution fields are preserved. The
downstream eight-field input-hash construction remains unchanged; defining and
pinning its future wrapper is outside this library slice. No browser-parity,
native-attestation, historical-input or semantic-quality authority is claimed.

On any failure, collection stops and returns `partial-failure` with its bounded
already-completed prefix for forensic inspection. This is **not** a complete
phase or permission to drop failed cases, splice a prefix into another attempt,
encode/train/score it, retry automatically or substitute old captures. The
future phase wrapper must require complete exact-cohort evidence. Same absolute
360-second library wall budget, >=2-second origin delay, <=15-second individual
request budget and explicit request cap `case count + 2 * origin count`.

## Checks only

From repository root:

```text
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v4/capture.test.js
```

Tests use invented HTML and injected synthetic transport/clock only. They do not
read candidate metadata/body/model/vector files, fetch public pages, launch a
browser or perform inference. The sole filesystem comparison reads collector
source code, not a cohort. No old CLI/gold fixture tests are imported. Passing
these checks is code evidence only, not actual collection or activation.
