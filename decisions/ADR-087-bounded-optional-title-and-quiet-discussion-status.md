# ADR-087: Bounded optional titles and quiet discussion status

Date: 2026-10-11.
Status: owner approved; implemented, independently reviewed and verified in 0.13.46.

## Approval and evidence

The owner approves the narrow reader correction proposed after the linked
public-product diagnosis and requests minimal User Mode status: a loading icon
while discussions are being found and small error text at the bottom instead
of routine matching/fallback messages. Developer diagnostics remain available.

An anonymous actual-Chrome check of the public fittingstore product collects
its visible MAIN before scripts enlarge the document head. With no TITLE and
more than 256 head elements, the optional title search throws
`capture-head-budget` before content discovery, despite the MAIN remaining
visible. The generic non-ready UI then misleadingly claims Legacy E5
discussions are shown. This is reproduced reader behavior, not an inspection
of the owner's exact browser state or proof of a matching-model failure.

## Reader contract

- Inspect at most 256 direct head elements for the existing bounded optional
  title. Stop the title scan at its cap rather than rejecting otherwise
  eligible content. Do not advance to or inspect element 257 for title search.
- Preserve first nonempty title precedence within the authorized prefix;
  otherwise use the existing empty-title result and matcher hostname fallback.
- Keep region discovery unchanged, including its existing HEAD semantics.
  Do not add BODY extraction, a second sample, whole-head materialization,
  selectors over the entire page, metadata inference or a new extractor.
- Keep shared 40 ms/10,000-step limits, 4,096-character text/200-character title
  bounds, attribute limits, visibility/form/sensitive-subtree exclusions and
  exact document attestations. Exhaustion of shared resources still rejects
  capture. No page text is newly retained or sent to the local backend.

## Presentation contract

- User Mode shows a compact spinner during genuine pending capture/discussion
  reads, with an accessible loading announcement and reduced-motion behavior.
  Intentionally off, excluded or unsupported contexts must not spin forever.
- Suppress routine ready/choose-page/grouping/fallback notices in the user feed;
  never claim a Legacy discussion is displayed when no discussion was loaded.
- Show actual read/capture/service failures as concise localized text at the
  bottom. Do not render raw errors, page text, tokens or provider bodies.
- Preserve connection onboarding, accessible status, detached unsent text,
  unavailable reply targets and failed-write/reload guidance. Minimal status
  is not permission to hide lost-context warnings or enable unavailable writes.
- Keep Developer Mode diagnostics and Settings controls. No underlying
  matching, canonical routing, Insight authority, retry or posting change.

## Unchanged boundaries and verification

No new permission, provider call, model, ancestry/history transfer, crawler,
catalog ingestion from citations, retention, service restart or release gate.
The earlier startup-race proposal remains separate and unimplemented.

Run boundary/serialization/resource/exclusion tests and independent Trust review;
check user/developer rendering, real errors versus idle states, focus/typing and
mode transitions. Use isolated Chrome screenshots and a bounded anonymous live
reader check; neither requires an inference request or changes owner data.

## Completed evidence

GPT-6.1 Sol Medium reader/UI slices and independent Trust review pass. The
title cap stops before the sibling cursor advances beyond element 256; tests
cover boundary titles, missing/whitespace titles, serialized execution and the
shared time/node budgets. Empty title remains an existing valid reader result;
the matcher already substitutes the hostname. No alternate extraction or new
backend fields are introduced.

Reader/policy focused checks: **44 pass**; independent reader/policy/background:
**72 pass**. Panel/mode/layout/package: **102 pass**; independent concurrent
failure/pending/context cases: **nine pass**. Full frozen extension suite:
**1,157 pass, one optional skip**; capability-denied suite: **1,158 pass**.
Secret scan: **196 files, zero findings**; normal diff checks pass.

Actual isolated Chrome eligibility/collector smoke passes with boundary-title
fixtures and unchanged sensitive/hidden/form exclusions, zero runtime errors,
embedding/model/backend/provider requests. On the fully loaded public product,
318 head elements/no TITLE now yield three successful 3,949-character captures.
Only structural counts are recorded; no captured page text is saved or ingested.

Isolated synthetic Chrome visual/interaction harness exits **0**. Root reviews
390/320 px loading/error and compact dock screenshots; no horizontal overflow,
reduced-motion spinner, accessible loading and native-fluid bottom-error
geometry checks pass. Existing focus/IME, inline single editor, generated/human
reveal, manual recollapse, polling and late projection checks pass. An extra
native-fluid error screenshot repeatedly stalled CDP; that optional artifact
was omitted while retaining its layout assertion and earlier error screenshots.
The final complete harness runs successfully. This is synthetic layout evidence,
not a new native-panel identity attestation or live provider quality test.

No backend restart, owner data mutation, inference, retry, new permission or
release approval. Reload the unpacked extension to **0.13.46**, then revisit the
product; ordinary existing matching performs any ingestion after reload.
