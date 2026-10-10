# ADR-071: Proposed reversible owner-local Topic policy switch

Status: owner approved project use of trained weights for owner-local
integration on 2026-10-10; implementation and live alternate view pending.
This is not third-party rights or release clearance.
Date: 2026-10-10.

## Context

The owner wants the topic-oriented diagonal adapter integrated into the
extension and local backend, with a way to return to the existing E5 grouping.
The owner explicitly approved use of its trained weights for this project
and an owner-local experiment despite possible wrong groupings. That does
not settle underlying publisher rights or authorize model distribution.
The current backend still applies `adaptive-supported-partitions/v1`, including
the fixed 0.04 competing-neighbor lead the owner previously rejected. The
owner's two De Standaard language versions were saved with compatible browser
E5 vectors and 0.951 cosine similarity, but separate provisional Topics:
a 0.932 competitor left only 0.019 lead. This is a concrete old-policy false
negative, not an absent capture. The new adapter is not yet a live model.
Its body-prefix transfer found one false join where raw E5 found none;
independent publisher/viewpoint safety has not been established.

## Proposed design, not activated

Keep each captured browser E5 vector immutable. The local service would apply
the candidate transform to a separate in-memory representation, never overwrite
the source vector or require recapture solely for the transform. The backend,
not the extension, owns grouping and reports the actual active policy and
availability. Do not expose a switch in the extension until the backend can
atomically change and report the live policy.

A first local switch can instead be a **backend-owned alternate discussion
view** over unchanged canonical E5 Source links and discussion records. A
complete, revision-bound candidate partition groups Source-anchored roots
and their replies for display. New roots for the current Source are saved
in its canonical Topic and appear in the alternate view. Switching back
reveals those same posts in canonical Topics; no data migration or reversal
of writes is needed. Manual-confirmed Sources and legacy/topic-anchored
roots remain canonical, never guessed into candidate groups. Candidate IDs
are display-only, not command authority; merged views need a response bound.

A reply to a root in another canonical Topic needs a guarded write contract
to retain the viewer's Source link. Existing AI Insight creation/sharing
remains bound to the current Source's canonical Topic; virtual IDs must not
enter provider proofs or context. Cross-Topic AI follow-ups are deferred.
This view switch is not equivalent to permanently reassigning Topics. Any
future canonical rerouting needs separate transactional migration/rollback.

The first increments are unreferenced, synthetic-tested comparison and
virtual-view helpers. They neither read retained Sources nor produce real
adapter partitions. An isolated Chrome/Node parity harness found identical
384 coordinates on three fictional inputs with no external requests; this
does not prove real-page extraction or matching quality. The extension has
no alternate grouping UI yet because no truthful backend capability exists.

## Gates

The owner's explicit project-use approval expands ADR-065 for owner-local
model use. The [dataset card](https://huggingface.co/datasets/TommyYe/GlobeSumm)
labels the collection CC BY-SA 4.0, but underlying article rights are not
verified; approval is not a legal determination. Keep fitted weights in an
ignored local file, not Git, extension assets, routine logs or provider
requests. Distribution and store review remain separate rights/owner gates.

Before exposing the alternate view in the extension, review real-catalog
partition behavior, manual-pin barriers, cross-Topic reply authority,
discussion/Insight anchors, stale revision handling and actual Chrome
behavior. The observed one false join is a known risk, not a quality pass.
No release, deployment, model distribution, or store submission follows.
