# Related nomination proposal (offline)

This small experiment addresses one app-facing failure mode: many near-copy
pages can fill the existing 20-result `/v1/related` response before a distinct,
still-relevant page appears. It uses only the existing single vector, title and
URL in synthetic caller-supplied records. It does not read or change the owner
database, fetch pages, call a model or modify production code.

The proposal takes the current ranker's compatible-vector results at its
unchanged 0.85 floor, preserves existing same-Topic peers, and suppresses a
later related nomination only when its normalized title and vector proximity
strongly suggest a repeat. It does not infer viewpoint, source independence or
Topic identity. A generic shared title can still be suppressed incorrectly, so
the synthetic tests establish mechanics rather than retrieval quality.

Run from the repository root:

```powershell
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/experiments/topic-cloud/related-retrieval.test.js
```

Activation would require the lead/owner to approve the exact changed
`/v1/related` ordering and omission behavior under ADR-044, then a provenance
reviewed graded relevance check (including duplicate floods, generic titles,
opposing views, multilingual pages and candidate loss) and a trust review.
The current 100-Source cap and stable discussion routing are separate issues.
