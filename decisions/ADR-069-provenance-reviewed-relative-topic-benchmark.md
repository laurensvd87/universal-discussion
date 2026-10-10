# ADR-069: Provenance-reviewed Topic benchmark and E5-relative research choice

Status: owner-approved for bounded local research on 2026-10-09; no live activation.

## Decision

The owner approved the proposed 200–250-pair provenance review under these
limits: at most 250 comparison pairs drawn from unauthenticated, public EU
institution, Global Voices and Wikinews text; item-level source, rights and
provenance evidence; research files in a private local directory outside Git;
deletion no later than 30 days after capture; and no article text sent to
ChatGPT or another AI-labeling provider. This is not blanket legal clearance
for any site or any item. Exclude an item when its ownership, reuse notice,
third-party material, public accessibility or extraction boundary is unclear.
No paywalled, logged-in, private or user-browsing content belongs in this set.
No raw text, article URL/title, row-level labels, vectors or model weights may
enter Git, routine logs, the running local service or the extension. Aggregate,
content-free findings and fictional tests may be committed.

The owner also clarified the quality decision: a new Topic approach need not
find *every* same-Topic page or meet an extra complete-event quota merely to
be considered better than the present E5 approach. Compare methods on the
same fixed cases and input scope. The primary local-research comparison is
correct same-event discussion reach (including partial pure groups) while
direct and transitive false joins, mixed-group article exposure and root-route
churn do not worsen relative to the exact E5 baseline being compared. Report
duplicate-adjusted independent-source, cross-language, cross-publisher and
different-viewpoint slices; counts and uncertainties accompany any apparent
gain. Complete-event count remains diagnostic, not a pass condition for this
relative research choice. If only candidate retrieval improves, it may help
Related suggestions but does not establish safe automatic Topic routing.

## Fair comparison and evidence limits

Freeze corpus, item labels, split, preprocessing, the exact production E5
capture/planner baseline and any research-ablation E5 baseline before scoring
an untouched holdout. Production body-derived E5 and title/lead E5 are
different inputs; never substitute one for the other without a label. Use
the existing coverage evaluator for grouped reach and false exposure. An
observed zero-false count in a small set is not a precision guarantee.
Owner-only or AI-assisted labels can be exploratory; they do not become
independent human validation by renaming them. Give the solo owner a bounded
independent-review assignment if someone becomes available.

This decision replaces extra complete-event or zero-false-absolute screens
as criteria for selecting the *next offline research candidate*. It does not
retroactively change frozen experiment outcomes or the R5 public AUTO gate.
Historical AUTO minimums, Trust/Quality review, rights for product training
and model distribution, retained-vector/storage change, and owner-approved
live Source/Topic/root migration remain separate decisions. No provider
egress, spending, new capture permission, deployment or publication follows.

## Expiry and follow-up

Keep an item ledger with capture timestamp, original URL, publisher/author if
available, language, edition/date, copyright/reuse-notice URL, rights status,
content hash, extraction method and duplicate/source identity. The private
working copy must enforce a 30-day expiry; no Git or provider backup. If
independent labels are unavailable, mark the study exploratory and preserve
the separate R5 gate. Do not repeat the completed 6/6 synthetic owner review.

Implementation checkpoint, 2026-10-09: the operator-supplied local intake
validates scope and refuses reads after expiry, but it has **no verified
deletion mechanism**. The proposed path-based Windows purge was removed after
an independent review found a directory-swap risk. No ADR-069 page text has
been collected. Do not begin retained acquisition until an independently
reviewed local deletion process is arranged; an in-RAM/no-retention pilot is
a separate safe alternative. The initial eligible-source survey produced
same-article translations and adjacent legislative-stage negatives, not
verified independent-publisher same-event positives.

An independent read-only expiry review favors a bounded RAM-only pilot next:
keep article text, URLs, labels and vectors in process memory only, emit
aggregate metrics, and lose the run on crash/restart. This avoids an
application-managed raw-text copy but is not forensic erasure (swap/crash
dumps can exist) and does not complete the auditable 200–250-pair task by
itself. Do not add a recursive Windows purge over an operator-supplied path:
reparse points and directory swaps can redirect deletion outside the corpus.
A later retained design needs an app-owned isolated directory, handle/file-ID
checks, allowlisted deletion, an external expiry registry and failure tests,
plus a realistic provision for periods when the PC is off. No such mechanism
is implemented for use yet.
The bounded RAM-only pair-pilot code now exists as an inert scaffold. Eleven
fictional tests and independent Trust review clear a code commit only: there
is no real transport/extractor or new article acquisition. Before any live
research fetch, separately verify item-level rights, abort-cooperative
transport including hanging streams, article-only extraction, and trusted
callback no-egress/no-persistence. Its pair-only output cannot establish
transitive Topic safety or complete this ADR's grouped E5 comparison.

Research checkpoint: a hash-frozen diagonal-adapter comparison met the
E5-relative rule on the same 293 GlobeSumm title/lead articles (148 versus
74 pages in pure multi-page groups, no observed false group for either).
That split had **already been used** by a different GlobeSumm graph study;
the result is exploratory, not independent confirmation. No rights-cleared
new article set was acquired, and no live or product model change follows.

Further checkpoint: the independently reviewed owned-synthetic diagonal
adapter was fit and calibrated without real article training. On the
already-spent 150-article GlobeSumm validation it reached 2 pure-group pages
versus zero for separately calibrated title/lead E5, with zero observed false
joins for either. With 148 adapter singletons, that narrow relative research
gain is not useful product coverage or independent confirmation. No model
weight was saved, and this does not pass the live/root-route or rights gates.

2026-10-10 checkpoint: the real-trained diagonal adapter was re-evaluated
once on 292 previously unscored GlobeSumm reports from 23 whole events,
after excluding both prior experiment selections and matching title/lead
keys. Against separately calibrated raw E5 on identical inputs it reached
151 versus 66 pure-group pages and 324 versus 60 correct grouped pairs,
with no observed false group for either. This meets the exploratory
E5-relative research criterion again, but it is still **the same corpus**,
not the newly approved provenance-reviewed 200–250-pair collection or
independent publisher/viewpoint evidence. The adapter had zero eligible
calibration negatives; observed zero-false on this slice is not future
precision assurance. No product model, retention, or live routing permission
follows. See the [aggregate result](../apps/local-service/experiments/topic-encoder/real-diagonal-fresh-v1/RESULTS.md).

Source candidates and caveats are in
[the rights-review note](../research/RIGHTS_REVIEWED_EVENT_CORPUS_PATH_2026-10-09.md).

2026-10-10 body-input follow-up: on 300 other GlobeSumm whole-event reports,
the unchanged adapter recovered 255 versus 20 correct grouped pairs with a
normalized 4,096-character body-prefix surrogate, but caused **one false
grouped join and two mixed-group article exposures** versus zero for raw
body E5. Its calibration had zero eligible negatives. This fails the
relative no-worse-false-exposure criterion even though coverage improved.
See the [aggregate result](../apps/local-service/experiments/topic-encoder/real-diagonal-body-transfer-v1/RESULTS.md).
No live switch or model use follows; ADR-070 only allows an inert dashboard
comparison shell.
