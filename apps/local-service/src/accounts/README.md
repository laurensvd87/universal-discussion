# Owner-local discussion accounts

[ADR-091](../../../../decisions/ADR-091-connected-chatgpt-local-accounts.md)
activates the normal CLI/panel integration after the owner's precise local
approval. [ADR-090](../../../../decisions/ADR-090-isolated-account-foundation.md)
records the earlier synthetic foundation. Real mail and hosting remain deferred.

## Try the normal app

Start the updated local service and reload extension **0.13.47**. In the top bar,
click **Sign in**, reuse the connected ChatGPT account and choose a username.
If disconnected, connect ChatGPT through the existing provider flow first.
Reading needs device pairing but no app login. Login never posts automatically;
new human and AI contributions belong to your opaque account ID. Legacy
Alex/Blair posts remain unclaimed.

The profile sheet supports sign-out, own-data download and two-stage account
deletion. App credentials survive panel closure in this Chrome session only.
Chrome restart requires deliberate app sign-in; reusing an already-restored
ChatGPT connection makes no new identity request. Provider disconnection and
app logout are separate. Account deletion does not revoke the provider grant.

**Email sign-in coming soon** is intentional. Code login and reply notification
policy are implemented/tested with reserved `.test` addresses and a fake sink;
normal service email and notification capabilities are disabled. No real message
is sent, and no email-provider credential is needed now.

## Modules and storage

- `account-repository.js`: exact `discussion-accounts-v2` SQLite and strict
  schema/integrity validation, including full validation before v1 migration.
  It refuses `demo.sqlite`; normal accounts use ignored `data/accounts.sqlite`.
- `account-service.js`: trusted issuer/client/subject account reuse, unique
  username, server principal resolution and rotating/revocable sessions. Never
  links by email or treats an actor ID as a credential. Fixture email codes are
  nonce-bound, single-use and rate-limited; normal mail adapter is absent.
- `protected-account-key.js`: separate HMAC key in ignored
  `data/account-key.protected`, Windows DPAPI CurrentUser / POSIX owner-only file.
  It is not an OAuth token; protected-store errors do not expose input.
- `account-routes.js`: fixed paired/exact-Origin endpoints. Account tokens stay
  in headers, not URLs. Host/device validation precedes account processing.
- `account-principal.js`: account UUID owner IDs and ordinary write allowlist.
  First deliberate own write advances the unchanged canonical table to v3;
  login/startup does not rewrite or claim legacy posts. Old binaries that cannot
  read v3 are not a rollback path; never downgrade/discard state.
- `account-lifecycle.js`: bounded own-only export and staged deletion/recovery.
  Authentication is disabled first; account jobs are cancelled, own human/AI
  bodies/revisions withdrawn in one canonical transaction, private identity/name
  erased last. Other users' replies remain. Startup resumes interrupted erasure
  before handling account requests; the two databases are not atomic together.
- Browser `core/account-*`, `chromium/account-panel.js`/`account-sheet.*`:
  injected transport, English language pack, credential-free render state,
  stale-result fencing and accessible compact layout. Credentials use trusted
  Chrome `storage.session` RAM, bound to pairing, never `storage.local`.
- `reply-notifications.js`: fake outbox/worker, canonical recipient/provenance
  policy, coalescing, bounded certified-non-delivery retries and signed off-only
  unsubscribe. Fixture transaction callback is not canonical post integration;
  no worker or real delivery is enabled by normal startup.

## Paired account API

All routes require exact configured extension Origin and device pairing.
`X-Account-Session` is required where marked. Public DTO is
`{id, username, state, replyEmail}`; identity/contact metadata appears only in the
authenticated own-data export. Browser reads use POST `{}` because privileged
Chrome GET requests can omit Origin. Exact-Origin GET compatibility for
capabilities/me remains; the origin check is not weakened.

| Method/path | JSON fields | Session? |
| --- | --- | --- |
| POST `/v1/account/capabilities` | Empty object | No |
| POST `/v1/account/chatgpt` | Empty object | Optional; prevents silent switch |
| POST `/v1/account/email/request` | `email`, `clientNonce` | No; fixture only |
| POST `/v1/account/email/verify` | `challengeId`, `code`, `clientNonce` | No; fixture only |
| POST `/v1/account/me` | Empty object | Yes |
| POST `/v1/account/session/renew` | `refreshToken` | No |
| POST `/v1/account/username` | `username` | Yes |
| POST `/v1/account/preferences` | `enabled` | Yes; mail unavailable normally |
| POST `/v1/account/session/logout` | Empty object | Yes |
| POST `/v1/account/data` | `after` (null or returned cursor) | Yes |
| POST `/v1/account/delete` | `confirmation: "DELETE MY ACCOUNT"` | Yes |

Random 256-bit access/refresh credentials are retained server-side only as keyed
verifiers. Access lasts 15 minutes; renewal rotates both credentials and gives
a rolling 30-day refresh expiry. Browser restart drops credentials irrespective
of server expiry. Logout can revoke an exact retained expired access credential;
reads/writes cannot use it. Failed/offline logout clears local credentials but
cannot prove server revocation without a successful response.

Own-data export includes retained own post revisions, one bounded row per page,
with canonical version and metadata consistency checks. It is assembled/downloaded
locally, not sent to another provider. Deletion retains opaque tombstones and
necessary deleted ancestors, not login identities or body history. Logical
deletion does not forensically erase SQLite/free pages, backups or provider data.

## Executable checks

From `apps/local-service`:

```powershell
npm test
node harness/run-account-panel-qa.js
node harness/run-account-preview-qa.js
```

Chrome harnesses use disposable profiles/anonymous CDP pipes, intercepted fixed
local HTTP requests through the actual in-process handler and synthetic SQLite/
provider adapters. They open no listener, touch no owner profile/data and make
no real mail or provider request. Native-panel screenshots are written to
`%TEMP%\udl-account-panel-review`; fixture screenshots to
`%TEMP%\udl-account-design-review`. Disposable profiles are removed.

Manual visual-only fixture:
`chrome-extension://<extension-id>/fixtures/accounts-preview.html`, reserved
`reader@example.test`, code `123456`. It is a mock, not proof of verification,
security or persistence, and does not post. The fixture Chrome harness uses a
real random code kept only in its private fake sink.

## Not a hosted account system yet

Identity linking, durable browser-restart app sessions, independent real email
delivery/domain/abuse protection, public Internet read DTOs, per-user hosted AI
grants, moderation and backups remain. Reply/outbox atomic integration,
unsubscribe HTTP endpoint and terminal outbox retention are not activated.
No exactly-once delivery or legal/store-release claim. Provider, deployment,
spending, publication and mail gates remain separate.
