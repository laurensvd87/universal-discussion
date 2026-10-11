# ADR-089: Low-friction accounts and reply-email plan

Date: 2026-10-11.
Status: proposed implementation design; account planning requested by owner.
No real-account/provider/email/deployment activation is approved by this plan.

## Requested product behavior

The owner requests email or ChatGPT sign-in, a username, writing with an account,
reading without an account, and optional email for replies except responses
deliberately requested through the recipient's own AI.

The executable slices, UI flow, notification rules, tests and activation gates
are in [ACCOUNTS_PLAN](../plans/ACCOUNTS_PLAN.md). This records a plan, not an
implemented account system or a new provider grant.

## Recommended design

- Start with passwordless email code plus a unique public username. Offer
  identity-only ChatGPT sign-in when the applicable registration supports it.
  Successful sign-in creates our own app session; it is not a pairing token.
- Keep discussion identity, local device pairing and ChatGPT inference permission
  separate. AI is optional; exhausting its quota or disconnecting it must not
  revoke discussion ownership or prevent human posting.
- Public read projections need no app account. Never remove pairing from the
  existing local catalog, browsing data, diagnostics or provider routes to get
  anonymous reads. Existing `local-public` posts are not Internet-public consent.
- Enable reply email only for a verified delivery address and an explicit
  account preference (default off). Direct replies address the selected parent
  owner, including an account-owned AI parent. Suppress self-initiated responses
  using server-derived invocation provenance, not an untrusted client flag.
- Commit post and deduplicated notification outbox atomically. A mail worker
  rechecks recipient/content eligibility; delivery failure cannot undo a post.
- No automatic linking by matching email, guessed ownership of Alex/Blair, or
  automatic conversion/publication of owner-local data. Preserve immutable
  human/agent provenance and existing canonical Source/Topic write fences.

## Provider evidence and boundaries

Official OpenAI documentation separates identity scopes from optional ChatGPT
plan usage. Our app must issue its own sessions after verified identity; website
account linking cannot rely on an email match alone. Existing local PKCE/ID-token
verification is reusable, but its combined inference scopes and single global
connection are not yet an account system.
[Sign-in quickstart](https://developers.openai.com/siwc/quickstart),
[Website identity flow](https://developers.openai.com/siwc/website).

The documented website integration is a selected-commercial-partner trial;
OSS/local plan-use documentation does not itself approve paid/remote operation.
Do not promise hosted/mobile ChatGPT SSO availability or registration portability
from the current local OAuth client. Email remains the provider-independent
baseline. Verify actual client eligibility before activating the optional method.
[Website availability](https://developers.openai.com/siwc/website),
[OSS/local scope](https://developers.openai.com/siwc/token-sharing-open-source).

Evidence checked 2026-10-11; availability needs rechecking at activation.
No provider interaction, registration, email send, real-user collection, new
permission, deployment, spending or publication is performed in this increment.
ADR-012's applicable lifecycle/rights requirements and later public/mobile
moderation gates remain. Current ADR-075/077/078 Insight scope is unchanged.
