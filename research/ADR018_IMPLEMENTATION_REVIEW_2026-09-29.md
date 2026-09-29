# ADR-018 implementation and browser review

Date: 2026-09-29. Scope: the explicitly owner-approved, one-PC public selected-site
background embedding/local matching package. Three GPT-6 Sol Medium agents owned
non-overlapping runtime, backend and reader/UI work; the Astra lead integrated,
reviewed and tested. Separate AI Trust checks are not independent-human, legal,
privacy certification, production matching validation or store approval.

## Delivered

Extension 0.6.0 defaults matching off. Per-site consent uses optional HTTPS grants;
only the focused foreground tab is sampled. One generic isolated-world reader
uses a bounded rendered main/article prefix, not per-site APIs or a crawler.
Raw text remains transient inside the extension, with packaged CPU E5 inference
in an offscreen dedicated worker. The fixed paired loopback backend receives
URL/title/vector/version only, validates all inputs, persists current Sources
and assigns provisional Topics under a deliberately conservative local policy.
The popup waits for resolution and displays the shared Topic discussion.

Corrections preserve existing posts; typed comments never retarget silently.
Pause/site revocation invalidate work; deletion controls distinguish Source
removal from shared-discussion deletion. SQLite state is bounded and current-only,
not a visit log. Existing demo data and old database records remain compatible.
English UI message keys are separate from rendering.

## Executable evidence

| Check | Result |
| --- | --- |
| Local-service default network-denied suite | 67/67 pass |
| Spike restricted suite | 396/396 pass |
| Spike normal suite | 395 pass / one intentional guard-only skip |
| Indicator/client/reader/UI suite | 214/214 pass |
| Actual fixed-loopback transport | 2/2 pass |
| Actual Chrome packaged E5 smoke | Direct document and background/offscreen/worker pass |
| Actual Chrome full matching flow | 14 checkpoints pass on latest UI |
| Original actual Chrome S3 discussion smoke | All 19 categories pass |

Secret scans: zero findings (137 spike files, 48 service files); 67 local
documentation links resolve. Whitespace/diff validation passes. Generated
model/runtime assets are ignored and absent from source-code commits.

Chrome: 154.0.8037.58. B1 emitted finite normalized 384D vectors; a direct cold
run took about 3.6 seconds, three worker samples about 1.3 seconds combined.
These one-PC observations are neither mobile benchmarks nor per-page guarantees.
Nine packaged assets total 149,832,250 bytes; combined experiment/extension
footprint 1,614,594,675 bytes, under the approved 2 GiB development cap. No new
download, package installation or runtime replacement was needed. Generated
assets remain ignored; [license/packaging limits](../spikes/topic-resolution/browser/embedding/THIRD_PARTY.md)
still apply before redistribution.

The full flow used six intercepted project-created documents in a fresh temporary
profile and temporary SQLite database. Two paraphrased Cedar tablet articles
shared a Topic/comment; gardening stayed separate. Four actual 384D vectors were
sent. Tests also covered popup-closed processing, Pause/Resume, rights/form
rejection, SQLite restart with new pairing, confirmed correction preserving old
comments, Forget, confirmed Topic deletion/clear preserving a demo comment and
site removal. Latest run took about 11.7 seconds. Zero raw-text API payloads,
external extension requests or extension runtime exceptions were observed.

All test-owned browsers, profiles, databases and listeners were cleaned up.
An existing owner listener initially occupied port 4174; the owner stopped it
with Ctrl+C. Tests never used its token/database or stopped that process.

## Review findings corrected and regression-tested

- Pending Pause/revocation now masks consent synchronously, even with delayed
  storage. A consent-generation fence prevents late Enable undoing a later stop.
- Inference keeps one active job, no queue of raw page text. Abort/timeout covers
  offscreen initialization and execution; termination cancels native WASM work.
- Rejected pairing clears the session; unsupported/current-document mismatches
  cannot upload or display stale results. Revision fences protect late writes.
- Orphan learned Topics remain deletable after their last Source is forgotten;
  fixture/manual Topics cannot accidentally use learned-Topic deletion.
- Unchanged polling preserves site buttons, dropdown options and keyboard focus.
  Context changes clear correction/destructive confirmations as well as detaching
  unsent drafts. Runtime-message requests have an eight-second bound.

## Remaining limits and next step

Owner-feedback follow-up, extension 0.6.1: a disabled Enable report on a public
HTTPS address is not yet reproduced. The address passes syntactic policy; a new
fixed-enum context reason explains focus/window/tab/loading/URL eligibility in
the popup without weakening the gate. Stale context clears on worker failure,
and disabled controls no longer falsely imply pending work. Separate AI Trust
review found no material defect. Focused tests pass 45/45, restricted suite
399/399, normal suite with its intentional guard-only skip, indicator suite
217/217; secret scan 138 files with zero findings. Seven actual Chrome 154
eligibility checks pass on a fresh profile with an intercepted synthetic HTTPS
article and favicon, before any optional host grant. No external requests,
runtime exceptions, inference contexts or model-asset loads. This test needs no
backend, listener or pairing; it does not automate the host-permission prompt or
establish why the owner's Chrome rejected the public page. Next obtain only the
new displayed context message after the owner reloads, not tokens/storage dumps.

The owner can now test real lawful public pages under the approved per-site
scope. The actual HTTPS permission prompt and real-page usefulness are manual
owner checks; intercepted fixtures do not establish either. The reader requires
eligible main/article structure, samples only 4,096 characters/512 tokens and
may abstain. Its exclusions are not reliable private/auth/paywall detection.

The .94 all-member / .04 competing-Topic margin heuristic is experimental;
related-reading .85 is not a same-Topic guarantee. Browser vectors retain their
own model-space ID; cross-runtime/mobile parity and broad multilingual quality
remain unverified. The catalog holds at most 100 Sources including fixtures.
Local storage is not encrypted and logical deletion is not forensic erasure.

No private-message capture, off-device transfer, AI provider, external search,
real account/tester, deployment, spending, public posting or store submission
was added. The completed 6/6 synthetic review stays complete. Stop and ask before
the later provenance-approved 200–250-pair R5 task or any expanded gate.
