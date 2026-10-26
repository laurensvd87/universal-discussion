# ADR-125: Owner-controlled semantic topic spaces and fast discussion discovery

Date: 2026-10-18

Status: Read-only discovery ACTIVE locally; client0.13.70 requires reload.
Owner management implementation verified; actual owner bootstrap awaits explicit
confirmation of the existing named account. No implicit owner was assigned.

## Owner request and model boundary

The owner requests implementation of fast, low-cost discussion discovery and
general-to-specific topic formation. They select an owner-wide policy only,
with per-topic overrides: niche subjects may stay broad while popular subjects
are refined. No personal specificity preference is implemented.

Add a derived semantic topic-space hierarchy above existing canonical root
threads and original destinations. Recutting a hierarchy changes grouping and
discovery, not stored contribution IDs, original destinations, ownership, private
visibility or current Source/native/AI/write authority. Existing technical
Topic containers remain compatible storage destinations; they are not relabelled
as fewer canonical containers or silently migrated. No new clustering-derived
write or provider authority follows. This is an additive product path, not the
complete removal of canonical singleton allocation or the exhaustive old matcher.

The first index includes populated public root threads and their existing
authoritative Source embeddings only. It does not load every crawled page,
create synthetic engagement, inspect private chats or call an LLM. New empty
catalog containers do not become additional visible topic spaces.

## Grouping and policy

Use a bounded deterministic nested exemplar hierarchy, initially five levels.
Both background construction and current-Source lookup use the existing pinned
Ridge1 transform; no coefficients are fitted or changed. Missing/invalid installed
Ridge disables the new routes, never falling back to raw E5. The conservative
discovery thresholds are .8639003810829322/.90/.93/.96/.99. The base floor is the
existing Ridge floor; higher cuts are explicit discovery heuristics, not changes
to canonical assignment/Related thresholds or calibrated semantic identity.
An unactivated raw-E5 .78 prototype mixed unrelated public Source titles in a
read-only check and was rejected. UMAP/HDBSCAN are not required in the online path.
Their adoption later requires a measured improvement, not an extra dependency
by default.

Base group IDs derive from representation namespace, canonical generation and the earliest stable root
ordinal/exemplar. More-specific child IDs retain parent lineage. Later appended
roots must not rename existing anchors. Owner default specificity is 0..100,
initially0; 0/25/50/75/100 select the five levels. Per-topic overrides refer to
stable base groups, so refinement does not discard the setting. Selected groups
partition root membership. Human and AI counts remain separate; there is no
automatic refinement based on crawler or AI volume.

Settings are an OS-owned local JSON file, separate from canonical storage, with
explicit named owner-account bootstrap. Device pairing, guest identity, username
matching and being the first account never grant management rights. HTTP changes
require the configured named owner, exact Origin, a current app session,
expected policy revision and a renewed transport/account check immediately before
atomic publication. No per-user override or implicit policy write on slider input.
Unknown override IDs are rejected. On a deliberate save only, unchanged orphaned
overrides left by deleted anchors are pruned so they cannot block later owner
changes. Base owner labels prefix descendant labels; neither changes identity,
membership or semantic match scores. Concurrent file replacement and redirected
paths fail closed; cleanup only unlinks an owned file identity at a checked path.

## Fast read path

Read a small public-thread input stamp independent of unrelated crawler revisions.
Build the bounded index off the HTTP event loop, coalescing concurrent rebuilds.
An absent/outdated index returns an honest building state, never old cached post
bodies. Before delivery hydrate selected public cards from current canonical
rows, renew generation/input stamp, Source witness, policy and transport/account
proofs. Groups confer no authoring capability. Original conversation previews
use normal canonical read paths and remain read-only on foreign pages.

Limits include4,096 indexed roots, finite grouping work (40 million coordinate
units, which can exhaust before the root-count limit), a bounded eight-second worker,
20 groups/page and at most3 fresh previews/group. Exhaustion is explicit, not
silent sampling. Owner control can rename a base label without generating text.

## Work and activation gates

1. Pure hierarchy/policy controls with deterministic, adversarial and capacity tests.
2. Scoped PostgreSQL inputs/stamps/cards with mirror/privacy/deletion tests.
3. Background discovery service, owner policy persistence and authenticated routes.
4. Strict client DTOs, read-only grouped discovery and owner-only explicit controls.
5. Independent trust review, synthetic end-to-end/browser checks and live read-only
   latency/group-size measurements. No agent-run provider call or real post.
6. Reviewed checked-runtime overlay and service-only activation, preserving crawler,
   worker, dashboard, canonical records, pairing and protected sign-in.

No owner-data migration or schema change is planned for this additive layer.
A later replacement of canonical assignment, empty-container allocation,
whole-library Related validation or cross-Topic reply authority is separate work
and must not be claimed implemented by these discovery controls.

## Verification and remaining product limits

The final real-data read-only check contains38 populated public roots: the five
cuts select22/26/27/27/27 groups. An existing Kapsalon Source finds one broad
cooking group with4 threads (including another recipe); refinement separates
that wider recipe grouping. This is a small coherence check, not a multilingual
quality benchmark or a claim that current embeddings identify every valid topic.
Queries measured roughly70–105ms and worker build roughly350ms on this local
catalog during concurrent offline test activity. The crawler was already absent
when checked; it was not stopped, and these are not active-crawler stress results.

The new Discover section indexes discussions, not every crawled page. It shows
20 groups/page and3 thread previews/group; canonical preview remains read-only,
and page links retain normal current-page authoring requirements. Existing library
search remains below it. Default/per-topic specificity and optional base labels
have explicit Save; no personal preference or automatic popularity split exists.
Human and AI counts remain separate, with no popularity inference from crawler
volume. Client0.13.70 requires reload.

Existing dashboard Topic/container counts, original canonical page allocation,
exhaustive Related lookup and page-open matching are unchanged. Consequently this
does not establish that every page opens in100ms, remove canonical singletons,
or demonstrate thousands of distinct writes, an unlimited index or hosted scale.
Withdrawn roots omit their branch from this derived index, even when descendants
survive; original canonical discussion reads are not deleted or rewritten.

The operator bootstrap is `src/ops/topic-space-owner-cli.js --account-database
ABSOLUTE/accounts.sqlite --policy-file ABSOLUTE/topic-space-policy.json
--account-id RAW_ACCOUNT_ID --confirm-owner`. It checks the exact existing active
named account through a read-only connection, without creating/migrating accounts.
No bootstrap or owner file is created until the owner explicitly confirms the
chosen existing account. Device pairing and username/first-account guesses never
appoint an owner. No provider calls, real posts or owner-policy test writes were
made for this feature.

## Local activation evidence

Final backend1,231pass/seven skips/zero failures; restrictedclient1,599pass;
portable121pass plus final changed-read/ADR124 regression24pass; focused new
backend49total/47pass/two Windows filesystem skips. Independent cross-layer and
pinned-model review passes. Actual isolated Chrome verifies guest/owner controls,
explicit base-policy/label Save, safe text, context/logout cancellation, focus,
and360/420px layouts; broader existing community layouts also pass. Secret scans
return zero findings. Earlier test runs during changing fixtures failed; the
final complete runs above supersede them.

Reviewed backend-only eight-file overlay, five new files, is sealed at
`5fa117da49ee1864ae43ca9429633c16dc695f8ff5726ecbd64df08375e82f31`
(1,361files/15,305,997bytes). Previous code/manifest retained in ignored
`data/runtime-backup-adr125-20261018`; no database restore is needed or allowed
as a code rollback shortcut. Service36252 replaces9608; ingestionworker22884 and
dashboard6644 retain their original start times. No crawler process was present
before/after; none was stopped or started. Existing dashboard counts are retained.

Actual paired HTTP:22 broad groups, Kapsalon1group/4threads/82ms. Concurrent wave
80topic reads plus20version reads:100/100HTTP200, median402ms/p95450ms,478ms total.
Canonical revision19750 remains exact throughout;19,002learned Sources,
11,792canonical containers and31human/39AI public posts remain. Pairing hash is
unchanged. Owner query canManagefalse, policy revision0, and no policy file exists.
The first saved-read proof raced listener startup; a later ready proof passes
with53ms saved read and expected absent-page404.

**AI login caveat:** before restart the old process reported connected=true;
after restart the provider status is disconnected. Read-only DPAPI diagnostics
find the public registration but no protected refresh record at either known
current/legacy installation path. The cause/timing of that absence is not proven.
No credentials were manually moved/deleted/restored, no auth migration or extra
provider diagnostic/inference was attempted. Owner must deliberately reconnect
ChatGPT; app-account session may also require renewal. Do not claim protected
sign-in preservation for this activation or search arbitrary backups for tokens.
