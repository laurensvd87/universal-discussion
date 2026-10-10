# ADR-075: Click-authorized immediate local Insight sharing

Date: 2026-10-10.
Status: explicitly owner-approved; implemented with offline, independent Trust
and synthetic Chrome shared-UI verification (0.13.33).

## Owner decision

The owner requests generated follow-up replies at their exact conversation
location, a compact robot action instead of per-message "Get insights" text,
and generated Insights visible to everyone immediately. After an explicit scope
question the owner approves: a deliberate Get insight/robot-icon click generates
and immediately posts the exact completed AI message to the **shared local**
discussion without a private preview or separate Share. This covers new roots
and the existing permitted follow-up replies, including the strict completed-
stream compatibility cases previously limited to private drafts by ADR-028/031.
Unreviewed text can contain errors or sensitive material; the owner accepts that
local product trade-off. This is not public hosting, remote release or store
approval, and the current synthetic identities are not real user authentication.

## Narrow implementation

- Only the trusted production UI composition enables `shareOnCompletion`.
  Controller default remains private for other callers. Each deliberate creation
  invocation carries one memory-only publication intent, consumed before writing.
  Render, background browsing, login, startup and polling never create that intent.
- Use the existing exact completed-result proof, `preparedReview` and Share chain,
  with fresh Source, canonical Topic, account/operator, document and reply-target
  checks, current revision CAS and service-side body attestation. Do not bypass
  these checks for a visually grouped foreign Topic. Generated text remains
  robot-labelled and source-linked, with existing withdrawal controls.
- Failed/incomplete/unsafe provider output is not shared. Lost context or target
  prevents posting. A known-safe rejected write may retain a private result for
  explicit recovery; an uncertain write requires the existing fresh-read flow.
  Never retry generation or publication automatically, or duplicate a post.
- A recovered/resumed operation remains private: reopening the UI cannot infer
  the original creation click's publication intent. No new stored intent, backend
  schema, job retention, provider request type or page-data transfer is added.
- A presentation-only follow-up binding puts one existing Insight workspace
  beneath the validated question through preparation, generation, completion and
  recovery. It is not write authority. Removed/foreign/mismatched targets cannot
  host an actionable draft. Root Insights keep their top-of-discussion placement.
  Keep human draft focus, cursor and text stable when the workspace moves.
- The per-message robot icon retains a localized accessible name/title explaining
  generation and posting. Developer mode keeps its diagnostic text. Existing
  bundled icons, CSP, permissions and reduced-motion behavior remain unchanged.

This supersedes only the separate Share/private-first requirement for those
new click-authorized local generations in ADR-024/028/031/050. Their completed-
output, refusal, contradiction, citation, exact-body and account/context checks
remain. Earlier private results are not retroactively shared, and parser
acceptance is not broadened. Human comments still require their own Post action.

## Verification required

Offline tests must cover exactly-once root/follow-up posting, private defaults and
completed recovery, harmless catalog additions, context/account/target loss,
failed provider output and uncertain writes. Independent Trust reviews the
authority chain and invocation intent. Disposable Chrome shared-UI tests cover
inline loading/results, robot keyboard access, focus during refresh, one workspace
and narrow/reduced-motion layouts; they are not native-auth evidence.
The active owner service must not be replaced by synthetic fixed-port QA while
the owner's browser can access it. No live provider call is needed for this
workflow/layout correction. Exact results are recorded in STATUS.

## Completed checks

Controller tests: 61 pass; focused panel/shell tests: 101 pass. Full extension
suite: 1,087 pass/1 optional skip; capability-denied suite: 1,088 pass.
Independent Trust and its final post-share-readiness delta review find no
blocking publication-authority issue. Chrome validates per-character typing,
inline progress/results, explicit robot keyboard activation, one workspace,
target loss, reduced-motion posting and narrow no-overflow layouts. Root reviewed
the screenshots. No live provider call or owner-profile test was made, and no
running service, credential or saved discussion was modified by this QA.
Successful writes locally prepare the same still-eligible context for another
deliberate action; preparation itself never starts a request or post.
