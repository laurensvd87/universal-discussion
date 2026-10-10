# ADR-071: Proposed reversible owner-local Topic policy switch

Status: owner approved project use of trained weights for owner-local
integration on 2026-10-10. Reversible read-only alternate view implemented
in the local service, extension and Topic Atlas; canonical routing unchanged.
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

## Owner-local experimental implementation

Keep each captured browser E5 vector immutable. The local service applies
the candidate transform to a separate in-memory representation, never overwrites
the source vector or requires recapture solely for the transform. The backend,
not the extension, owns grouping and reports the actual experimental view
and availability. A client-side view preference is not a persistent change
to canonical Topic assignment. Do not expose the preference until a
source-scoped authenticated backend capability exists and is validated.

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

The first increments were unreferenced, synthetic-tested comparison and
virtual-view helpers. An isolated Chrome/Node parity harness found identical
384 coordinates on three fictional inputs with no external requests; this
does not prove real-page extraction or matching quality. The implemented
authenticated `GET /v1/sources/:id/alternate-discussion` now plans against
one SQLite snapshot, returns only the requested group's source IDs and
bounded rendered roots, and leaves all writes and AI Insight authority on
canonical IDs. The extension's explicit Settings switch defaults to Current;
foreign canonical roots are read-only and offer an open-source link. Topic
Atlas independently previews the same planner from a read-only database.
Missing or invalid local weights and planning-budget exhaustion fall back to
Current without changing saved data. The planner currently has a one-million
pair/ten-second safety budget (roughly 1,414 eligible pages), not a claim of
unlimited scalability. Indexing/incremental planning and response pagination
are required before broad catalog growth or release.

The owner-approved installer then generated an ignored local adapter. A
read-only 149-Source catalog shadow grouped the known French/Dutch translation
under both raw-E5 and adapter neighborhood policies. Its title-only audit of
multi-page groups judged current canonical 9 clearly same/5 questionable/3
wrong, raw candidate 9/4/3, and adapter candidate 9/4/4. The adapter's one
additional group is a wrong product/category join. This is exploratory
evidence against silently making the adapter the default, not a definitive
model-quality estimate. An experimental view may be locally selectable,
while the canonical policy remains unchanged and visible for comparison.

A separate title-E5 check found that a high title-cosine floor would remove
two known false local joins, but the same frozen 0.90 floor removed every
correct join found on a five-language synthetic holdout. Do not add that
blanket title gate to the live planner; its local examples were development
evidence.

## Gates

The owner's explicit project-use approval expands ADR-065 for owner-local
model use. The [dataset card](https://huggingface.co/datasets/TommyYe/GlobeSumm)
labels the collection CC BY-SA 4.0, but underlying article rights are not
verified; approval is not a legal determination. Keep fitted weights in an
ignored local file, not Git, extension assets, routine logs or provider
requests. Distribution and store review remain separate rights/owner gates.

The real-catalog shadow, manual-pin and cross-Topic write barriers, canonical
Insight anchors, stale revision handling, focused unit suites, and a
synthetic actual-Chrome regression smoke were reviewed. A dedicated
actual-Chrome alternate-switch smoke passed with a Source-bound Extension
request, unchanged draft/post/source link, unchanged canonical snapshot and
no writes on switch-back. This does not validate real-page grouping quality. The observed false joins are a
known risk, not a quality pass. No release, deployment, model distribution,
or store submission follows.
