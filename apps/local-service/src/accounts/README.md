# Isolated account and reply-mail foundation

Implemented under [ADR-090](../../../../decisions/ADR-090-isolated-account-foundation.md),
not activated in CLI/startup or the normal discussion panel. Synthetic accounts
only; there is no SMTP, provider identity request, Internet API or owner-store
migration. The existing demo actor/AI connection is not converted into a user.

## Modules and boundaries

- `account-repository.js`: strict isolated SQLite schema, synchronous nested
  transactions, restart validation and foreign keys. It refuses the existing
  `demo.sqlite`; do not pass the owner's database filename to this repository.
- `account-service.js`: reserved `.test` email-code login, unique ASCII username,
  public/private account separation and rotating/revocable sessions. Supply an
  independent 32-byte-or-longer HMAC key and a synchronous fake mail sink.
- `account-routes.js`: optional routes injected into the existing handler after
  mandatory Host/Origin/device-pairing checks. Account authority is separate from
  pairing and does not accept `X-Demo-Actor`.
- `reply-notifications.js`: authoritative direct-parent recipient policy, minimal
  transactional outbox, fake delivery, coalescing, leases and signed off-only
  unsubscribe. It requires trusted server contribution projections, not request
  bodies. The callback transaction has not been connected to demo post commands.
- Browser `core/account-client.js`, `core/account-controller.js` and
  `chromium/account-sheet.*`: injected bounded transport, credential-free rendered
  state, storage/epoch fencing, English language pack and accessible compact UI.
  No ordinary popup/panel/background code imports them yet.

## Optional paired API

All routes require the configured exact extension Origin and device pairing.
Routes marked session also require `X-Account-Session`; no credential is put in
a URL. Public account DTO: `{id, username, state, replyEmail}`. Private address,
code, nonce, hashes and session verifiers never appear in that DTO.

| Method/path | JSON fields | Session? |
| --- | --- | --- |
| POST `/v1/account/email/request` | `email`, `clientNonce` | No |
| POST `/v1/account/email/verify` | `challengeId`, `code`, `clientNonce` | No |
| GET `/v1/account/me` | None | Yes |
| POST `/v1/account/session/renew` | `refreshToken` | No |
| POST `/v1/account/username` | `username` | Yes |
| POST `/v1/account/preferences` | `enabled` (reply email) | Yes |
| POST `/v1/account/session/logout` | Empty object | Yes |

The server issues independent random 256-bit access/refresh tokens and retains
only keyed verifiers. Access expires in 15 minutes; refresh has a rolling 30-day
lifetime, not an absolute session lifetime. Rotation invalidates both previous
credentials atomically. Logout may revoke an exact retained access credential
after access expiry; it is idempotent after revocation. Reads/changes still reject
expired credentials. Authentication never creates post authority implicitly:
the canonical account principal bridge and username prerequisite remain to build.

Codes are six random digits, nonce-bound, valid ten minutes and limited to five
attempts. Resend waits 60 seconds; request caps are three/address/hour and
30/hour globally, persisted under HMAC-derived keys. Responses do not reveal
account existence. Private pending email addresses expire with their challenge;
`cleanupExpired()` removes challenges after a 24-hour grace, expired/revoked
sessions and old rate buckets. Call it explicitly; no background timer is installed.
These fixture limits are not a distributed anti-abuse design.

Browser credentials are outside render snapshots and pass only through the
injected storage adapter. The preview uses RAM, not durable browser storage.
Cancelled rotation discards/revokes fresh credentials and may require sign-in
again. Even same-tick renewal/logout retains an old-credential revocation receipt;
late responses cannot reconnect or restore saved credentials after logout.
Revocation calls are best-effort if the service is unavailable; the local client
clears its credentials but cannot prove server revocation without a response.

## Tests and interaction preview

From `apps/local-service`:

```powershell
npm test
node harness/run-account-preview-qa.js
```

The second command requires installed Chrome (override executable with
`CHROME_PATH`). It launches a disposable profile over anonymous CDP pipes,
intercepts account HTTP requests and answers them using the real in-process
handler and in-memory SQLite. It opens no listener and uses no real user/mail,
provider or owner Chrome profile. Screenshots of synthetic UI are written to
`%TEMP%\udl-account-design-review`; the disposable profile is removed.

For a manual **visual/interaction-only mock**, open
`chrome-extension://<extension-id>/fixtures/accounts-preview.html`. Use a reserved
address such as `reader@example.test` and code `123456`. This mock does not test
verification/security/persistence and does not post. The automated harness above
uses a real random code retained only in its private fake-mail sink.

## Not activated / required before real use

Canonical post ownership and AI invoking-account provenance, public read
projections, owner-store migration, rights/export/deletion/recovery, protected
browser credential persistence, identity-only ChatGPT eligibility/linking,
real email adapter/domain/budget and unsubscribe endpoint remain open.
Terminal outbox deduplication rows currently remain; retention cleanup needs a
policy before activation. Ambiguous delivery consumes caps and is not retried
automatically; only certified non-delivery gets bounded backoff. No exactly-once
mail claim. Account/provider/hosting/store gates remain separate.
