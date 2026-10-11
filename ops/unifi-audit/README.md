# Local UniFi firewall export

Export selected network and firewall settings for the private backend host
review, without a full UniFi backup or credentials in the downloaded file.
The browser tool targets **UniFi Network 10.6.106**. It does not change router
settings or activate the portable backend.

## Export in Chrome

1. Open your UDR through its **local HTTPS IP address** and sign in normally.
   Do not use `unifi.ui.com` or the Linux computer's address. In **UniFi Network
   > Integrations**, create a temporary local Network API key. Use read-only
   permissions if your interface offers them. Keep the key on your computer;
   do not paste it into this chat.
2. In PowerShell at the repository root, copy the checked exporter into your
   clipboard:

   ```powershell
   Get-Content .\ops\unifi-audit\export-browser.js -Raw | Set-Clipboard
   ```

3. Return to the local UDR tab, open DevTools with **Ctrl+Shift+J**, select
   **top** in the Console's JavaScript context selector, paste the script into
   **Console**, and execute it. A dialog titled **Export UniFi firewall settings**
   opens, with a fixed **[UDL UniFi export] Dialog ready** message in Console.
   Only run the repository script you inspected; do not paste third-party scripts
   into a signed-in router session.
   Chrome may initially block console pasting with its self-XSS warning.
4. Enter the temporary API key into the tool's password field and start the
   export. If several sites exist, select the numbered site. The file
   **`udl-unifi-audit-YYYY-MM-DD.json`** downloads through Chrome. Review it,
   then upload only that file here. Close the export dialog and revoke the
   temporary key under Integrations when finished.

Do not upload DevTools HAR files, a console dump, a full backup or a support
archive instead: those are not filtered by this exporter.

The key stays in the browser execution; it is not sent to this app, its backend,
Git or an external service. The tool performs only bounded same-origin GETs to
the documented local integration API. It does not read the browser's cookies,
store the key or save raw API responses. Error output contains fixed diagnostic
codes, not provider response bodies. JavaScript cannot promise forensic erasure
of a string from browser memory.

An untrusted certificate must be resolved through your normal trusted router
access; the tool does not disable certificate verification or follow redirects.
It refuses HTTP, cloud/public-address origins and a different Network version.
Do not update the router solely to run this exporter.

## If the dialog does not open

Copy the current script again rather than reusing an old clipboard copy. Reload
the UDR tab to discard previous attempts, wait for it to load, and select **top**
in Console before running the script. Enable the **Info** log level to see the
ready message. If DevTools is paused at a breakpoint, resume it first.

Exporter startup messages have the fixed prefix **[UDL UniFi export]**. A missing
page document or a failed dialog startup gives a fixed hint, without echoing an
exception, URL, key or API response. Messages such as `Missing queryFn` and
`Unchecked runtime.lastError` are not exporter diagnostics. Report only the
prefixed message, whether the dialog appeared, or its `Export failed (...)`
status; do not upload the page's entire Console log.

The previous bootstrap could mistake a browser page's `module.exports` for a
Node import, silently skip the dialog and overwrite that page object. Synthetic
reproduction confirms this bug, not that it caused the owner's UDR symptom.
Browser startup now takes priority without touching a page-owned module; Node
tests still import the collector without opening a dialog or making requests.

## What the file contains

The export preserves validated private address ranges, VLAN IDs, zone membership,
network isolation/internet flags, enabled policies, source/destination criteria,
ports, negation, IP/protocol and connection-state filters, system-defined policy
origin, and available user-defined policy ordering. Network details are read
separately because the overview does not include address configuration.

Free-text names and descriptions are removed. Resource identifiers become
consistent aliases; only recognized system-zone names retain their fixed role.
Passwords, API/session keys, cookies, account details, SSIDs, MAC addresses,
device serials, client lists and traffic history are excluded. Public addresses
are masked. Unsupported or invalid criteria are marked incomplete instead of
being presented as unrestricted traffic.

Policies with missing, malformed or duplicate IDs can retain typed rule fields
after every page has been read consistently. They have `id: "UNKNOWN"`,
`semanticStatus: "INCOMPLETE"` and a fixed `identityStatus`; every occurrence of
a duplicate is marked, including the first. Non-object rows are omitted.
`auditRow` is a one-based row locator, not a rule identity or execution order.
`coverage.policies.diagnostics` contains only numeric counts of accepted pages,
rows read, omitted rows, missing IDs, invalid ID types/formats and duplicate-ID
rows. It contains no raw rejected value.

Any omitted row or identity defect produces `policy-identity-invalid` and partial
coverage (or an error if no policy objects remain). Ordering is unavailable in
that case. Inconsistent pagination, request failures and exceeded budgets still
discard the policy inventory; earlier pages are not presented as a complete
export. **Upload the new file even if the dialog says Partial export**: these
diagnostics and incomplete rules can help the next review, but cannot establish
effective firewall ordering or isolation.

**Private IP addresses and network relationships remain in the file.** It is a
minimized private audit artifact, not anonymous data suitable for publication.
Export files are Git-ignored; do not commit or publish them.

## Audit limits

The official API does not expose port-forwarding/NAT rules or UPnP settings in
this version. Those, switch/ACL and DNS configuration, live reachability and the
Linux host's services/firewall remain separate checks. Network outbound NAT
fields are not a complete NAT-rule inventory. No export can certify isolation
or safe Internet exposure on its own.

GET collection is not an atomic router snapshot. The tool detects inconsistent
pagination and enforces byte, record, timeout and request limits, but settings
can still change between resource reads. Keep router configuration unchanged
while collecting. Missing endpoints, unknown selectors or exceeded limits
must remain visible in the downloaded coverage report.

Limits are 2 MiB per response, 10 seconds per request, 180 GET requests and 5,000
list records across the whole collection, at most 50 network detail reads and
64 directional policy-order reads. The normal owner configuration is expected
to fit these bounds; an exceeded limit produces explicit missing coverage.
`collectionStatus` describes completion of the requested reads, not a complete
security audit. `auditStatus` remains `INCOMPLETE`. MAC/domain/application
selectors, schedule details and ICMP subtypes are omitted and marked incomplete.

## Offline checks

From the repository root:

```powershell
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none ops/unifi-audit/test/*.test.cjs
```

All test data are synthetic. This command denies real network, DNS, listeners
and subprocesses. Actual collection from the owner's UDR requires the owner to
run the export; no agent router login or rule change follows.

**70 offline tests pass**, including 12 startup regressions, 21 policy-recovery
checks and 25 independent Trust checks across the suite. Isolated real
Chrome QA passes with strict CSP, 14 intercepted synthetic API requests, a
synthetic session cookie/API key, site selection and both normal and partial
sanitized downloads. Recovery checks verify numeric-only diagnostics, duplicate
first-occurrence marking and suppression of unverified ordering. No cookie
accompanies the API requests; error/cancel paths clear the password field and
remove the dialog without persistent storage. A page-owned module and a throwing
module getter cannot prevent startup or be overwritten. Startup makes no API
request and emits only the fixed ready message. No runtime errors occur. The
synthetic profile/download is removed after QA. To repeat this separate browser
check without a router or server listener:

```powershell
node ops/unifi-audit/integration/chrome-check.mjs
```

Chrome must already be installed. `CHROME_PATH` may select its executable; the
test uses a fresh profile, not the owner's profile. The review screenshot is
retained under `%TEMP%\udl-unifi-audit-review` and contains synthetic UI only.

## Official references

The [UniFi API guide](https://help.ui.com/hc/en-us/articles/30076656117655-Getting-Started-with-the-Official-UniFi-API)
locates version-specific documentation under Network > Integrations.
The [10.6.106 OpenAPI schema](https://developer.ui.com/network/v10.6.106/openapi.json)
defines the local console API, pagination, selectors and ordering.
The [zone firewall guide](https://help.ui.com/hc/en-us/articles/115003173168-Zone-Based-Firewalls-in-UniFi)
explains directional zone rules and built-in policies.
The [Chrome Console reference](https://developer.chrome.com/docs/devtools/console/reference)
describes the JavaScript context selector and log-level filters.
