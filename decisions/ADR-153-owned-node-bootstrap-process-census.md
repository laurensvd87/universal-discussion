# ADR153 Owned Node bootstrap process census

Date: 2026-10-20. Status: implemented and independently source-reviewed. Root
authorizes one exclusive metadata preparation. The actual201-file freeze must
pass separate root and Trust audits before one diagnostic execution is authorized.

ADR151 stopped before staging because its owned Job contained two processes
before the first variant marker. Neither process image evidence nor the second
PID was retained. Keep its195 sources, freeze and output immutable. Do not retry
it, guess a helper or remove the unexplained-descendant failure condition.

Add a separate minimal `native-bootstrap-process-dev-v1` diagnostic. It starts
only the fixed installed Node executable in its own Windows Job, with the same
scrubbed environment, hidden CREATE_NO_WINDOW launch, redirected pipes,256MiB
Node heap and1536MiB Job limit. Before the exact guardian handshake, the Node
entry point may only initialize inert CODE imports. After the handshake it
checks the frozen195 CODE/package/fixed-metadata inventory and reports a finite
inventory-complete marker, then exits normally. No Playwright import, browser,
staging, hostname lookup, content reader, model, application or database operation.

Keep the same Node-only failure predicate. At the first unexpected membership,
retain at most eight freshly enumerated same-Job member records before cleanup:
PID, actual creation FILETIME, bounded image basename, SHA256 of normalized image
path, confirmed-own-Job flag and finite inspection status. Inspect only actual
Job member handles; check IsProcessInJob on that handle and fresh membership
before accepting identity. A disappearing member is recorded as gone only if a
fresh same-Job list proves absence. Never look up a cleaned-up PID afterward.
Select and pin the exact installed Node path once before Popen; compare its
actual opened image to that selection, not a later PATH lookup or basename.
Preserve creation FILETIME exactly as a decimal or hexadecimal string, never a
JavaScript number. Bound native image buffers and basenames before projection;
use a fixed versioned lexical Windows path normalization for path hashing, without
opening those image files. Overflow or failed inspection is fatal, never silent
truncation. Bind each record to its opened handle, PID and creation time.
Do not read arbitrary executable bytes, command lines, environments,
global process lists, profiles, caches or credentials. Inspection errors remain
errors, never permission to ignore a process. Metadata is diagnostic, not a
verified helper whitelist or parent/child ancestry claim.

Use only fixed CODE paths and the two old freeze metadata identities, never paths
followed from their JSON. Bound the new source closure and pin it before a single
separately approved execution. Default entry points remain inert. Output is a
new exclusive directory, retained on failure, with a finite started marker,
bounded logs and one final metadata receipt. At most64KiB evidence/logs per file,
256KiB total,32 retained member rows,40-second wall/30-second active limit,
1GiB physical/commit reserve and C768MiB/D512MiB reserves. Sampling and cleanup
must not become unbounded. Terminate only this Job or its exact original Popen
child. Final Job drain and emergency termination are reported truthfully.

Root and Trust review implementation and pure injected tests before preparation;
audit the actual frozen source inventory before separately approving one run.
The new diagnostic cannot change the closed151 outcome, approve a browser study,
relax Node-only rules or validate hierarchical semantic quality. Existing crawler
and application remain untouched. Root owns this decision; matcher owns the
four new files `{node.mjs,run.py,test.mjs,README.md}` under the new namespace.

The Windows APIs expose image names, process creation times and membership in a
specified Job; none alone establishes ancestry or a safe-helper exception.
References: [QueryFullProcessImageNameW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-queryfullprocessimagenamew),
[GetProcessTimes](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getprocesstimes),
[IsProcessInJob](https://learn.microsoft.com/en-us/windows/win32/api/jobapi/nf-jobapi-isprocessinjob)
and [process creation flags](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags).

## Source checks

Root and Trust each pass four guarded checks; the one expected subprocess skip
is covered by the identical extracted pure Python AST suite run separately.
Both inventory implementations authenticate the fixed old freeze and then the
fixed literal's hash before interpreting any declared path. Read-spy regressions
prove a drifted valid72-path literal cannot cause a forbidden read or package
walk. Default entry points are inert. The child imports built-ins only, so this
is intentionally not byte-identical ADR151 initialization and need not reproduce
that failure. A clean result would not explain it or establish a helper exception.
