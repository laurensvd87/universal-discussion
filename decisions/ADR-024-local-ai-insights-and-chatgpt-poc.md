# ADR-024: Local insight workflow and owner-invoked ChatGPT PoC

2026-10-02 amendment: [ADR-027](ADR-027-windows-protected-chatgpt-refresh.md)
supersedes the RAM-only refresh-token/restart clause below on Windows after
separate explicit owner approval. Access/ID tokens and extension pairing remain
session-only. [ADR-026](ADR-026-headerless-complete-sse-fallback.md) adds only
a bounded completed-SSE compatibility case for HTTP 200 without a format
header. The original 2026-09-29 decision text remains as its historical scope.

Date: 2026-09-29. Verification updated: 2026-09-30. Status: local implementation,
offline and isolated-browser tests complete. Provider choice and
button-invoked public-text/source research explicitly owner-approved in this
conversation. First live sign-in failed after callback receipt; no verified
authorization or successful provider call is claimed.

## Authority and scope

The owner requests implementation of the AI cold-start proposal, emphasizing
the additional value of our same-Topic and related pages. They subsequently
approve ChatGPT connection with their account, specify that pressing Create
insights allows reading page text (not secrets) and linked reachable pages, and
ask the lead to use subagents until a working local PoC is reached.

This does not authorize unattended AI activity, private/authenticated content,
whole-screen images, hidden text, credentials, automatic posting, a cloud service,
paid API fallback, spending/recruitment/publication, or a store submission. The
existing owner-local/synthetic discussion identity is not real authentication.

## Local workflow

1. Project already loaded source descriptors into three distinct buckets:
   selected source, up to five other same-Topic sources, up to five related
   sources. Grouping is provisional, not evidence of correctness. Include at most
   five human root excerpts of 800 characters only when explicitly requested;
   exclude agent roots to limit circular AI amplification.
2. Local context preparation and manual draft entry work without a provider.
   Text/context/preview remain in popup memory. Context changes clear them.
3. A separate exact preview precedes Share insight locally. Save only the
   reviewed body, fixed agent identity, synthetic human operator and deliberate
   source anchor; never attach the private research context automatically.
4. `share-insight` is a strict new root command under existing revision CAS.
   The server derives `demo-imported-ai` / agent and manual-import provenance.
   Provider/model identity is not attested by a pasted or edited draft. Only its
   human demo operator may edit/withdraw it; edits preserve its AI label.
   Withdrawal purges content, author, operator provenance and source link.
   Existing source-anchored regrouping and replies continue unchanged.
5. This is an additive validated v2 state variant. Old human records do not
   change. Older readers reject agent records rather than silently relabel them.
   Back up the owner database before any later rollback to an older binary.

## ChatGPT implementation envelope

Use the documented local ChatGPT plan-use OAuth route, not cookies, ChatGPT UI
automation, native-client impersonation or private backend endpoints. Actual
account/model/search availability is discovered and may still reject this PoC.
No project license or hosted/commercial eligibility is inferred or changed.

- The existing paired loopback service owns OAuth. A stable opaque host ID and
  non-secret registration mapping may persist in its ignored local data folder;
  access, refresh and ID tokens remain in process memory, never extension storage,
  page context, logs, SQLite discussion state, or source control. Restart requires
  reauthorization. Sign-out clears local tokens and attempts remote revocation.
- Authorization uses state, nonce, PKCE, issued client ID and verified ID-token
  signature/issuer/audience/expiry. A narrow loopback callback is the only
  capability-token exception; OAuth state still authenticates the attempt.
- Preparing AI context explicitly reads the current public article using the
  existing bounded reader, at most 4,096 characters, excluding forms/editable,
  hidden and other previously excluded regions. Reattest the document before
  sending. Visible prose can contain secrets; syntactic filters cannot guarantee
  otherwise. The user must inspect the visible payload and use public pages only.
- Create insights sends that reviewed text plus the bounded source context via
  the local service to OpenAI. This intentionally changes the earlier no-body-
  egress rule for this action only; background embedding still sends no raw text.
  The local service is a transient relay, not a body store. No article archive.
- Provider web research, when selected, is limited to the supplied public-source
  domains. The provider may not access everything the browser can; no cookies or
  logged-in sessions are transferred. Report unavailable/unchecked sources. Never
  treat returned citations as an approved source corpus or automatically embed
  them. No local crawler, Brave/Google API, arbitrary tools, shell or MCP.
- Use the account's listed models, `store:false` and streamed Responses. Accept
  only completed output; failures/partial streams do not become draft findings.
  Keep results private until separate local share. `store:false` is not a
  promise of zero provider retention or exemption from provider data policies.
- One active request, five requests per rolling hour per process, 90-second
  deadline, bounded input/output/stream and no automatic retries or fallback.
  Restart resets this prototype limiter. Local abort is not a billing guarantee.
  The owner must keep app credit spending at zero in ChatGPT settings for an
  allowance-only test; the app cannot override provider-side credit settings.
  No API key, purchase, new credits or paid fallback is used.

## Evidence and gates

Main and selected Sol Medium agents implement/review isolated slices. Unit,
malformed-input, stale-context, authorization/provenance, persistence, transport
and isolated-browser checks must precede a completion claim. Live login requires
the owner's own browser interaction; no password/token is requested in chat.

The subsequent owner UI request uses progressive disclosure in User Mode:
Topic/discussion first, compact insight entry, secondary account/source/manual
draft/session details. Payload review, cost confirmation and separate sharing
remain visible at their action boundaries; this is not reduced consent.
Offline results and the successful isolated Chrome flow are recorded in STATUS.
The owner freed the required test port; no owner data or live provider was used.

## 2026-09-30 live-readiness clarification (0.12.1)

Official sign-in guidance permits a valid account identity grant without the
plan-use scopes. This is shown as connected identity but **not** permission to
list models or infer. Only an explicit second Continue with ChatGPT requests
consent again; page navigation does not cancel an account-scoped sign-in.
First dynamic-registration `invalid_grant` retains only the issued client ID
in memory for a fresh attempt. Transient refresh failures preserve credentials
for an explicit later attempt, while documented unusable refresh credentials
clear them. No automatic provider call, retry of research or paid fallback was
added. Account model catalogs and supported capability/usage errors remain
bounded; provider body text is not surfaced to the extension.

Lead integration and a read-only Sol Medium security review found no remaining
code blocker. Service 132/132, loopback 2/2, extension 799/799, indicator
537/537 and actual isolated Chrome synthetic research pass. This confirms the
local mechanics only; live account/search eligibility and useful output remain
untested and require the owner's own sign-in. No new capture, token retention,
publication or release approval follows.

## 2026-09-30 first owner login and diagnostic boundary (0.12.2)

The first real authorization redirect reached the loopback callback but the
extension reported failure. The callback acknowledgment had only proved local
receipt; code exchange, OIDC verification and registration ran asynchronously.
No verified account or successful inference is claimed, and the exact failure
stage cannot be reconstructed from the prior generic status. The owner was
advised not to reuse or share authorization URLs and to start a fresh attempt.

The callback page now explicitly states that verification is incomplete. The
paired status may expose one of nine fixed diagnostic stages; the extension
renders only fixed English messages. These in-memory stages do not contain
codes, state, tokens, callback URLs, provider bodies, request IDs or account
identifiers. Public callback HTML remains generic. Disconnect fences in-flight
callback outcomes from restoring stale status. No diagnostic is persisted or
sent to telemetry, and no new provider call is automatic. An independent
security review found no new secret-exposure blocker. The existing five-minute
attempt lease is unchanged until live evidence shows whether it is too short.

Primary documentation checked 2026-09-29:

- [ChatGPT plan-use overview](https://developers.openai.com/siwc/token-sharing-open-source)
- [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
- [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [Web search and citations](https://developers.openai.com/api/docs/guides/tools-web-search)

This does not repeat the completed 6/6 review or authorize the later 200–250-pair
review. Private/remote/multi-user, new provider/spending and publication gates
remain. A successful local call would not prove insight quality, safe autonomous
publication, legal/store acceptance or product-market fit.

## 2026-10-01 identity-verification compatibility and diagnostic (0.12.3)

The owner's fresh attempt reached `identity-verification-failed`. That code
does not identify which local identity check failed and does not imply that the
provider rejected the account. Official sign-in guidance requires a verified
JWKS signature, issuer, audience, expiration and nonce; it does not constrain
the audience claim to a scalar string. The existing verifier accepts only the
exact client ID or a singleton array containing it, rejects multi-audience
tokens and mismatched `azp`, and preserves signature, issuer, nonce and time
checks. No general algorithm/key-policy relaxation is inferred from the live
report.

The authenticated status can now contain one of six fixed in-memory identity
substages: `jwks-request-failed`, `jwks-invalid`, `token-header-invalid`,
`matching-key-invalid`, `signature-invalid` or `claims-invalid`. The extension
maps them to fixed English guidance. Neither the callback nor the status
reflects token/claim/JWKS contents, account identifiers or provider body text.
Substages clear on retry, success and disconnect. This narrows the next owner
test without reusing a prior code or disclosing secrets. The root cause and a
successful real-provider connection remain unverified; any further algorithm,
key or claim-policy change needs evidence and trust review.

## 2026-10-01 model-catalog diagnostic boundary (0.12.5)

The owner reports a connected ChatGPT account but no selectable models after
an explicit catalog request. The 0.12.4 fixed message only establishes that
the catalog request failed somewhere; it does not prove provider rejection,
missing plan permission or an empty catalog. The existing connector uses the
official account-specific `GET /v1/models` endpoint and displayable entries,
but local transport had hidden all failures behind one generic status.

For the paired, owner-clicked model-list route only, known internal errors now
project to six fixed categories: `access-rejected`, `rate-limited`, `timed-out`,
`invalid-response`, `provider-unavailable` and `busy`. These are in-app
classifications, not verbatim OpenAI error codes. Unexpected errors remain
generic; no raw response text, headers, model catalog on failure, credential,
account identity or request ID is projected or logged. The extension accepts
only the exact failure shape and renders fixed English guidance. Successful
listing and no-plan authorization behavior are unchanged. The 25-second
service/30-second extension deadlines keep the existing 90-second research
deadline unchanged and do not add retries, automatic calls or paid fallback.
The next fresh owner click will determine which branch was encountered; this
diagnostic does not itself fix live provider eligibility or response shape.

## 2026-10-01 bounded model-catalog diagnostics and UI correction (0.12.6)

The owner restarted the service and reported `invalid-response` with fixed
`catalog-body` detail. That establishes a failure while reading the model
catalog body, but does not distinguish the former 256 KiB cap from a stream or
encoding failure. Official OpenAI documentation confirms the existing
ChatGPT-plan `models[]` / `visibility` / `slug` / `display_name` format; no
alternative provider endpoint, scraping or catalog-shape fallback is added.

Only the explicit model-list GET may read up to 2 MiB and inspect up to 2,048
entries; at most 100 validated displayable models reach the extension. The
research response remains capped at 256 KiB. New fixed catalog details separate
oversize, missing/malformed stream and invalid UTF-8 from JSON/shape/entry
errors. A larger catalog is still rejected, not silently truncated.

The paired service retains at most 20 fixed model-list outcome codes in process
memory and exposes them only through the existing Origin/capability checks on
`GET /v1/ai/diagnostics`. The extension keeps at most 20 of its own fixed
outcomes in popup memory. Developer Mode reads the service record only on an
explicit click. No bodies, headers, model names, account identity, callback
data, tokens, URLs, timestamps or arbitrary exception messages enter either
record; disconnect clears the popup record and service restart clears its
record. No disk log, telemetry, automatic provider request, paid fallback or
new permission is introduced. This is owner-local PoC debugging, not a general
production logging policy. The user-facing UI retains Topic/discussion first
and hides account identity in User Mode; sign-in, provider-send and local-share
consents remain separate.
