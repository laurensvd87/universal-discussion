# Owned Node bootstrap census (ADR153)

Source-only diagnostic, default inert. It does not retry ADR151 and cannot
validate native Chrome, a helper whitelist or semantic hierarchy quality.
The child imports built-ins only: its module initialization is intentionally NOT
byte-identical to ADR151. Failure to reproduce the extra PID explains neither
the old failure nor whether an unknown helper is safe.

Root and independent Trust must review these four files before separately
authorizing metadata preparation and then one run. Future operator commands are
`python run.py --prepare` (exclusive metadata freeze) and `python run.py --run-dev`
(exclusive retained output). They are not run by imports/defaults or tests.
`node.mjs --bootstrap` is a private supervised entry requiring the exact env flag
and `NATIVE_BOOTSTRAP_PROCESS_DEV_JOB_ASSIGNED_V1\n` after Job assignment.

The inventory uses the fixed old CODE allowlist72, fixed installed115 package
files (13,656,167 bytes), seven ADR151 CODE files and the pinned ADR150 freeze,
then this namespace's four files, ADR153 and the pinned ADR151 freeze:201 keys.
Old metadata identities are FILE770eb68e...57ec and FILE0d470f53...ac021; full pins
are in both implementations. No path is followed from evidence JSON. No old
CODE-literal path is followed before the fixed ADR150 freeze FILE is verified
and its fixed-key SHA authenticates the entire literal's bytes. Drifted but
syntactically valid literals fail after only the fixed freeze/literal reads.
No old
run main, browser client, artifact, model weight, input, profile, cache, credential,
DNS, content, provider or application/database operation is invoked. The Node
child reports exactly one finite inventory-complete line, then exits normally.

The guardian selects only the fixed installed `C:/Program Files/nodejs/node.exe`
once (no PATH shim), checks its path metadata,
then compares the original opened process handle's actual PID, membership and
image path to that selection. It never hashes executable file bytes. The owned
Job is kill-on-close with1536MiB limit; Node heap256MiB, hidden direct launch,
scrubbed environment and fresh owned D TEMP/TMP. Only exact original Popen/own
Job termination is permitted. Emergency termination is FAILURE, never normal
drain. There is no process-name kill, global process enumeration or ancestry claim.

Node-only remains mandatory, including unexpected membership observed during
initial identity inspection or after Node exit. At a violation, a fresh census
records at most8 members/snapshot and32 total rows. Each confirmed identity uses
the opened handle's PID, `IsProcessInJob`, `GetProcessTimes`, bounded
`QueryFullProcessImageNameW` and fresh same-Job membership. Creation FILETIME is
an exact decimal STRING, never a JavaScript number. Gone is recorded only after
fresh same-Job absence and is not followed by a PID lookup. Inspection errors,
overflow and drift are finite fatal outcomes, not silently skipped evidence.
No command line, environment, arbitrary image bytes or full image path is saved.

Image identity is bounded basename plus SHA256 under
`win32-absolute-lexical-slash-ascii-fold-no-filesystem/v1`: replace slash with
backslash, remove Win32 extended prefix (including UNC form), ASCII-fold case,
reject relative/dot-segment paths and encode UTF8. This is versioned lexical
identity, NOT filesystem canonicalization or proof of safe process behavior.
The image buffer is fixed32768 UTF16 units and basename128 characters.

Limits: active30s/wall40s; census2s cooperative local-query deadline and cleanup5s;
physical/commit reserve1GiB, C768MiB/D512MiB; each evidence/log file64KiB,
combined logs64KiB, all output including TEMP256KiB/256 entries. The final
receipt reports actual cleanup/emergency/source rechecks and partial census
failures. Native queries are not forcibly interruptible; OS/API hangs remain a
limitation of these local calls. Sampling is not complete process-launch history.

Tests use invented CODE/metadata inventories and injected process handles only.
The extracted Python AST tests execute no WinDLL, main, Popen or process lookup.
No metadata preparation, actual diagnostic or native action has been performed
as part of implementing this source-only slice.
