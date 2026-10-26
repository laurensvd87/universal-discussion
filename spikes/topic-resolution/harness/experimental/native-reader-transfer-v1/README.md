# Native reader transfer adapter — source only

ADR150 source-only implementation: no extension has been staged/loaded and no
actual study has run. Execution requires the complete source and supervisor gate
below. The adapter has no account, pairing, app/service, storage,
provider, model, canonical database, runtime-message or web-accessible interface.

Future reviewed staging must copy these adapter/worker/manifest bytes and the EXACT
production `browser/chromium/page-content-reader.js` to
`chromium/page-content-reader.js`, plus the EXACT production
`browser/core/page-content-policy.js` to `core/page-content-policy.js`. Do not
rewrite imports, extraction, limits or returned native metadata. The reader's
relative policy import already fits this layout. A future driver must pin source
and staged bytes before/after use; this adapter does not create that authority.

`createNativeReaderTransfer({chromeApi, reader, urlPolicy})` is an inert factory
with explicit trusted capabilities. Synthetic tests supply invented native APIs
and a reader, plus the actual pure production URL policy. The separate
`worker.js` MV3 entry statically imports the unchanged staged production reader
and policy, constructs the real reader with actual `chrome.scripting`, and wires
only those capabilities into the factory. It has no caller override or dynamic
import/fallback path. This static wiring avoids unsupported MV3 service-worker
dynamic imports. Its private worker global
`nativeReaderTransfer` is callable by a separately reviewed owned-browser channel,
not by page messages. The manifest grants only scripting/tabs and the 29 exact
sealed article hosts; no permissions are requested/granted programmatically.

Commands are exact plain records:

- `beginStudy({studyId,windowId,cases})`: exactly the exported 32 ordered
  `{id,ordinal,url}` records, ordinals 1–32. Returns study ID, fresh revision,
  event epoch and count. A failed begin cannot be replayed on the same handle.
- `observe({studyId,studyRevision,caseId,ordinal,observationNonce})`: single-flight,
  ordered and one-use even when unavailable; nonce must be fresh. Reads only the
  actual focused normal non-incognito window's active complete tab at that case's
  exact URL, with actual host permission. Repeats checks after native read and
  after attestation targeted to the returned Chrome documentId. Native events
  invalidate in-flight observations; malformed callbacks fail closed.
- `skipUnavailable({studyId,studyRevision,caseId,ordinal,observationNonce,reason})`:
  synchronous metadata-only accounting with the SAME ready/identity/single-flight/
  ordering/unique-nonce admission. It consumes that case without any native API,
  read/attest or page visit. Reasons are exactly `origin-policy-unavailable`,
  `origin-policy-refused`, `article-unavailable`, `document-policy-unavailable`,
  `restricted-rendering`. The ordinary unavailable row is explicitly a
  caller-declared preflight refusal, not native or publisher-rights proof. No
  document witness or captured fields are produced.
- `endStudy({studyId,studyRevision})`: invalidates in-flight work and removes own
  listeners. No retry, old-case backfill or restarted worker reconstruction.

The one window ID/profile fixed by begin remains bound throughout this one
32-case study; neither observe nor skip authorizes a replacement profile.

The statically wired `nativeDocumentRights` handle supplies head metadata only:

- `locate({tabId,sourceUrl,documentUrl})` executes the UNCHANGED production
  `attestContentDocument` in native frame 0, without reading text. Its return
  includes Chrome's actual documentId and attestation.
- `snapshot({tabId,documentId,sourceUrl,documentUrl})` targets that actual native
  ID in `ISOLATED` world. It visits at most 128 head elements, at most 32 robots
  and 32 TDM declarations, each at most 4096 UTF16 units, and canonical href at
  most 2048. It returns the bounded declarations plus actual frame/document ID;
  it does NOT interpret them as processing permission.

The future driver must locate, snapshot the ID BEFORE the article read, require
the adapter observation to return the SAME ID, then snapshot that ID AFTER read.
It must separately check both metadata records through the reviewed Node policy
parsers and bind response/journey/foreground evidence. Same URL alone cannot
substitute for same native documentId. This module neither performs that complete
admission nor grants rights. Failed native calls expose finite codes only.
`native-rights.js` must also be copied/pinned in future reviewed staging; worker
wiring remains static and imports no app or provider capability.

Collected results contain only transient `rawTitle`, production-rule
`effectiveTitle` (`trim() || hostname`), `body`, extractor version and the full
native witness. Both titles are at most 200/body at most 4096 UTF16 units; invalid
controls/surrogates fail without cleanup/replacement. Results are detached/frozen.
Unavailable results contain case ID, ordinal and a finite reason, never native
errors/stacks or partial text. JavaScript reflection rejects accessors, but the
private automation channel is trusted infrastructure: browser JavaScript has no
general side-effect-free Proxy detector. This is not a hostile web-message API.

The witness records real Chrome main-frame/document identity and all three actual
foreground/permission observations. Browser-reported focus is not proof of real
OS user attention. Attestation establishes document/URL continuity, not unchanged
DOM/text, publisher rights, canonical Source freshness or post authority. There
is no CDP loader ID, Playwright witness, rights approval or fabricated pairing.
The root driver must separately bind same-document policy checks and construction
hashes before retention/encoding. Raw extracted text stays in RAM; this adapter
persists nothing. Numeric root quality and live integration remain unproved.

## Complete study path

`browser-capture.mjs` uses one disposable persistent Chrome context, a blank
anchor and one fresh article tab at a time. It permits only the fixed current
article origin and five literal CDN origins, with normal TLS, sandboxing and a
selected public DNS pin. One page CDP Fetch session owns HTTP interception;
separate maintained WebSocket routing closes sockets without server connection.
The reader's actual native document ID, bracketed head policies and independently
verified main-response loader journey must agree before retention. An exact
initial blank loader is ignored, not arbitrary mismatched lifecycle events.
This restricted-network input is not unrestricted browser parity or OS egress
isolation. Temporary browser-managed cache may contain raw responses; only the
harness-extracted text is RAM-only.

`study-runner.js` composes the real capture, native metadata validator, transient
ledger and unchanged numeric wrapper. All32 rows, including unavailable cases,
must be accounted before encoding. A separate supervisor acknowledgement must
prove that only the original Node remains in its owned Windows Job before the
packaged local E5 embedder can initialize. At most64 field encodings are allowed.
Encoder closure and asset/source checks precede the only full32 assessment.
The gate remains24 correct accepted, zero wrong accepted and at least one per
root. Child/sibling and unknown-root quality are not evaluated by this root test.

`source-paths.js` contains the fixed literal CODE allowlist; a guarded test checks
the driver's complete literal import closure. `source-ledger.js` checks the
listed code and all115 maintained-client package files
against the immutable ADR149 baseline, the exact original fit/model/policy/input
artifacts, sealed candidates and labels. It does not read old capture packets.
The new construction recipe and reuse receipt never rewrite the original fit.
Preparation checks absence and rechecks all11 artifact identities before its
exclusive writes. Staging copies six fixed files, including unchanged production
reader/policy bytes, into the new owned output directory.
Drain request and acknowledgement metadata are fully written to fixed pending
files before atomic exclusive hardlink publication. The tiny pending files stay
inside the bounded owned output; no partially written JSON is an acknowledgement.

Defaults perform no action. After the whole source/supervisor review, root may
explicitly prepare once with `node run.mjs --prepare-reviewed-study`, then run
once with `python supervise.py --run-study`. Neither command has been run.
Existing receipt/freeze/output evidence prohibits automatic recreation or replay.
The supervisor's source, resource, model-deadline and own-tree cleanup checks
must pass before an actual result can be admitted. A fatal closes this attempt;
there is no partial quality result, input rescue, retry or model retuning.

The study never opens the app, account, pairing, private chat, canonical database,
provider or crawler interfaces. It cannot activate a matcher or regroup any
discussion. Source-only synthetic tests are integration evidence, not real
capture, semantic accuracy or live readiness.
