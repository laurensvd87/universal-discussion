# Accounts and reply notifications: lean implementation plan

Date: 2026-10-11. Status: isolated foundation implemented; live integration pending.
Decisions: [ADR-089](../decisions/ADR-089-account-and-reply-email-plan.md),
[ADR-090](../decisions/ADR-090-isolated-account-foundation.md).

## Implementation checkpoint

- **A1, partial:** strict versioned isolated SQLite, persistent username/private
  verified fixture address, nonce-bound single-use email code, rate limits,
  keyed verifiers, rotating/revocable sessions and paired optional API work.
  Existing owner-store migration and canonical post/principal bridge do not.
- **A2, partial:** reusable English login/profile sheet, injected bounded client,
  draft-preserving interaction preview, logout, reply-email switch, resend,
  accessibility and stale-result/storage fencing work. Synthetic mail only;
  owner-panel wiring and protected browser-restart persistence remain.
- **A3:** not implemented; no ChatGPT account-login button is shown when the
  optional identity capability is absent. Existing inference login is unchanged.
- **A4, partial:** fake notification outbox/worker, recipient/provenance policy,
  transactional callback, deduplication, opt-out rechecks, coalescing, leases,
  bounded retries and signed off-only unsubscribe work. No canonical demo-command
  integration, real transport, unsubscribe HTTP endpoint or terminal-row cleanup.
- **A5:** not implemented; rights/access/deletion/recovery, real-user ownership,
  public read projections, per-account AI grants and migration rehearsal remain.

Independent Trust passes; full service 474 pass/four optional skips, restricted
extension 1,190 pass. Real isolated Chrome proves email/code/username/preference/
logout through the actual in-process handler, draft preservation with no automatic
post, stable input/focus, responsive 320px layout and reduced motion. No real
user/mail, owner-store write or listener.
See [module documentation](../apps/local-service/src/accounts/README.md).
Existing app stays on its synthetic identities until the exact activation package
is reviewed and approved; do not silently assign their posts to a new account.

## Product flow

Reading public discussions needs no account. Only attempting to post, reply or
generate a posted Insight opens a compact sign-in sheet. Preserve the unsent
text and its exact destination during sign-in; do not post automatically after
returning to a changed page or discussion.

Offer **Continue with email** and, where supported, **Continue with ChatGPT**.
For email, send a short-lived code to the address and enter it in the same sheet;
no password, reset-password flow or mandatory browser-tab round-trip. After first
verification, choose a suggested available username, then return to the composer.
Existing users skip username setup. The final account flow stays signed in across
ordinary panel/browser restarts using renewable, revocable app sessions. Browser
credential persistence is not yet wired in the isolated package.

Use a small profile icon in Settings for username, linked sign-in methods,
reply-mail preference, logout and account/privacy controls. English UI uses
language-pack keys. No extra identity/cost disclaimer in the discussion feed.
The necessary terms/privacy entry points live at onboarding and in Settings.

Reading without login does not authorize background catalog writes or collection
of an anonymous visitor's history. Browser capture retains its separate approved
scope and device-access controls. "Messages" here means forum roots/replies;
private direct messaging, followers and social profiles are out of this MVP.

## Defaults and account model

1. **Email without a password:** a code is the baseline, so posting never depends
   on owning ChatGPT or an AI subscription. Start with a six-digit random code,
   ten-minute expiry, five verification attempts and resend cooldown. Add
   per-address/challenge and global delivery limits before live activation;
   tune these operational defaults under the auth/security review. Code-request
   responses must not distinguish existing accounts from new addresses. Consume
   a valid challenge and issue its session atomically, so replay cannot log in twice.
2. **Username:** a stable account ID owns posts; a username is presentation,
   never authorization. Start with a case-insensitive unique handle of 3–24
   ASCII letters/digits/underscores, reserved-name checks and race-safe uniqueness.
   An optional Unicode display name can follow without changing ownership.
   Never publish a ChatGPT real name or email as a username automatically.
3. **Independent sessions:** use opaque random app credentials, hashed server-side,
   rotating renewal, revocation and device/session inspection. Short access
   lifetime renews silently; finite renewal lifetimes and fresh verification for
   sensitive changes are security details, not a frequent login screen.
4. **AI ownership:** AI messages keep the sparkle/provenance and belong to their
   authenticated invoking account for withdrawal and notification purposes.
   Human and agent authors remain disjoint; no shared global "robot owner".
5. **Optional mail:** reply email defaults off, enabled once in account settings.
   Notification address is private and independently verified before delivery.

## ChatGPT sign-in is not the AI connection

Identity-only sign-in requests `openid profile email`, verifies the signed
identity, and creates our own account/session. Using the user's ChatGPT plan is
a separate optional grant; quota exhaustion, provider disconnect or a different
AI account must not silently change the discussion account.
[OpenAI sign-in quickstart](https://developers.openai.com/siwc/quickstart).

Reuse the current tested PKCE/state/nonce/JWKS/signature primitives, not its
combined scope string or provider token as an app session. Persist the validated
external identity namespace (issuer, client registration, subject) separately
from labels/emails. Linking another method requires a current app session and
proof of the new method; a matching email is insufficient. Never treat subjects
from unrelated clients as interchangeable. Unlink cannot remove the last usable
login/recovery method.
[OpenAI website identity flow](https://developers.openai.com/siwc/website).

The local OSS client is not proof of a general hosted/mobile identity integration:
website sign-in currently has a partner availability gate, and the OSS docs
scope their flow to open-source/local use. Keep email working independently and
confirm registration/callback eligibility before activating ChatGPT login for
real accounts. Do not copy owner refresh tokens into a hosted service.
[Website availability](https://developers.openai.com/siwc/website),
[OSS/local integration scope](https://developers.openai.com/siwc/token-sharing-open-source).
Checked 2026-10-11; recheck before implementation activation.

## Reply-mail behavior

| Event | Mail to an opted-in, verified recipient? |
| --- | --- |
| Someone replies directly to my human post | Yes |
| Someone replies to an AI post belonging to my account | Yes |
| I reply to my own post | No |
| I click the sparkle and it answers my own post | No |
| Another person invokes their AI to answer my post | Yes |
| Someone replies deeper in a thread, but not to my message | No; thread subscriptions are later work |
| My own sparkle answers another person's message | Only that person's eligible account, never me |

Compute the recipient from the canonical reply target, not a Topic title or a
client-supplied email. Store the authenticated initiating account with trusted AI
invocation provenance. A caller cannot turn suppression on/off for someone else;
absence of provenance must not be guessed from an AI badge or display name.
Withdrawn or deleted parent authors and blocked/ineligible recipients do not get
new notifications. No email for edits, page captures, matching changes or retries.

Create one outbox entry per `(reply ID, recipient account ID, notification kind)`
in the **same transaction** as the successful new reply. Idempotent repeat posts
cannot queue duplicate mail. A worker sends after commit and rechecks opt-in,
verified address, account state, live reply/parent, access and moderation/block
rules before delivery. Opt-out, withdrawal and deletion cancel pending entries.
Already delivered email cannot be recalled; disclose that in privacy settings.

Keep mail minimal: "You have a new reply", a safe platform conversation link,
and an unsubscribe control. Do not include the page extract, provider prompt,
full post text or tracked source URL. Resolve the recipient's current eligible
verified address at send time; do not leave stale addresses in queued payloads.
Unsubscribe authorizes only turning reply email off, never login or other writes.

Use bounded outbox retries/backoff and provider idempotency where supported;
mail delivery cannot undo a post or trigger AI again. With ambiguous provider
delivery, do not claim exactly-once mail without provider support. Start with
coalesced reply notifications and a per-recipient sending cap, not a broadcast
for every activity in a popular Topic. Local development uses a fake mail sink;
real delivery waits for provider/domain/budget/privacy approval.

## Repository integration and minimal storage

Keep one modular backend, not an identity microservice. Add replaceable identity
and mail adapters. The current SQLite repository accepts exactly one
`demo_state` table, so auth/outbox tables need an explicit versioned repository
migration and shared transaction boundary, not unreviewed extra tables.

Minimum records: accounts (ID, username, state, preference); private verified
email contacts; external login identities; single-use login challenges;
hashed app sessions; trusted AI-invocation account provenance; notification
outbox and deduplication keys. Store code verifiers as server-keyed hashes, not
plain low-entropy hashes. Expired challenges and delivery records have short,
documented cleanup periods. No raw codes/tokens/page text in ordinary logs.

Replace static `DEMO_ACTORS` resolution and `actor.demo === true` through a
reviewed account-aware adapter; never pretend real users are demo principals.
Derive the actor from the server-validated app session, ignoring forged
`X-Demo-Actor`/owner IDs. Retain canonical Source/Topic/version/target checks and
exact-body, one-shot AI posting attestations. Provider grants are account-owned
and private; the current single global ChatGPT connection is local-only.

Expose explicit **public discussion** read DTOs, not the existing full catalog.
All local routes currently require device pairing: do not drop that check from
catalog, vectors, diagnostics, jobs, ingestion, preferences or account controls.
Guest read projections include only approved public contributions and safe
published origin links. Pairing grants device access, never another user's
ownership. Authenticated writes remain separate from read-only discovery.

For a future web client use protected first-party sessions with CSRF protection;
extension/mobile use platform-appropriate protected, revocable credentials.
Cookie flags alone are not cross-platform auth or sufficient CSRF protection.
Require exact callbacks, constrained app redirects and account-linking tests;
use maintained auth libraries where practical rather than another hand-rolled
protocol. Deployment topology determines the final credential transport.

## Small implementation slices

| Slice | Deliverable | Required executable evidence |
| --- | --- | --- |
| A1 — Local account foundation | Versioned SQLite migration, account/session/principal adapter, username uniqueness; synthetic accounts only | Restart, transaction rollback, invalid schema, forged actor/ownership, concurrent username, session rotation/replay/revocation |
| A2 — Low-friction email flow | Code login with fake mail sink, single sign-in sheet, draft preservation, logout and settings | Expired/reused/brute-forced code, resend/enumeration guards, link/redirect attacks, changed destination, browser restart |
| A3 — Optional ChatGPT identity | Identity-only adapter behind a feature flag, explicit linking and own app sessions | Fake signed claims/PKCE/nonce, wrong client/issuer/sub, unverified email, duplicate accounts, link takeover, quota/provider disconnect isolation |
| A4 — Reply notifications | Atomic outbox, preference, unsubscribe and coalescing, fake worker | Every table case above; duplicate submission, self-AI provenance, deleted/blocked targets, opt-out/send races, failed/ambiguous delivery |
| A5 — Activation readiness | Usable access/deletion route, owned human/AI withdrawal, abuse controls, safe public projections; migration rehearsal | Cross-user isolation, rights/delete/cache/outbox cancellation, provenance, restore/delete precedence and independent Trust/QA review |

A1/A2 and the A4 fake worker can progress without mail delivery or OpenAI calls.
A3 protocol tests run offline; provider activation does not block email posting.
Each implementation increment has a small reviewed commit; no new website,
mobile UI or provider quota is needed for the initial fixture loop.

## Migration and activation boundaries

Alex, Blair and the global imported-AI demo actor are not verified real owners.
Keep their posts as legacy owner-local fixtures. Do not assign them to the first
signup, match them to an email, trigger notifications for them, or publish them
remotely. Any explicit claim/import requires an exact, reviewed ownership map.
Existing `local-public` visibility is not consent for Internet publication.

Before **real-account activation**, review the concrete auth/storage/session/
identity fields, retention, recovery and rights route. Before **real email**, approve
the provider, address/domain, transmitted fields, delivery purpose and budget.
Before **ChatGPT identity activation**, confirm the permitted registration and
identity-only scopes; AI quota access stays a distinct choice. Before **hosting,
inviting others or store release**, retain the existing deployment/privacy/
moderation/rights/budget gates. No activation is performed by writing this plan.

Apply the relevant [ADR-012 lifecycle](../decisions/ADR-012-local-identity-publication-moderation-lifecycle.md)
and current later provenance/withdrawal decisions; do not restart Phase 0 or the
completed six-pair review. Shared private discussions, full-thread AI context,
marketing email, IP geolocation, crawler growth and account reputation remain
separate work. Ordinary implementation choices do not need another questionnaire.
