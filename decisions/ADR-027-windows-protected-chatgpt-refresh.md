# ADR-027: Windows-protected local ChatGPT refresh credential

Date: 2026-10-02. Status: implemented locally; owner-account restart check pending.

The owner explicitly approved protected sign-in persistence across local-service
restarts. This supersedes only ADR-024's RAM-only **refresh-token** rule. The
local service still keeps access and ID tokens in process memory and does not
put credentials in the extension, SQLite discussion state, Git or diagnostics.
The extension-to-service pairing token remains session-only and changes when
the service restarts; this decision does not make pairing durable.

On Windows, the service stores one rotating refresh token plus the binding
client ID and account subject in a CurrentUser DPAPI-encrypted file under
`LOCALAPPDATA/UniversalDiscussionLayer`. Its filename is scoped by a digest of
the installation's stable opaque host ID. A fixed PowerShell helper receives
the record on stdin; neither token nor file path is a command argument or log.
The write uses a temporary encrypted file and replacement; a failed secure
write falls back to RAM-only for that sign-in. If secure storage is unavailable
or the OS is not Windows, the earlier RAM-only behavior remains. A user or
malware with access to the same signed-in Windows account can potentially
recover the protected credential; DPAPI is not a multi-user security boundary.

After the fixed loopback listener owns its port, service startup reads the
credential, checks its client/subject binding against the existing non-secret
registration, exchanges the refresh token once, verifies returned identity
when present, and saves the rotated token before reporting connected. A
transient provider failure leaves the credential for a later explicit sign-in;
an unusable token or identity mismatch clears it. Disconnect clears the local
encrypted record and attempts provider revocation; provider revocation may
fail, which is reported as unconfirmed. Process exit only clears RAM. No
automatic inference, retry of a failed insight, new provider, private-page
scope or publication follows.

Synthetic connection and real Windows DPAPI tests pass. The owner has not yet
confirmed a live account survives a service restart. Other OS credential
stores and cross-device sync are future decisions, not implied approvals.
