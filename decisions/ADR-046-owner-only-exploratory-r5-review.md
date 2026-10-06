# ADR-046: Owner-only exploratory R5 review

Date: 2026-10-05
Status: owner decided; six-source/15-pair local task frozen, no labels

## Decision

After the six-source public-page pilot in [ADR-045](ADR-045-r5-public-pair-acquisition-checkpoint.md),
the owner explicitly stated that he alone is sufficient as the human reviewer.
Do not require or repeatedly request another person for the **local proof-of-
concept learning loop**. The owner may rate candidate pairs using the existing
same Topic / different Topic / uncertain rubric. Keep the completed synthetic
six-pair owner exercise closed; this is a separate real-page pilot.

The owner is independent of the embedding model but is also the product owner,
source-scope approver and reader of some pilot cosine scores. His ratings are
valuable product feedback, but cannot be represented as a blinded, independent
secondary review. Show no scores, vectors, construction hints, or previous
answers in future rating views; record that some pilot scores were disclosed
before rating. Never fabricate a second identity or duplicate his answer as
an independent event.

## Boundary and consequence

This decision creates an **owner-only exploratory** lane. It supersedes the
independent-person prerequisite for *that lane's* pilot labeling. The older
[P1.2 completion plan](../plans/P1_2_COLLECTION_AND_COMPLETION.md) remains the
contract for any claim of an independently reviewed 200–250-pair corpus,
held-out performance estimate or calibrated AUTO activation. If those claims
are wanted later, obtain genuinely distinct people and complete its role,
coverage and adjudication gates; otherwise describe results plainly as
owner-rated exploratory evidence. A single owner cannot satisfy distinct
primary/secondary/adjudicator roles by changing labels or sessions.

No new Source collection, 200–250-pair scale-up, provider call, model download,
production threshold/routing change, owner-data migration, remote service,
deployment or publication follows from this reviewer decision. The existing
six-page provenance pilot and its retention/exclusion rules remain unchanged.
Before owner rating, prepare a versioned, digest-bound local task without
scores or labels. Keep any real-page task and answers in the Git-ignored review
workspace. A later decision must separately authorize scale-up and any
production rule informed by these exploratory ratings.

## Local preparation checkpoint

The isolated owner-review preparer passed 5/5 socket-denied synthetic tests
and a read-only Trust review. It binds the approved six Source files and their
inventory to an immutable task digest, and renders 15 pair prompts containing
only public title, URL, date and empty rating fields. The snapshot was created
once in the Git-ignored `spikes/topic-resolution/review/work/r5-owner-review/`
directory; its six-Source/15-pair counts and digest shape were checked without
printing real metadata. No rating, score or vector was written to the task.
This protects against accidental task drift, not a malicious local process
racing filesystem operations or a cryptographic authenticity claim.

[ADR-047](ADR-047-metadata-only-llm-triage-for-r5-pilot.md) records the
owner's later instruction to let the assistant handle obvious pairs. Its
title-only suggestions remain separate from the owner's one recorded answer.
