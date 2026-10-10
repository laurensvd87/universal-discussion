# ADR-071: Proposed reversible owner-local Topic policy switch

Status: proposed; **no model-use or live-routing approval recorded**.
Date: 2026-10-10.

## Context

The owner wants the topic-oriented diagonal adapter integrated into the
extension and local backend, with a way to return to the existing E5 grouping.
The current backend still applies `adaptive-supported-partitions/v1`, including
the fixed 0.04 competing-neighbor lead the owner previously rejected. The
owner's two De Standaard language versions were saved with compatible browser
E5 vectors and 0.951 cosine similarity, but separate provisional Topics:
a 0.932 competitor left only 0.019 lead. This is a concrete old-policy false
negative, not an absent capture. The new adapter remains offline research,
not a live model. Its body-prefix transfer found one false join where raw E5
found none; neither browser parity nor independent publisher/viewpoint safety
has been established.

## Proposed design, not activated

Keep each captured browser E5 vector immutable. The local service would apply
the candidate transform to a separate in-memory representation, never overwrite
the source vector or require recapture solely for the transform. The backend,
not the extension, owns grouping and reports the actual active policy and
availability. Do not expose a switch in the extension until the backend can
atomically change and report the live policy.

A real switch needs a versioned policy selector, bounded full-catalog plan,
exact pre-switch Source-to-Topic mapping, transactional persistence, and a
reversal strategy that also handles subsequent posts and ingests. Move whole
Source-anchored root/reply subtrees; preserve manual assignments and legacy
topic-anchored roots. Recheck version conflicts and route invariants on both
switch and reversal. Switching back cannot be a bare flag flip. A read-only
comparison must keep candidate labels distinct from real Topic IDs and must
never create the impression that posts have moved.

The first code increment is only an unreferenced, synthetic-tested comparison
helper. It neither reads user Sources nor calculates adapter partitions and
is not a durable rollback implementation. The extension has no alternate
grouping UI yet because there is no truthful backend capability to expose.

## Gates

Before applying the GlobeSumm-trained weights to saved user vectors, obtain a
separate owner/Trust/data-rights decision expanding ADR-065's offline-only
research scope. The [dataset card](https://huggingface.co/datasets/TommyYe/GlobeSumm)
labels the collection CC BY-SA 4.0, but underlying article rights are not
verified. Owner-only local use and distributing weights in an extension or
store are distinct decisions. No trained weights or corpus data enter Git,
the extension, routine logs, or provider requests under this proposal.

Before enabling live Topic routing, separately review browser-vector parity,
false joins on representative independent sources, manual pins, durable
rollback after intervening writes, discussion/Insight anchors, and actual
Chrome behavior. The observed one false join is a known risk, not a quality
pass. No release, deployment, model distribution, or store submission follows
from a local prototype switch.
