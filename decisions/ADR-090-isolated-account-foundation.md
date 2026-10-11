# ADR-090: Isolated account foundation before real-user activation

Date: 2026-10-11.
Status: implemented and independently reviewed for isolated synthetic use.
Normal owner-local integration/activation is now separately approved and
implemented in [ADR-091](ADR-091-connected-chatgpt-local-accounts.md).
Live mail remains deferred until domain/hosting setup. The dormant statements
below record this earlier package, not the current normal composition.

## Implementation boundary

The owner requests professional implementation of ADR-089, not only a plan.
Build the tested account/session, compact login-sheet and reply-outbox modules
with synthetic accounts, fake email and an explicit in-process API composition.
The current owner service, demo posts, pairing and ChatGPT grants remain usable.

Account tables have their own declared, versioned SQLite schema in isolated
fixture databases. Do not add them to or open the owner's `demo.sqlite`, guess
legacy ownership, or weaken its strict schema validation. A future shared
repository migration and canonical contribution/principal bridge remain explicit
integration work; fixture transaction tests do not prove that bridge exists.

Account routes are injected explicitly into the existing paired handler for
tests. Default composition exposes none. Device Host/Origin/pairing validation
is still mandatory; app sessions supply account authority, not `X-Demo-Actor`.
Do not expose the existing full catalog as a new anonymous Internet API.

The sheet and controller use inert English language-pack keys, server-derived
account DTOs, request epochs, accessible focus and reduced-motion behavior.
Credentials stay outside rendered state. QA uses only reserved `.test` addresses
and a private fake-mail sink; no real address, SMTP or OAuth call occurs.

Reply notification policy resolves the canonical parent owner and initiating
account from trusted server data. Post/outbox atomicity is tested against an
isolated transaction callback, never claimed for the unchanged demo commands.
Opt-out/deletion/current eligibility wins before a worker delivers. Delivery
adapters stay fake; no mail is sent outside the process.

## Gates and remaining work

Real identity collection, durable browser credential transport, the owner-store
migration/ownership bridge, actual email provider and identity-only ChatGPT
registration need the precise later implementation/activation reviews from
ACCOUNTS_PLAN. No deployment, spending, invitations or store/public release is
authorized by this fixture package. Preserve existing Insight permission,
bounded provider context, one-shot sharing and canonical Source checks.

Require restart/replay/ownership/rollback tests, independent Trust review, API
boundary tests and isolated browser interaction/layout QA before committing.
Keep current STATUS/HANDOFF honest about implemented modules versus activation.

## Implemented evidence

The strict isolated SQLite repository persists names/accounts, keyed code and
session verifiers, rate limits and a minimal reply outbox. Access expires after
15 minutes; rotation issues a new **rolling 30-day** refresh lifetime and revokes
the previous credentials atomically. This is not a fixed 30-day absolute limit.
Logout also revokes an exact retained access credential after its access expiry.
No raw session/code is stored in SQLite or rendered by the controller.

Request codes are six digits, valid ten minutes, bound to a random client nonce,
limited to five attempts, with a 60-second resend cooldown, three requests per
address/hour and 30 globally/hour. These are fixture operational defaults, not
production abuse protection. Only reserved `.test` addresses and a synchronous
fake sink are supported. Code consumption/account creation/session issuance and
username uniqueness are transaction-tested. Reopening rejects unknown SQLite
objects, including otherwise harmless-looking views, triggers and user indices.

The optional account handler remains paired and exact-Origin constrained, rejects
demo actor headers, and is not injected by CLI/startup. The injected browser
transport is bounded, timeout-covered, redirect-free and strictly projects DTOs.
The sheet preserves input/focus on same-stage updates, traps keyboard focus,
makes its background inert while open and restores it exactly on closure.
Epoch and persistence fencing plus pending rotation revocation receipts prevent
cancel/logout/disposal races from resurrecting an account. Cancelling rotation
can require sign-in again; it never displays a revoked stale session as connected.

Notification tests cover trusted human/agent ownership, self-AI suppression,
atomic callback rollback, idempotency, current eligibility/address, opt-out races,
leases, coalescing, bounded retries and ambiguous delivery. Failed/ambiguous
delivery never repeats inference. Terminal deduplication rows have no implemented
retention cleanup policy yet. The signed unsubscribe primitive has no HTTP route.

Independent Trust review passes after schema, expired-access logout and rotation/
sign-out corrections: 35 service/API and 30 controller/sheet checks. Full service
474 pass/four optional skips; restricted extension 1,190 pass. Isolated real Chrome
exercises the real in-process account API without a listener: five intercepted
requests, zero runtime errors, email/code/name/settings/logout, no automatic post,
draft preservation, 320px layout, focus trap/restore and reduced motion.
Screenshots stay in known Temp; no owner profile/database or provider is involved.

This is not a completed production account system. Canonical post/principal
integration, owner-store migration, browser restart credential persistence,
real email, optional identity-only ChatGPT, rights/recovery and release readiness
remain in ACCOUNTS_PLAN. Existing demo writes/AI grant are unchanged.
