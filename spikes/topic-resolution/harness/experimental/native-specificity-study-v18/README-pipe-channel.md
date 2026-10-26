# Original-pipe transport adapter (source-only)

`createOwnedSpecificityPipeChannel({input,output,guard,clock,deadline})` uses only
`node:util`. Import and construction perform no IO, register no listeners and
read no default clock or process streams. Root must supply its ORIGINAL owned
Node input/output streams and the original absolute deadline. No caller-selected
IO path, socket, process, model, filesystem or browser capability is exposed.

Root and independent Trust accepted one explicit bootstrap exception: this one
builtin-only/default-inert adapter may be imported before its handshake because
the parent independently authenticates the complete CODE/package and external
reviewed-map/freeze bytes BEFORE Popen. This does not generalize to another early
import. Only `start()` activates the provided original stream capabilities and
continuously reads the actual first header. No claimed boolean, replayed header
string, second framer or pause/detach handoff substitutes for that read. Other
private/study IO/native/model/network operations still await the actual parent
assignment/membership handshake and subsequent child bootstrap/ledger/baseline
gates. The actual CLI, import gate and parent-origin proof remain Root-owned.

## API

- `start():true` installs this adapter's six owned listeners once. Input/output
  errors and close/end monitoring precede its input data listener. It neither
  removes other listeners nor captures arbitrary stream methods. The methods
  it does capture are descriptor-checked without calling accessors/proxies.
- `waitHandshake():Promise<true>` is one-shot and requires the first exact bytes
  `NATIVE_SPECIFICITY_OWN_JOB_ASSIGNED_V1\n`. Prefix comparison is incremental;
  bad/duplicate/extra bytes cannot be rescued by another claimed handshake.
- `write(frame:Buffer):Promise<true>` reserves one exchange before dispatch and
  writes one private copied NDJSON object frame including its final LF. The
  Writable backpressure return value is not completion. ONLY its actual original
  callback can settle physical-write accounting. Callback errors (including
  false/zero), duplicates and synchronous writer throws fail closed; an unknown
  callback after a throw remains charged until the actual callback arrives.
- `readChunk():Promise<Buffer>` returns one complete copied response frame,
  including LF. Root's existing FsWire accepts this whole-frame chunk and owns
  canonical JSON, closed schema, direction/sequence/nonce/identity/request-hash
  and prior-chain authentication. This adapter does not parse or clone that
  logic. The response may arrive before the write callback; it does not release
  the exchange until BOTH actual callback settlement and response consumption.
- `assertHealthy():true` applies the held clock/guard checks, including after
  finish. No raw frame or actual authority is returned.
- `finish()` requires a healthy handshaken idle channel: no partial/queued frame,
  handshake/read waiter, exchange, physical write or tracked unexpected Promise.
  Returns `{finished:true,listenersRetained:true,physicalPipeClosureProved:false}`.
  It does NOT detach listeners, pause/unref/end/destroy streams or prove closure.
  Unexpected data/errors/EOF still poison afterward. Root alone may later pause/
  unref its actual stdin, only after terminal finish ACK, completion publication
  and all physical work settles. Actual parent/owned-Job terminal proof is separate.
- `snapshot()` returns finite counters/state only, with no raw errors or frames.

## Bounds and physical state

Frames are capped at16KiB INCLUDING LF before append/parse; the first header has
its own smaller exact bound. A fixed16KiB slab holds a partial response. At most
eight frames/128KiB could be queued by the resource contract, but the stricter
one-exchange protocol admits at most ONE complete response: a second complete
frame OR even trailing partial extra bytes is duplicate/unrequested and fatal.
One incoming event chunk is at most128KiB and is inspected without copying an
oversized allocation. Combined admitted incoming plus dispatched outgoing bytes
are capped at64MiB including the handshake. Overflow fails before accumulation;
bytes discarded after a sticky fault cannot become a normal bounded-wire claim.
No wire frame history or diagnostics are logged. Private slabs are cleared after
framing or failure; delivered Buffers belong to the caller. Normal counters and
FsWire's separately held final hash chain do not permit raw-frame replay.

`guard` and `clock` are synchronous trusted capabilities. Clock values must be
finite, nonnegative and nondecreasing, strictly before the fixed deadline. Fresh
checks bracket every capability/event and immediate dispatch/delivery; a caught
reentrant fault cannot be rescued by a later true guard. Sticky state is checked
immediately after clock and guard callbacks, before the next capability. There is no default
timer, Promise.race or scheduler watchdog. With no events, a pending original
remains charged; the actual outer guardian must enforce its independent wall/
resource/owned-Job stop. Event-loop observations are not OS hard-time guarantees.

`physicalWritePending` is cleared only by the first actual original callback.
Duplicate old callbacks cannot settle a newer write. `readWaiterPending` describes
only the caller's logical Promise; rejection is NOT proof that the input pipe
closed. `responseOutstanding`, `inputMonitoring`, `inputEnded`, `inputClosed`,
`outputClosed`, `physicalExchangePending` and `exchangeReserved` remain distinct.
EOF may end physical reading unsuccessfully; stream errors or a rejected waiter
do not establish closure. `pipeClosureProved` is always false. No failure frees
the channel for another exchange or grants normal completion.

Unexpected safe native Promises returned by synchronous capabilities are observed
and tracked until actual settlement. Proxy/subclass/own-constructor/own-then or
accessor-bearing Promises are refused without invoking hooks; the external owner
still owes accounting for unsafe originals. A stream method that installs work
then throws before handing it off remains a trusted provider ownership obligation.

## Evidence and remaining gates

The guarded tests use FAKE EventEmitter streams and invented frame bytes only.
The only filesystem read in the suite is static inspection of this owned module's
SOURCE to assert its builtin-only/default-inert closure. They cover byte-split
magic/frames, exact frame/wire boundaries, queued/duplicate/idle data, backpressure,
late/duplicate/error callbacks, caught reentry, post-guard deadlines, unsafe hooks
and finish monitoring. Toy frame bodies are not native filesystem proof.

Actual original stdin/stdout, parent authenticated pipe and hash chain, source
gate/CLI composition, Job assignment/physical census, real callbacks, publication,
native Windows primitive, models and the actual study remain unexecuted and
unproved here. No standalone preparation or study authority follows from import,
the constructor, an invented test or this source-only component.

```powershell
node --max-old-space-size=256 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none ./spikes/topic-resolution/harness/experimental/native-specificity-study-v18/pipe-channel.test.mjs
```
