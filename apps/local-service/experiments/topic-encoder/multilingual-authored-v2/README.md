# Authored multilingual event corpus v2

Project-original synthetic offline research material, not real publisher
evidence or product training clearance. Five separately authored chunks contain
324 short reports in English, Dutch, German, French and Spanish. Each of 54
atomic developments has six reports covering all five languages; one language
is repeated. Whole fictional entity families, event IDs and report IDs are
disjoint across chunks.

| Chunk | Role | Reports | Families | Events | Exact `records.jsonl` SHA-256 |
| --- | --- | ---: | ---: | ---: | --- |
| A | fit/calibration pool | 108 | 6 | 18 | `6B0F5199F8C4A5B31C3A10B9B2D46DDD98763287C57C5281C135B79CFB0AF81B` |
| B | fit/calibration pool | 108 | 6 | 18 | `2762DA5CE908A2E67092958BEAF3F6CD4F56515AA29D61962AA7C3F870CA2908` |
| C1 | development only | 36 | 2 | 6 | `20BAB9B116C6F32C2FB7058C3D822AF333503EC36CBCF9CBB7365E9F45BAC581` |
| C2 | development only | 36 | 2 | 6 | `44AC29625DFBD86F7AF2C278EAB991E042D0E6E0FA64A92D95D3B1F7951BBF6F` |
| C3 | development only | 36 | 2 | 6 | `659F2E9A27651B6577D2686F8B3849E56E6A36984471620980BCCA68B880F1FE` |

The first C draft was discarded before any model use because it contained
English factual prose inside non-English rows. Smaller C1/C2/C3 replacements
were revised after source-only quality audits for language, date consistency,
viewpoint balance and confounded repeated-language assignment. A/B were also
revised before model use. Structural checks and AI-only prose audits do not
establish native-speaker fluency, independent publisher variation, legal rights
in external articles, or a real-web accuracy rate.

For the current ADR-064 proof of concept, `eventKey` means the same principal
reported event/announcement and is the **primary Topic research target**.
Different `eventKey`s are negatives for this event-level offline evaluation,
even when they are later stages of one evolving story. Such stages can remain
visible under Related discussions; this is an acceptable PoC choice, not a
universal claim about what users call one topic. A's separate non-transitive
page-pair relevance ledger and B/C story-stage notes are auxiliary research
annotations, **not** event identity or training positives in this experiment.
No relation label, viewpoint, family, language or event ID enters E5 inference;
labels are for fitting/metrics only. No data from this corpus has yet fitted a
model or selected a cutoff.

Run the aggregate-only cross-chunk check from repository root:

```powershell
node apps/local-service/experiments/topic-encoder/multilingual-authored-v2/integrity.test.js
```

It verifies exact byte hashes, schema, counts, five-language event coverage,
split isolation and the development pair denominators without printing text.
The new `topic-benchmark/multilingual-holdout-v5` is separate and remains
unscored; this manifest and test do not open it.
