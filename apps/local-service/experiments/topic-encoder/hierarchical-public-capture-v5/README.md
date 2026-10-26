# Capacity-aware prospective public capture v5 (ADR142)

New library only: namespace `hierarchy-real-root-public-capture/v5`, exact80
`training-expansion` or exact32 `test`. No execution/activation is implied.
ADR141's failed38/80 and the separate diagnostic, every prior source and output
remain closed. No old prefix, page replacement, alias, retry or alternate fetch.

One collection loop shares the original origin-policy cache, pacing and strict
request budget. Fetch/DNS/TLS/MIME/header/UTF-8/compression/byte/timeout/robots/TDM,
known NL robots repair, pruner and extractor guards are unchanged. Both successful
extraction DTOs and downstream eight-field Source input identity remain unchanged.
No per-case invocation of the old collector and no cap/header/decoder relaxation.

Only exceptions from the narrowly scoped PAGE transport call, after robots and
TDM-document checks, can be refused for capacity. They must be actual
`PublicFetchError` instances with own `code: body-too-large`, or
`code: content-encoding` and own data `cause.code: ERR_BUFFER_TOO_LARGE`.
Inherited/accessor/string-lookalike errors do not qualify. The same failures
at origin-policy fetch, and every other failure including malformed compression,
ratio/encoding/header/charset/network/timeout/policy/pruning/extraction failure,
remain fatal. No arbitrary error text is retained.

The ledger always preserves exact manifest order and its full80/32 denominator:

- `captured`: references its unchanged successful DTO by `outcomeIndex`;
- `capacity-refused`: bounded typed reason and applicable origin-policy receipt;
- `fatal`: failing stage/code, stops immediately;
- `not-attempted`: every remaining row after a fatal stop.

Refusals explicitly have unavailable/unapproved page policy and unknown page
rights: headers/directives/content could not be inspected after decode failure.
They contain no title/text/vector or Source-input hash, and grant no admission,
embedding, fitting, write or provider authority. Any downstream evaluation marker
must be separately namespaced and cannot become a captured Source identity.

`complete`/`completedCases` mean captured plus capacity-refused cases accounted
for, not usable input count. `capturedCases`, `capacityRefusedCases`, `fatalCases`,
`notAttemptedCases` and `attemptedCases` are explicit. A phase with any fatal row
is `partial-failure`, never eligible for silent encoding/scoring. Missing views
on a captured DTO are not capacity refusal: eligibility/model preflight must fail.

Shared original absolute360s budget, per-request15s cap, >=2s origin pacing,
source byte/hash/prune receipt math and no whole-page fallback remain. Actual
eligibility receipt, cohort minima and selection/final accounting belong to the
new reviewed model protocol/wrapper, not this library. No population-quality or
permanent-article-ineligibility claim follows response capacity.

Guarded pure invented transports only:

```text
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v5/capture.test.js
```

No actual metadata/body/vector/model/capture result is read by these tests; source
modules and invented HTML/errors only. No network/browser/DB/provider execution.
