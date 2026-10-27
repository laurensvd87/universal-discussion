# ADR-223: Semantic follow-ups retain foreground-page evidence

Date: 2026-10-27

Status: Design accepted for source implementation by Lead, Maintained Hierarchy
and Trust. No live activation or provider/SQL test success is claimed.

## Problem and decision

A user browsing Page B can select a discussion originally created on Page A.
Human replies already preserve that discussion's original destination. Deliberate
AI replies need the same destination while continuing to use B as the current
page's evidence. The existing AI job Map, ownership, cancellation, result and
publication lifecycle remain the implementation; no separate queue or proof
framework is introduced.

This is a narrow exception to ADR-077's restriction on foreign Source-scoped
follow-ups: only an exact, protected semantic historical target may be selected.
Unwitnessed requests retain the original restriction. Private follow-ups and new
Insights cannot use this exception.

The optional published-follow-up request carries
`semanticTarget:{nodeId,topicId,rootRevision,targetRevision}` alongside the existing
question and destination fields. One repeatable-read server snapshot must resolve
B's evidence anchor and A's exact root/target, public visibility, historical node
membership, destination and full-body digests. A bounded semantic target read
replaces full foreign-thread hydration for this branch.

The private job binds the complete A destination and body/revision witness plus
B's Source ID, lossless write version, operation ID, title-inclusive operation
digest, generation and authoritative Source stamp. B remains mandatory even if
the generated contribution's eligible origin is null. Never substitute A as the
captured origin. Dispatch, result delivery, resume and publication revalidate the
same binding; stale witnesses are refused, not refreshed. Existing account/actor,
operation, cancellation and expiry checks remain. Conflict recovery may renew the
global revision only; it cannot change A/B bindings, repeat a provider request or
extend expiry. Resumed results remain private; immediate one-shot sharing stays
local to the deliberate invocation.

Migration 016 adds only witnessed `share-insight-reply` support to the existing
18-argument lifecycle function. Both request material and the internal generated
result proof bind the witness and bounded server-issued expiry. Exact receipt
replay precedes freshness checks. Lock B's operation receipt then Source before
the existing destination/root/target locks, including when origin is null. Reuse
015's revision/public visibility/historical membership checks. No current-head
lock, canonical destination rewrite, table DML grant or relaxed legacy branch.

The application role cannot select the protected Source-stamp table. Migration
016 therefore also provides one narrow `semantic_insight_evidence(sourceId)`
security-definer read helper for the same snapshot: only lossless Source version,
operation ID/digest and stamp/postable metadata. Use a bounded canonical ID,
`pg_catalog` search path, qualified tables, no dynamic SQL/DML/locks, revoke public
execution and grant only application execution. This is metadata, not issuance;
publication independently checks the protected rows under its normal locks.

Provider egress keeps ADR-077/124's limits: at most 2,000 characters each from
the selected question and opener, 4,096 characters from the current B page, and
the existing approved bounded B-context related links. Full-body digests still
detect edits beyond excerpts. Do not send A's article, entire thread, unsent
drafts or arbitrary semantic neighbors. A digest of freshly extracted B article
bytes binds this transient job's evidence; it does not establish original durable
capture identity or server-verifiable native attestation.

The browser's deliberate `@AI` handoff must target the newly accepted human
question reply, followed by a fresh exact target read. Keep native document,
privacy and account checks before dispatch and publication. Reply language
continues to follow the question; standalone Insights use configured language.
The temporary semantic-AI UI restriction stays until backend and payload tests
pass.

## Validation and delivery

Extend existing controller, bridge, cited-reply, response-language and lifecycle
tests. Verify cross-Source success; edited/withdrawn/erased A targets; title-only
or other B renewal; account/document revocation; bounded expiry; exact replay and
altered-witness refusal; and unchanged legacy behavior. Actual isolated SQL must
exercise the same predicates and held-lock races before production installation.
Actual Chrome/provider and combined UI/database checks remain separate acceptance
work. The live crawler and services remain unchanged during source development.

Ordinary source ownership: Maintained Hierarchy implements backend runtime,
canonical read/lifecycle adapters, the new unregistered migration and focused
existing-suite tests. Lead integrates browser handoff and native assertions;
Semantic UI owns current layout fixes. Trust independently reviews boundaries.
Consumed experimental controllers, maps and saved outputs remain unchanged.
