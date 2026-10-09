# Pre-test freeze, 2026-10-09

These exact rules and code hashes were fixed after the train and validation runs and before the selected GlobeSumm test split was evaluated. No test result is used to change them.

| Role | Path | SHA-256 |
| --- | --- | --- |
| Runner | `globesumm-graph-v1/run.js` | `860164B83CA5E53EFE14160DADDF17402C04A6537264FB7A7291D279E119B7EE` |
| Grouping | `adaptive-topic-graph-v1/core.js` | `5147BE6E23DF75BDEF909CF355CBC413BFD0E4D5C210D2CBED36E03CDB207BCF` |
| Corpus parser/split/baseline | `real-event-eval/core.js` | `4C5E4D1B1E9F543B6AB837E4467E18B3CE5B5C4A0B14172699EF355EACA3496C` |
| Packaged inference adapter | `e5-infer.js` | `0346A01BAD77065580ECD77390542565D3BFD7B16980FF16255090238E412183` |

The input is the ADR-065 private file of 14,972,999 bytes, SHA-256 `8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d`. The packaged E5 model SHA-256 reported by the adapter is `f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193`.

Rules:

1. Existing strict baseline: deterministic sequential complete-link, cosine cutoff `0.94`.
2. Frozen strict triangle: `minimum 0.86`, `cover 0.88`, `mean 0.92`, `strongPair 0.94`.
3. Frozen triangle-nearest veto: `minimum 0.86`, `cover 0.88`, `mean 0.88`, `strongPair 0.94`, and every proposed group member's global nearest neighbor must lie inside the group.

Train and validation were run separately with these rules and selected event-disjoint splits. The runner embeds and scores only the requested split. Test evaluation is a single planned run after this freeze.
