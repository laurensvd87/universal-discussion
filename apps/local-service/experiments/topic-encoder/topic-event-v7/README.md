# Offline v7 local event-hypothesis experiment — negative multilingual result

This is a frozen research result, **not** a Topic-routing rule. It changes no service, database, extension, stored vector, permission, provider or owner data. It reads only packaged local E5 assets and synthetic English/multilingual TRAIN and family-disjoint VALIDATION. The v3 multilingual holdout and Luna test/challenge were not opened. Validation was consulted during development, so every number below is a **development** result, not independent holdout evidence.

`matchEventV7(sources, facets)` receives transient 384D E5 vectors computed from title plus the first 384 lead characters, and transient title/lead facets. It returns full `partitions` and `relatedEdges`. A high-cosine, shared-facet, independent-title/host pair starts a local event hypothesis. It can extend a cohort using local pair evidence; singleton extension needs two mutually independent witnesses from that cohort, and detected action/product conflicts block admission. A supported competing event hypothesis can force abstention. It does not use a fixed top-K identity set, fixed Topic size, global outsider veto or all-exemplar complete-link. Exact-title copies cannot seed each other or count as two independent witnesses. Its broad pair materialization and repeated scans are offline-only O(N²) work and do not solve service scale or transactional replanning.

The conservative rule fails the central cross-language objective. Of 160 true multilingual TRAIN pairs, 27 have compatible focus cosine at least 0.91, but **zero** of those clear the 0.20 token-overlap requirement. VALIDATION has 18 cosine-eligible true pairs and likewise zero clearing overlap. The English cohorts can grow through a few strong seeds; translated event descriptions do not establish those seeds. A development-only shared-title-anchor/two-witness bridge was tried and removed: it introduced 16 English TRAIN false pairs, 16 English VALIDATION false pairs and three multilingual VALIDATION false pairs. High embedding proximity and common entity names cannot safely substitute for precise event evidence here. This is not a zero-false cross-language solution achieved by useful admission: its translated recall is zero. A future candidate likely needs a learned or language-aware event representation and independent precise-event labels, plus an owner/Trust decision before any retained representation or live migration.

## Reproduce offline

From repository root:

```powershell
node apps/local-service/experiments/topic-encoder/topic-event-v7/test.js
node apps/local-service/experiments/topic-encoder/topic-event-v7/growth.js
node apps/local-service/experiments/topic-encoder/topic-event-v7/run.js
```

The runner checks frozen corpus hashes and prints complete partitions, labels for evaluation only, TP/FP/FN/TN, opposing-view and cross-language pair counts, no-match abstention, three input orders and timing. It never passes labels or raw bodies into the matcher. All commands import the project's external-capability denial harness; no network or model download is used.

| Development split | True pairs joined | False pairs joined | Opposing views joined | Cross-language joined | Pure predicted groups | Order stable |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| English TRAIN | 47/84 | 0/3,076 | 32/56 | n/a | 55/55 | yes |
| English VALIDATION | 18/24 | 0/166 | 12/16 | n/a | 11/11 | yes |
| Multilingual TRAIN | 0/160 | 0/3,000 | 0/128 | 0/160 | 80/80 | yes |
| Multilingual VALIDATION | 0/80 | 0/700 | 0/64 | 0/80 | 40/40 | yes |

All 24 English TRAIN and four English VALIDATION unmatched pages abstained. Synthetic geometry with three adjacent-event pages kept a same-event cohort intact at 3, 7, 20 and 100 reports; adjacent pages formed a separate group of three. Two deliberately weak true outliers joined the 100-report cohort without adjacent mixing. The 100+3 case took about 0.8–1.1 seconds on this machine. The focused test verifies reverse-order stability, duplicate-ID rejection, exact-title copy non-corroboration, and action-conflict separation. These controlled cases do not validate real translated or cross-publisher event identity. Reworded syndication across hosts can still supply false independence.

## Frozen integrity

SHA-256 of exact UTF-8 corpus bytes: English TRAIN `2f229a606e9eaad34eb35a6b908d3f3321ba825da8a1e68494f6710f0dd89d27`; English VALIDATION `71bd27e34e48ccc239199559e0fe61c5de556860e9fde74d20f3fd27439cdd3e`; multilingual TRAIN `008ff6c9d3b93d6b6a8cf08b1579a4a6c11cf010c97963f02aa5b276d6e03c8b`; multilingual VALIDATION `fbd3b22a7c4942b7689d6ac8663a5836b861d7ab5991d65c4bba65ed38086b53`. Packaged model SHA-256 reported by the runner: `f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193`.

SHA-256 of v7 source files: `matcher.js` `8a72943d48628abcd4f56d482fd9980778a1b6ad36a45eda0ff2b7192df1f6df`; `run.js` `94124d0fcb961bd8f320d82a2890a12b3fa5d9824975809122c4e421799688df`; `growth.js` `a364f45c2072c61d8dc8eea1fdcc9b8dba789674237a382ced6372bb71e14441`; `test.js` `e27e18e5512b06f16973b5090304392d312219436a5cfbc0472cfed4c5e5e771`.
