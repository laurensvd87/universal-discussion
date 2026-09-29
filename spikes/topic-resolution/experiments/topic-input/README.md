# Prepared article/title input experiment

This isolated copy preserves the tested ADR-019 A proposal: a unique eligible
ARTICLE within the first MAIN, conservative article ambiguity abstention, and
bounded title plus leading text with explicit input-version groups. The generic
ADR-021 fallback and existing exclusion/work/time limits are retained.

It is **prepared experimental input, not an active production rollout**. Synthetic
measurements found false joins under the existing automatic grouping rule. The
production reader, policy and background matcher therefore retain their prior
input behavior. This copy does not establish viewpoint-independent Topic identity.

From `spikes/topic-resolution`, run the pure isolated checks:

```powershell
node --import ./harness/deny-external-capabilities.js --test --test-isolation=none experiments/topic-input/test/page-content-policy.test.js experiments/topic-input/test/page-content-reader.test.js experiments/topic-input/test/topic-input.test.js experiments/topic-input/test/background-matcher.test.js
```

The preserved `browser/core/topic-input.js` exports `buildTopicInput`; benchmark
parity checks should import that exact helper. No model activation, sockets,
owner browsing inputs, service/database access or automatic existing-link changes
are performed by these tests. The matcher experiment uses injected fake readers,
embeddings and clients; its inference-host cancellation checks reuse the existing
production adapter with injected fake Chromium APIs.
