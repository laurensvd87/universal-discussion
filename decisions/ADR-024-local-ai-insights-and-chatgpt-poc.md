# ADR-024: Local insight workflow and owner-invoked ChatGPT PoC

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
