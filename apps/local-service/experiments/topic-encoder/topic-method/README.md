# Offline Topic matching candidate

`matcher.js` exports `matchTopicDocuments(documents, vectors?)`. It accepts retained Source-like records (`id`, `title`, `url`, `embedding.values`) or an external Map/object of vectors keyed by ID. It returns deterministic `partitions` with source IDs and evidence tier, plus high-cosine `relatedEdges` that were not placed in one Topic. No existing Topic IDs, pins, discussion routing, or database are read or changed.

The candidate requires cosine at least 0.90 and a direct event phrase in the retained title for a direct pair. A pair with different event phrases can share a group only when two independent articles directly mention both phrases. Both witnesses must have distinct hosts, URLs, and title text. Every pair in a group must independently pass the rule; a cosine chain cannot make a group. The algorithm examines at most 256 Sources, sorts by stable IDs, and has no catalog-wide competitor margin. An adjacent development with high cosine can remain a related edge.

The phrase detector uses bounded Unicode normalization and English event-stage cues. It has no event-specific aliases, site APIs, body text, extra vector, remote model, or network call. Product-version conflict evidence is conditional on a shared adjacent name; incidental numbers and publication dates are not universal split keys. Non-English, implicit or paraphrased event names often lack sufficient evidence and will remain separate. Publisher independence is approximated by hostname, not corporate ownership. Titles are untrusted: matched words are only evidence, not proof of identity.

Run the focused synthetic mechanics check from repository root:

```sh
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/experiments/topic-encoder/topic-method/matcher.test.js
```

The 0.90 cosine floor is inherited from the existing experimental planner; it is **not** a calibrated event-identity threshold. This candidate requires frozen validation and an independent challenge with same-event viewpoints, adjacent developments, missing cues, duplicates, and insertion orders. Production activation additionally needs the ADR-023 source-anchor, manual-pin, whole-subthread routing and Trust review. No owner data or discussion is migrated by this experiment.

## V2 validation checkpoint (not promoted)

`matcher-v2.js` is a separate train/validation-stage adapter:
`matchTopicDocumentsV2(documents, vectors?)` returns the same `partitions` and
`relatedEdges` shape. V1 above stays frozen for comparison. V2 uses NFKC title
tokens, short shared stems, explicit model identifiers, conditional title dates,
the retained body-E5 cosine, and evidence computed within a dense local
neighborhood. It does not read body text. All proposed group cross-pairs must
have cosine at least 0.90. It does not use the catalog-wide 0.04 outside margin.

Using the frozen Luna training split, V2 joined 54/84 same-Topic pairs and 0
different-Topic pairs; all 24/24 no-match pages remained singleton. On frozen
Luna validation it joined **15/24 true pairs and 4 false pairs**, with 4/4
no-match pages singleton. The four false pairs fail promotion. Input order was
stable in both splits. In the invented three-page stronger-wrong-neighbor
fixture it joined the true pair (1/1) and no false pair; in the nine-page
adjacent-development fixture it joined 22/22 true pairs and 0/14 false pairs.
Those geometry fixtures are not real E5 observations. Held-out test and
challenge were not scored for this candidate.

V2 has a hard 256-Source limit. Its precomputed pair evidence and repeated
complete-link group scans have cubic worst-case growth; measured matching
time was about 5 ms on 20 validation Sources, 100 ms on 80 training Sources,
and 260 ms on a 64-page synthetic crowd on this machine. These are local
experiment timings, not service capacity evidence. English cue heuristics,
short-prefix stems, publisher independence, duplicate support, date semantics,
manual pins, stable Topic IDs, and whole-subthread routing need further work.
In particular, another day named in a headline can be background context,
and a title model identifier may be absent from another article on the same
development. V2 must remain offline.

Reproduce only training, validation, and invented-vector checks (the script
rejects any other split):

```sh
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js apps/local-service/experiments/topic-encoder/topic-method/development.js train
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js apps/local-service/experiments/topic-encoder/topic-method/development.js validation
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js apps/local-service/experiments/topic-encoder/topic-method/development.js synthetic
```

## V3 precision-first checkpoint (offline)

`matcher-v3.js` exports `matchTopicDocumentsV3(documents, vectors?)` with the
same `partitions`/`relatedEdges` shape. It uses only retained Source titles,
URLs and one body-E5 vector; the URL is not Topic identity evidence. Local
cosine neighborhoods identify repeated proper names and subject words. A
pair requires at least 0.90 cosine plus two shared non-name title cues, or a
shared explicit product model plus one such cue. Conflicting model identifiers
or title event dates block the pair. If one page directly fits two mutually
conflicting hypotheses, both links abstain. Every cross-pair in a group needs
direct evidence, preventing cosine-chain merges. High-cosine abstentions
remain in `relatedEdges`.

Frozen Luna train: **8/84 true pairs, 0/3,076 false pairs**, with 24/24
unmatched pages singleton. Frozen Luna validation: **5/24 true pairs,
0/166 false pairs**, with 4/4 unmatched pages singleton. All three input
orders produced the same partition. Five focused network-denied mechanics
tests pass. The invented three-page stronger-wrong-neighbor case abstains
on all three pages because the undated middle title is compatible with two
date-conflicting alternatives. No held-out test/challenge or owner data was
scored.

This remains an English title-cue heuristic; Unicode tokenization supports
other scripts mechanically, but cross-language event identity is unvalidated.
Short stems can collide, quoted titles can be misleading, and dates in titles
can refer to background events. The 256-record bound is an offline safety
limit, **not** a proposed catalog or user limit. This full pairwise prototype
is unsuitable for a growing service catalog. A scalable implementation would
retrieve bounded top-K E5 neighbors using an index, expand only local
candidate neighborhoods, compare event hypotheses there, and retain related
edges for abstentions. Recall is low and the owner-selected Guardian/Fox
headlines have no direct common event cue, so this method does not yet resolve
that pair. The small synthetic validation split cannot establish production
precision; manual pins, Topic IDs and root-thread routing remain unimplemented.

Reproduce the v3 train/validation and focused tests without external access:

```sh
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/experiments/topic-encoder/topic-method/matcher-v3.test.js
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js apps/local-service/experiments/topic-encoder/topic-method/development-v3.js train
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js apps/local-service/experiments/topic-encoder/topic-method/development-v3.js validation
```
