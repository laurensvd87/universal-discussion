# ADR199 Native file read result compatibility

Date: 2026-10-24. Status: complete implementation SOURCE accepted by Root and
independent Trust. Root passes127 guarded JavaScript and31 actual pure Python
checks; Trust independently passes the same checks. Independent inventory
review accounts for48 CODE and164 complete inputs. The readiness-only marker
and final external pins still precede separate decisions for metadata
preparation and startup. Source acceptance alone grants neither actual mode.

## Reproduced incompatibility

ADR198's one startup attempt closed exit1 before READY, after one committed
bootstrap FS_BEFORE exchange. Its saved evidence passes Root and independent
audits: two hardlink pairs,2008 final JSON bytes,28 stderr bytes, all163 input
hashes unchanged, cleanup passed without emergency termination. The invocation
did not retain its exact failure predicate. Preserve its code, maps and output.

Separate read-only probes reproduce an incompatibility in Node v24.19.0:
FileHandle.read returns a null-prototype object with exactly bytesRead and
buffer own data fields. ADR198's boundedReadFile passes it to exact(), which
requires Object.prototype, and deterministically rejects with contract. Root
and the implementation owner both reproduce this against fixed CODE files,
close their handles and emit no file contents. This reproduction is not a
retained trace of the failed invocation. Evidence is recorded in
apps/local-service/data/owned-startup-diagnostic-adr198-startup-failure-20261024.json.

## Narrow correction

Create infrastructure-startup-diagnostic-v2 with the same six owned files:
protocol.json, source-paths.js, supervise.py, run.mjs, test.mjs and README.md.
Copy only the six consumed v1 sources into this new namespace, replacing their
own namespace identities without changing shared modules. The implementation
owner edits only these six new files; Root owns this ADR, maps and decisions.
Trust and inventory reviews are read-only. Both new actual entries start CLOSED.

Introduce a dedicated native file-read-result validator. It admits only an
ordinary or null prototype, exactly two enumerable own data fields bytesRead
and buffer, the original requested Buffer identity and the existing bounded
integer count. Reject proxies before inspection, accessors, symbols, extra
fields, inherited fields and every other prototype. Do not normalize an unsafe
return, invoke hooks or change global exact() or any protocol DTO validator.
Keep all original promise, opened-handle, byte-limit, growth-byte, EOF, clock,
first-fault and physical close obligations unchanged.

Fake read fixtures must use the actual null-prototype shape. Add adversarial
shape tests and a guarded real fs.open/read/close test against one fixed new
CODE source file. The real-file test has no writes, temporary files, browser,
driver invocation, model or database access; compare hashes rather than emit
source contents. Retain the existing short/growth/deadline/post-open cleanup
tests and actual JavaScript-to-Python profile joins.

## Startup failure observations

Add one bounded child refusal record containing only schema, stage and code.
Use schema startup-bootstrap-refusal/v1, code refused and a closed stage set:
configuration, held-handshake, bootstrap-read, ready, source-authentication,
package-directories, runtime-import, profiles and pipe-finish. The actual child
sets its private progress stage before entering each corresponding operation.
Its terminal catch emits that finite snapshot without inspecting the thrown
object, its properties, message or stack. No raw paths, target IDs, URLs, titles,
file contents or payload hashes enter the record. Define its exact shape and
stage grammar in source/protocol, and test all stage projections without a
valid actual CLI. The stage is progress metadata, not proof of a subpredicate
or an exact-error witness. Preserve the original private browser-error witness.

## Unchanged execution contract

[ADR198](ADR-198-owned-startup-only-diagnostic.md) is the complete inherited
execution contract, with only the compatibility, observation and namespace
changes specified here. Its consumed FILE SHA is
082b56971b8a498ae8013e6f62e6e66588291bb7ff6b2a039f24b3ee3982ddd4.
Include both ADR198 and ADR199 in the new literal CODE closure. Expected totals
are48 CODE plus115 maintained package files and one fixed package baseline,
164 inputs, subject to independent actual-import review. Preserve the immutable
generic v13 helper pins, whole-module authentication, fixed115 package hashes,
version/integrity, single historical LF exception and all directory/proof rules.
No old data array, freeze or profile grants a read or execution right.

The aggregate workspace now explicitly contains fifteen roots: the thirteen
frozen study outputs, the consumed startup-diagnostic-v1 output and the fresh
startup-diagnostic-v2 output. Their combined limits remain8GiB/344064 entries;
current profile/temp512MiB/8192, evidence32MiB and logs1MiB. Only the exact fresh
v2 root may initially be absent; required old roots, reparses and unknown types
still fail. Use separate finite diagnostic-v1 and diagnostic-v2 failure labels
with the original ResourceObserver untouched. Derive no root from globbing or
caller inputs. Preserve the bounded authenticated package directory closure.

Preserve360s active/420s total/60s owned-Job CPU, bootstrap30s, READY15s,
profiles45s including normal closes, drains15s,128 processes,1536MiB memory,
physical/commit reserve1GiB and C2GiB/D4GiB. No cap or deadline increase.
Metadata preparation remains Node-free/Job-free with explicit parent CPU60s.
Startup retains the original Popen-handle identity join before assignment,
DETACHED held pipe, original handshake, sealed baseline, complete enumeration,
terminal-safe transport, physical ACK commits, exact native publication pairs,
milestone joins, retained originals, EOF/threads/handles and emergency semantics.

At most three fresh fixed blank profiles may seal the anchor, discover targets,
perform strict censuses and close normally. The first fault remains terminal.
No extension load, public navigation, native content read, model/asset, provider,
database, account, live-service or crawler changes are permitted. Three healthy
starts do not explain the former third extension-batch failure or authorize a
semantic study. Root may not repeat or adopt the consumed v1 attempt.

## Source and phase gates

Root and Trust must review the complete new source, the narrow delta and actual
test coverage. Independently verify literal imports, all164 input pins, secret
scan, guarded tests and actual pure Python tests before readiness. Pure tests
never dispatch valid actual modes, including after a future readiness marker.
Use readiness marker adr199-reviewed-startup/v1 only after source acceptance;
it is not phase authority. New maps and output leaves must be fresh and fixed.

Separate ONE metadata preparation, independently audit its saved evidence,
then separately decide ONE startup-only invocation. A timeout never authorizes
a duplicate invocation. Consumed source, maps and outputs become immutable.
Semantic quality, live hierarchical assignments, canonical discussion feeds,
client/crawler integration and owner controls remain the original goal's work.
