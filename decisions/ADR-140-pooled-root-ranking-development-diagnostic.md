# ADR-140: Pooled root-ranking calibration as a development diagnostic

Date: 2026-10-20. Status: development diagnostic complete and closed.

One reviewed run completed: raw primary ranking29/32correct roots; its pooled cut
accepts12/32, all12correct, so useful confidence coverage is still inadequate.
CAL raw43/48; selected pooled cut32/48 with no optimization errors. Raw C root
ranking27/32 and local exemplars18/32 are diagnostics, not controlled equivalent
comparisons. Do not promote raw top1 as a safe nearest fallback.

Descriptor`38211d265163e67cca6d7396fd56e49de14aa3b3782519ccad9ddf6cea7bb34d`;
result FILE SHA256`d06a5bf9096cf1686ed051d0273b79ea0869f9c49923f21c70cc8a9b6cc2b2ea`.
Inner177.8853ms/finalRSS105,107,456B; these are development-script costs, not
interactive application latency. Seven pure tests and independent review precede
execution. Saved CAL score/rank rows support stored-only audit without a scorer
replay. The three raw primary errors are Barrage, Euskera and Deixis; inspection
of already stored public captures shows maintenance/infobox-heavy opening text,
whereas their saved prose-lead variants start with the article subject. That is
input-quality evidence, not proof that selecting lead now fixes them or a license
to reuse the old32 as a fresh holdout. Richer real training and new evaluation are
needed. All diagnostic sources/results remain immutable; this ADR is deliberately
outside their input hashes, unlike the frozen ADR139.

Separately, one reviewed public-input-probe-v1 browser run failed0.766s with no
useful saved snapshots; generic child error does not identify the CDP stage or
prove no public request happened. Own process-tree cleanup and source rechecks
are confirmed; no owner browser/service/crawler touched. Preserve original source
and failure evidence. A new ABOUT:BLANK-ONLY capability probe is code-reviewed
separately before any attempt to fix/repeat the public diagnostic. No guard
removal, silent compatibility fallback or automatic replay follows.

ADR139's grouped-exemplar screen completed once, using previously consumed data.
Real-root-only evidence assigned5/32,4correct roots; augmented evidence assigned
10/32,9correct roots. Both gave no exact child anchor, two safe broader and two
unresolved. Neither is a useful production improvement. Preserve that screen's
sources, descriptor, artifacts and outcomes; no cut retuning or output replacement.
Descriptor`9f8a00749d8341305f8812dacc1b6c4f0471fac976f11c0e8f0e9d2805a3bb51`.

The next diagnostic separates feature discrimination from sparse independent
per-node acceptance. Reuse the frozen ADR13816root model, whose heads each saw
three positives and45negatives, but evaluate a NEW explicitly multiclass ranked
decision. A unique winning root and its margin over the runner-up are distinct
from16independent binary cuts. Equal maxima abstain; no lexical tie-breaking or
forced nearest-result fallback. This does not assert that arbitrary unrelated
binary-head scales are always comparable or solve open-world recognition.

Fit a shared two-dimensional winner-score/margin cut on the consumed real CAL48
only. Enumerate observed cutpoints, require at least20distinct accepted groups
and no known calibration errors; maximize accepted correct groups, then prefer
larger margin and larger winning score. If none qualifies, disable the policy.
Pooling does not provide per-topic error guarantees, calibrated probabilities or
evidence that sparse groups have enough support. Do not weaken the minimum after
seeing results, change the frozen heads, or fit on diagnostic32 outcomes.

Report consumed32 as DEVELOPMENT ONLY: raw root ranking and the shared-cut result
for that model; raw root rankings from frozen C heads and ADR139local evidence
may diagnose where information is lost. Those two comparators are not fitted or
used as an adaptive fallback. Root-only reporting cannot establish child quality.
No aliases or child-promotion rules are mixed into this run.

New isolated files, inert defaults, exact pinned input bytes and source descriptor,
exclusive output, initial-buffer parsing and final freshness rechecks are required.
Keep source identity checks distinct from hostile filesystem/loaded-module
attestation. Scoring uses frozen arithmetic, separate from rank/cut fitting:
rank/fit comparisons capped1M, coordinate products separately capped5M; count
fusion/norm and existing local-evidence group/decoder work separately. Require
256MiB heap, cooperative90s/RSS384MiB/physical1GiB and diskC768MiB/D512MiB reserves;
these are not an external hard-termination supervisor.

Root review, pure synthetic-score tests and independent review precede execution.
No new encoder training/inference, page capture, provider call, owner-data read,
canonical write, service/crawler restart or live activation. A promising development
result would still require genuinely fresh evaluation data and integration.
