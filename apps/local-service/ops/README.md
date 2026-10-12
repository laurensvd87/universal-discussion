# Online canonical recovery

From `apps/local-service`, with Node **24.16+** on the same Windows user profile:

```powershell
npm run backup:canonical
npm run backup:canonical -- --verify <canonical-backup-filename>
npm run backup:canonical -- --prune
```

The create command runs while the local service stays online. It takes a consistent
read-only snapshot in a Worker, then encrypts and verifies recovery in RAM. It
does not reconnect pairing, reset app sessions or make a provider request. No
plaintext database/key staging files are written. Recovery files live in the
Git-ignored `data/canonical-migration-backups/`, protected by Windows user-bound
DPAPI and strict ACLs. Keep that Windows profile: copying the file to another
computer/account is not independent disaster recovery.

Files expire after seven days. The normal service performs startup/hourly cleanup;
the manual prune command works without restarting it. Expired files cannot be
verified for recovery. Cleanup resumes when the service/PC runs; physical deletion
is not forensic erasure. Interrupted/corrupt recognized ciphertext is also cleaned
at its filename-bound expiry. No recurring backup creation is enabled.

Only canonical Topics/Sources/vectors/public contribution records are covered.
Account/private-chat databases, provider/pairing/account credentials and the
disposable Discover index are excluded. This is **not a complete app backup**.
The current RAM snapshot budget is 256 MiB, not a catalog storage ceiling; an
oversized or unsupported-protection backup fails without affecting the service.

The approved one-time normalized conversion is an offline operator action:

```powershell
# Stop the verified project service only for the already-approved cutover.
npm run migrate:canonical -- --verified-backup <canonical-backup-filename>
node src/cli.js --origin chrome-extension://<your-extension-id>
```

This claims the existing fixed port, verifies the exact latest recovery state
again inside the migration transaction and preserves every canonical record.
It never automatically migrates on ordinary startup or restores/reset data.
Do not rerun it on an already normalized database. Old binaries cannot read that
format. Actual recovery must be deliberate and must not silently discard later
writes or resurrect later-deleted content; an automatic restore command is not
implemented. See [ADR-099](../../../decisions/ADR-099-online-encrypted-canonical-backup-and-cutover.md).

Synthetic Windows encryption/availability check (no owner backup/provider use):

```powershell
npm run check:online-backup -- --check-live-service
```
