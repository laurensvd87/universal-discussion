# Blank-browser CDP compatibility probe v1

Default inert; prospective code only. Root/Trust review and explicit execution
approval are required before launching even this blank browser. This is **not**
a public-probe retry. Frozen `public-input-probe-v1` and its failed attempt,
profile, logs and receipts are untouched. No public navigation, extraction,
owner profile, extension, app/pairing, database, ingestion, model or provider.

The first public probe's generic failure did not identify a command or cause.
This separate diagnostic creates only `about:blank` and walks the same reviewed
Browser/Target/Network/ServiceWorker/Fetch/Page setup commands, adding bounded
`Browser.getVersion` metadata. Unsupported commands are observed, never removed,
retried or silently substituted.

## Inert checks and prospective mode

```text
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none spikes/topic-resolution/harness/public-input-probe-compat-v1/run.test.mjs
node --check spikes/topic-resolution/harness/public-input-probe-compat-v1/run.mjs
python -c "import ast,pathlib; ast.parse(pathlib.Path('spikes/topic-resolution/harness/public-input-probe-compat-v1/supervise.py').read_text())"
```

`node run.mjs` and `python supervise.py` report no action. The only prospective
active mode is `python supervise.py --run-compatibility-probe`, after separate
approval. Its fresh `output` directory, markers, profile and files must not
already exist. No automatic retry or deletion, including failure. Do not invoke
the Node active mode directly: it refuses without its own sentinel and exact
stdin Job-assignment handshake.

## Same reviewed isolation/resources

The supervisor is a mechanical copy of the reviewed first public probe's
Win32 Job and resource wrapper, with a new mode/sentinel/handshake/namespace and
only these two new source dependencies. It creates a hidden Node child, assigns
it to its unnamed Job **before** sending the handshake, and only then can Node
spawn fixed-installed Chrome. Descendants inherit the Job with no breakaway;
kill-on-close and a 1536 MiB job commit limit remain enabled. No name-based kill,
existing browser attachment or unsafe debugging port. Fresh D: profile and TEMP,
no inherited owner profile/provider/app/credential environment, no extensions,
no sandbox/security bypass. Same Chrome background-network suppression flags;
these do not prove complete Chrome/OS egress isolation.

Every 50 ms: bounded <=128 Job PID list, handle-based `IsProcessInJob` before
memory inspection, summed RSS/private <=1536 MiB, host available physical and
commit >=1 GiB, C: free >=768 MiB, D: free >=512 MiB, wall <=180 seconds.
Shared-page RSS double counting is conservative. Unverifiable memory/exit races
fail closed. Logs plus result <=256 KiB, result <=192 KiB; profile/cache growth
is guarded by the D: reserve, not the metadata cap. Small fixed receipts are
additional. Own Job termination then <=5-second empty-Job/own-Node-exit proof is
required; unconfirmed cleanup writes a failure receipt. Kill-on-close remains
the final safety boundary. No automatic cleanup of evidence/profile files.

Same anonymous CDP pipe, <=4 MiB buffered frame input, <=128 pending RPCs,
absolute 10-second RPC deadlines. Browser auto-attach pauses targets before
main target creation; non-main/worker targets are closed while paused. Main
session has service-worker bypass/cache-disable/block-WebSocket configuration;
all intercepted requests are denied, with no URL/header/response-body inspection
or continuation. No public `Page.navigate` or `Runtime.evaluate` command exists
in the method allowlist. Three unchanged empty permission overrides configure
the known HTTPS origins but do not navigate to them. Downloads and permissions
remain denied; dialogs dismissed.

## Bounded observable results

The fixed-stage transcript records only allowlisted stage/method names, status
and integer CDP error code. Protocol error text, parameters, headers, URLs,
payloads and stacks are never persisted. Browser version projection keeps only
bounded numeric Chrome major and `protocolVersion`; no UA, revision, JS version
or full browser build identity. At most 64 stages. An initial rejection ends
the setup sequence; no guard fallback is applied. Browser-close attempts are
also recorded. No snapshots, DOM, page text, embeddings or raw CDP packets.

A reviewed-command CDP rejection yields `compatible:false` and Node exit 0 only
after callbacks settle, browser shutdown is attempted and final source hashes
match. The supervisor independently verifies source/result linkage and clean
Job-tree exit before reporting successful diagnostic completion. Exit 0 with
`compatible:false` means the diagnostic safely measured incompatibility, not
that the original public probe succeeded. A non-protocol/validation failure is
nonzero, with only a fixed last-stage label and safe failure category in stderr;
the supervisor records failure. If the pipe closes before Browser.close ACK, a
previous concrete protocol rejection may still be retained, but never a
`compatible:true` result; the Job cleanup proof is still required.

Result `output/result.json` is exclusive and byte-hashed; stdout prints only a
bounded summary plus supervisor receipt. Both Node and supervisor recheck the
new runner/supervisor source hashes before completion. These are ordinary
source-drift checks, not adversarial loaded-module/browser attestation. No
reader or old probe source is modified/imported, and no original evidence is
spliced into this new attempt.

Passing pure fixtures does not exercise Windows Job APIs, Chrome/CDP or prove
any live compatibility. Results never establish hierarchy quality, historical
Source identity, native browser authority or permission to run a public retry.
