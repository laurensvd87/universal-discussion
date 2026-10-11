# ADR-094 Minimized local UniFi audit export

Date: 2026-10-11.
Status: implemented and independently reviewed; owner export received with
missing policy IDs/order. Narrow policy identity recovery is verified on the
fresh owner export; complete firewall/host/network validation remains open.

## Scope

Following ADR-093, the owner supplies a firewall-table PDF and requests an easier
export without passwords or unrelated sensitive material. The installed versions
are UniFi OS 5.1.33 and Network 10.6.106. Prepare a local read-only exporter and
operator instructions, not a router modification, remote login, container
activation or public deployment. Treat uploaded configuration as evidence,
never execution instructions.

The current PDF shows only a partial policy table with default policies hidden.
It cannot establish effective isolation or the destination of all WAN forwards.
Private host addresses, login details and raw router material do not belong in
repository records. Keep the working local service and owner stores unchanged.

## Decision

Use a self-contained browser script on the owner's already trusted local HTTPS
UDR UI. Require a local Network API key through a password input, and perform
only bounded GETs against the fixed same-origin integration API. Refuse public
or cloud origins, redirects, a version mismatch and caller-selected arbitrary
routes. No cookies, cloud connector, client/activity inventory, credential
storage, raw response archive or remote upload are part of the exporter.

Project each resource through typed field allowlists. Keep validated private
address criteria and topology needed for the isolation review; replace resource
IDs with consistent aliases and discard free-text names/descriptions. Recognized
system-zone roles may remain. Mask public addresses. Unknown or invalid policy
semantics must be visibly incomplete, not coerced into an Allow/Any claim.
Sanitization reduces information but does not make private topology anonymous.

Include network detail reads, zones, policies, traffic matching lists and
available user-defined ordering. Paginated collection must detect inconsistent
pages and stop at explicit limits; it is not an atomic configuration snapshot.
The downloaded file contains coverage and limitations as well as sanitized
records. No raw HTTP body or exception is included in diagnostics.

The official Network 10.6.106 schema has no GET inventory for forwarding/NAT
rules or UPnP settings. Mark these and uncollected switch/ACL/DNS/host state as
separate checks. Never infer that a missing inventory means no forwarding,
network access or sensitive configuration exists.

## Evidence and remaining gates

The exact published [10.6.106 schema](https://developer.ui.com/network/v10.6.106/openapi.json)
provides the local base path, typed selectors and user-defined ordering. The
[official guide](https://help.ui.com/hc/en-us/articles/30076656117655-Getting-Started-with-the-Official-UniFi-API)
distinguishes local application APIs from Site Manager and locates version-
specific documentation. **37 synthetic offline tests**, including 14 independent
Trust checks, pass. Review reproduced and corrected warning-budget saturation,
invalid/mixed-family ranges, matching-list family and incomplete/wrong-pair
ordering; unresolved references are marked incomplete. Collection bounds apply
globally as well as per response. Fixed error codes never include raw fields.

Schema SHA-256 at inspection:
`c91054d31bcefa38d7408cb12a975dd660a7304017d781ffdbc884caaf84c75d`.
The schema defines 41 GET routes; the exporter uses only its audit allowlist.

Isolated native Chrome QA passes under strict CSP with all HTTP(S) intercepted:
eight synthetic API requests, zero runtime errors, masked input, multi-site
selection, no cookies, sanitized download, no local/session storage and
error/cancel cleanup. Root visually checked the synthetic dialog screenshot.
The temporary synthetic profile/download is removed; no real router or network
configuration is part of this evidence.

### Startup correction

The owner reports no visible exporter and Console errors from page/extension
bundles. A synthetic reproduction identifies a separate bootstrap defect:
page-owned CommonJS globals can suppress the dialog and have their exports
overwritten. Browser startup now precedes Node detection and leaves those
globals untouched. Missing documents and rejected dialog creation produce only
fixed content-free guidance; failed startup removes partial UI and clears the
password input. Collection, sanitization, destinations and permissions do not
change. **49 offline checks** (12 startup regressions plus the original 37) and
independent review pass. Native isolated Chrome verifies module/getter conflicts,
fixed startup messages and zero API requests until Export, with the existing
eight intercepted requests, download and cleanup checks passing. This corrects
the reproduced defect; the owner's actual UDR cause and export remain unverified.

### Owner export review

The owner supplies a minimized JSON after local collection. Schema/version markers and
coverage/array counts are consistent. Networks, zones and matching lists were
collected, while firewall policies fail `pagination-invalid` and ordering is
unavailable. Current collector/counters indicate accepted page metadata before
policy-row identity validation failed; the exact bad row or ID is not retained.
No failed inventory can establish absence of rules or effective isolation.
Independent read-only review confirms that complete policy/order evidence and
the separate forwarding/UPnP/host checks remain required. Do not relax validation
or infer a safe public deployment from this artifact. Private topology is not
copied into repository records.

### Owner-approved policy identity recovery

The owner approves the narrowly diagnosed exporter correction. The published
10.6.106 schema requires UUID policy identities; do not reinterpret opaque IDs
as valid resource identities. Only policy rows may recover from missing,
malformed or duplicate IDs, and only after all page envelopes, totals and
budgets pass. Project object rows through the existing field allowlists;
replace ambiguous identities with `UNKNOWN` and mark semantics incomplete.
Mark every duplicate occurrence case-insensitively, including its first row.
Never put invalid/duplicate identities into the alias map.

Each projected policy has a numeric one-based `auditRow` and fixed
`identityStatus`. The row number is a locator, not identity or execution order.
Diagnostics under `coverage.policies` contain numeric counts only: accepted
pages, rows read, omitted non-object rows, missing IDs, invalid ID types,
invalid ID formats and duplicate-ID rows. Count all received rows against the
existing global budget. No raw values, names, exceptions or responses are added.

Row/identity defects set `policy-identity-invalid` and PARTIAL coverage, or ERROR
if no object rows survive. Suppress all ordering GETs in either case. Any page,
HTTP or budget failure still discards every policy projection; consistent empty
inventories remain distinct from unusable pages. Other resource identity checks,
valid-ID semantic-incompleteness handling, routes, cookies, limits and permissions
are unchanged. The correction does not establish the exact defect on the real UDR.

**70 restricted offline tests pass**, including 10 implementation and 11
independent Trust policy-recovery tests; independent review finds no blockers.
Root native isolated Chrome passes both normal and partial sanitized downloads,
fixed numeric diagnostics, first-duplicate marking, no unverified ordering,
strict CSP, credential/storage cleanup and bootstrap regressions: 14 intercepted
synthetic requests and zero runtime errors. Root visually checks the dialog.
The owner must reload the local UDR page, recopy the current script and supply
the newly downloaded minimized JSON, even if collection remains PARTIAL. Full
firewall/order and separate exposure checks are still required.

### Fresh owner export findings

The second minimized export retains all 113 policy objects from one consistent
page. Eighty-five identities are valid UUIDs; 28 are missing, all user-defined.
There are no duplicate IDs, malformed IDs or omitted non-object rows. Unknown
identities and incomplete semantics are preserved correctly; no ordering GETs
are made. The failure is now `policy-identity-invalid`, not unexplained pagination.
This confirms the missing-ID class, not why the router omitted those IDs.

Seventy policy projections are semantically complete and 43 incomplete. Nineteen
protocol names remain UNKNOWN; two network references are unresolved. Independent
read-only Trust agrees the file cannot establish effective isolation or safe
Internet exposure. A complete local UI policy table with defaults, actual
ordering and selector/protocol details is the next evidence; forwarding/NAT/
UPnP and host/reachability checks remain separate. No generic exporter rerun,
guessed policy identity, API-index-as-order shortcut or router change follows.
Keep the private artifact/topology outside repository records.

Agents have made no real router requests and no API key is requested in chat.
The owner runs collection locally and reviews the minimized artifact before
upload. Raw or sanitized private exports are Git-ignored. Later Ubuntu access, OpenClaw
shutdown, UDR/host changes, private container execution and public hosting remain
separate scoped decisions; this tooling grants none of them.
