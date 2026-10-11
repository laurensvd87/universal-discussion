# ADR-091: Connected ChatGPT identity and owner-local discussion accounts

Date: 2026-10-11.
Status: owner explicitly approves local activation; implementation and offline
Trust review complete. Normal-surface Chrome QA and service activation evidence
are recorded in STATUS. Supersedes ADR-090's dormant normal composition only.

## Owner request and exact approval

Reuse the already-connected ChatGPT identity for a discussion account and a
chosen username. Prepare independent email/code login, but defer actual mail
until domain/hosting is available. The owner separately approves retaining the
verified provider/client/subject namespace and username in a separate local
account database until account deletion; account-owned new human/AI posts;
unclaimed legacy actors; Chrome-session-only app credentials; paired guest
reading; no additional identity request, mail, hosting or publication.

## Identity and authority

Use the existing connection's server-side verified tuple
`(https://auth.openai.com, issued clientId, subject)`, never its email/label or
a caller-supplied identity. Initial sign-in retains signed-token validation.
Restart restoration requires the protected refresh-store binding and successful
provider refresh, including verification of any returned ID token. Editable
registration JSON alone is not identity proof. This reuses the approved local
connection; it does not introduce an identity-only OAuth flow or hosted service.
The established verified namespace remains readable across access expiry only
for a refreshable plan grant, allowing deliberate inference to reach ordinary
refresh. The getter never performs network I/O. A refused/contradictory refreshed
identity clears active/protected binding; a temporary provider failure does not
silently change identity. Expired no-refresh identity remains unavailable.
See [OpenAI local sign-in documentation](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
and [website identity scope](https://developers.openai.com/siwc/website).

App login is deliberate and issues independent opaque rotating sessions. A
matching email never links accounts; a different namespace cannot silently
switch or claim an existing account. Usernames are public presentation, not
authority. Pending-username accounts cannot post. The paired handler derives
the principal from `X-Account-Session`; actor IDs and `X-Demo-Actor` are not
credentials. Guest reading still requires local device pairing and exact Origin
where credentials are handled; no anonymous Internet API is introduced.
Privileged Chrome GET can omit Origin. Capability/me and account-owned resumable
job reads therefore use strict POST `{}` equivalents, not an Origin exception;
catalog/discussion reads remain paired guests without an account header.

Existing single-owner ChatGPT inference remains separate. Generation/sharing
requires the app account to match the current provider namespace, plus all
existing canonical Source/Topic/target/context/proof and one-shot checks.
Disconnecting ChatGPT does not transfer posts or sign out the app account;
account deletion does not revoke the separate provider grant. Account changes
invalidate targets and detach unsent text rather than silently reposting it.

## Storage and migration

`data/accounts.sqlite` uses strict `discussion-accounts-v2` SQLite and exact
schema validation, including complete validation before the fixture-v1
migration. It never accepts `demo.sqlite`. A separate HMAC key in ignored
`data/account-key.protected` is protected with Windows DPAPI CurrentUser;
POSIX uses owner-only permissions. No provider/app bearer token is stored in
the account SQLite, rendered snapshots, logs or Git.

Chrome `storage.session`, restricted to trusted contexts and bound to current
pairing, holds app credentials in browser-session RAM. Closing/reopening the
panel retains login; Chrome restart ends it. Fifteen-minute access expiry is
renewed silently, without publishing a transient account change; real logout,
failed rotation and account changes remain invalidating. No durable app login
across browser restarts is approved here.
Fixed-origin Web Locks serialize short credential-storage operations, not
network calls. A shared logout fence prevents another panel's late login/renewal
response from restoring a revoked session; unused returned sessions are revoked.
Remaining local UX limitation: another panel's renewal can temporarily detach
that peer's unsent draft; single-panel renewal stays stable. This is not a
logout-reauthentication exception.

The existing strict canonical state reader gains `demo-state/v3`, permitting
opaque real-account owner IDs. Startup/login/name selection do not rewrite the
owner's v2 state or assign Alex/Blair ownership. The first deliberate account
write advances to v3 while preserving existing root lineage and contributions.
AI contributions remain agent-authored with the invoking account as operator.
Ordinary account writes cannot reset/administer/remap topics. Rollback means a
v3-compatible binary with account writes disabled, **not** a pre-v3 binary,
downgrading state or discarding posts.

## Account rights and recovery

The profile sheet can export own identity/contact metadata and all own retained
post revisions through bounded, version-checked pages; no other user's posts,
page text, vectors or global catalog are included. An explicit two-stage account
deletion disables sessions first, cancels that account's jobs, withdraws all own
human/AI bodies and revisions in one canonical successor, then purges private
identity/contact/name records. Other users' replies survive under deleted
ancestors. UUID tombstones preserve lineage; later sign-in creates a new account
and cannot reclaim deleted contributions.

These are two separate databases, not a distributed atomic transaction. A
deleting marker denies authentication; startup finishes interrupted erasure
before accepting account operations. Deletion is logical, not forensic SQLite
erasure or a promise to erase external backups/provider records. This implements
local product rights, not legal/store certification.

## Deferred boundaries

Normal email-code and reply-mail capabilities are **off**. Fixture `.test`
code login and fake outbox remain executable tests, not real delivery. Actual
mail needs provider/domain/security approval, abuse controls and canonical
reply/outbox transaction integration. Identity linking, durable app sessions,
per-user hosted AI grants, moderation, Internet guest projections, deployment
and publication remain separate work and gates. No new Chrome permission,
page-data collection, inference request or live mail test follows from this ADR.

## Verification

Executable coverage includes identity namespace/restart binding, strict account
schema/migration, fixture code replay/rate limits, session races/rotation,
server-derived post authority, own-only export and staged deletion recovery,
legacy non-claimability, v3 restart and disabled-account rollback, protected key
corruption/races/content-free errors, cross-panel RAM storage, API auth failure
classification and compact accessible panel interactions. Independent Trust and
normal-surface browser evidence are kept in STATUS, without private material.
