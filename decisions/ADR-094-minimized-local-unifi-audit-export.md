# ADR-094 Minimized local UniFi audit export

Date: 2026-10-11.
Status: implemented and independently reviewed for local export preparation;
owner router collection and host/network validation remain open.

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

No real router has been queried and no API key is requested in chat. The owner
runs collection locally and reviews the minimized artifact before upload. Raw
or sanitized private exports are Git-ignored. Later Ubuntu access, OpenClaw
shutdown, UDR/host changes, private container execution and public hosting remain
separate scoped decisions; this tooling grants none of them.
