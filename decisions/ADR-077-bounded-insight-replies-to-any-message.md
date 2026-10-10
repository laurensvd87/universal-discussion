# ADR-077: Bounded Insight replies to any visible canonical message

Date: 2026-10-10.
Status: explicitly owner-approved; implemented/offline and synthetic-Chrome
verified in 0.13.35. Owner runtime activation/live provider check remains pending.

## Owner decision

The owner reports that the reply composer has lost its AI reply action. The
earlier follow-up implementation supports only an operator's own human question
directly under a generated opener. After an explicit scope question the owner
approves replies to any message within these limits:

- A deliberate sparkle click may generate and immediately post a completed AI
  reply to a visible message in the current canonical discussion, whether a root
  or nested reply, human or generated, and regardless of its author.
- Send at most 2,000 characters of the selected published message and 2,000 of
  its thread opener, the existing current-page extract of at most 4,096 characters,
  and at most five already-approved public related links through the local service
  to ChatGPT. This includes another user's selected comment. No full thread history
  or unsent editor text is included.
- Keep current page, Source, canonical Topic, operator/account and exact reply
  target checks. No automatic request, retry, public hosting or new permission.

This supersedes only the owned-question/generated-opener/direct-reply eligibility
restriction. ADR-075's invocation-local one-shot immediate sharing and completed
output checks remain; reopened/resumed jobs and old drafts remain private.

## Implementation contract

The existing `followupQuestionId` request field is retained for compatibility but
now identifies the selected published message, not necessarily a question. The
service resolves it from the current canonical discussion: the caller cannot
provide a root, foreign Topic or arbitrary conversation text as authority.
Root and selected target must remain visible and belong to the same canonical
discussion and root chain. A selected opener has identical root and target IDs.
Foreign roots shown by the experimental Source-scoped view remain read-only.

Long published posts are clipped independently to the approved 2,000-character
limits for provider input. Service job validation must still detect edits to the
full messages, including text outside the transmitted prefix, using a transient
local snapshot/digest. This does not add a retained content field or database
migration. Withdrawal, missing targets, account or page changes invalidate
sharing. Existing exact-result proof, fresh revision CAS, source anchoring and
one-use operation checks remain authoritative.

Provider input uses neutral `threadOpener` and `selectedMessage` fields. The prompt
answers the selected comment naturally, treats all supplied prose as untrusted,
and uses relevant related sources under the existing reference/citation contract.
The HTTP request stays stateless: `store: false`, `stream: true`, with only the
bounded context needed for this deliberate request. This follows the official
[Sign in with ChatGPT preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations),
checked 2026-10-10; no conversation storage or automatic previous-response chain
is added. Provider transport and SSE acceptance rules are unchanged.

The reply composer uses an icon-only sparkle, and each eligible canonical message
has the same accessible generation/posting action. One existing progress/result
workspace follows the exact selected message, including nested replies. Human
draft text, focus/caret, root generation and ADR-076's owner-local presentation
override are preserved. Clicking ordinary Reply or rendering the UI cannot start
generation or publish anything.

## Verification required

Offline tests must cover root-self selection, nested/other-author/generated
targets, truncation and edits beyond the prefix; foreign/missing/withdrawn/stale
targets, account/Source changes, exact proof, one-shot sharing and private resume.
Inspect provider payloads for only the approved selected/opener text, not other
comments or unsent drafts. Independent Trust reviews the authority/egress chain.
Disposable Chrome shared-UI QA checks sparkle routing, inline placement, stable
typing, keyboard names and narrow layouts without a live provider request or
replacement of the active owner service. Final results belong in STATUS.

No provider selection, model, website permission, persisted raw text, remote
publication, distribution or legal/store clearance is added. Existing explicitly
approved local debug mode remains a separate opt-in with its existing retention
rules; ordinary operation adds no new logs.

## Completed verification

Panel 67, Insight controller 65, discussion controller 56 and backend focused
126 tests pass. Full service: 374 pass/4 optional skips. Full extension: 1,100
pass/1 optional skip; capability-denied extension: 1,101 pass. Independent Trust
reviews canonical resolution, provider caps, full-body edit checks, ID-only
presentation, persistence ancestry and one-shot exact-result sharing with no
blocking issue. It catches and verifies removal of unrelated discussion context
from follow-up requests and redundant AI text in nested parent cues.

Real Chrome synthetic UI QA verifies the reply-composer sparkle on a long
other-author human root, root-self target binding, keyboard sparkle on a nested
generated message, inline progress and untouched unsent text. Existing typing,
source/time, reduced-motion, zoom and narrow no-overflow assertions pass. Root
reviews screenshots. Secret scans and diff checks pass. Tests use injected
provider results/inert controllers, not owner credentials or live inference.
The active owner service is not interrupted or replaced. A normal service
restart and extension reload are needed for owner activation.
