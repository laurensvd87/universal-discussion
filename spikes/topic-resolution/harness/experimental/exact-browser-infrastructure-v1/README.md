# Exact browser infrastructure startup (ADR166)

SOURCE ONLY. Default imports/CLI are inert. Preparation, actual source-freeze
audits and ONE owned blank-browser DEV require separate root/Trust gates. No
public navigation, content capture, model/E5, provider, account, database, owner
runtime or crawler action is authorized. A passing synthetic test is not browser
compatibility, semantic quality or normal process-drain evidence.

## Exact authorized change

This new six-file namespace explicitly adapts frozen164 observer mechanics; it
does not import an old164 runtime helper or read its output. The actual204-source
composition remains original187 plus17 fixed additions, replacing only own six
sources/decision. Original150/151/158/153/155/157 helper/freezes and all pins stay
unchanged. The actual runner imports compatibility-variant.mjs only after full
source/freeze and original Node/optional-console baseline ACK authentication.

Four extra bounded coordinator operations per successful variant:
1. context.newCDPSession(actualAlreadyCheckedBlankPage);
2. that session's Target.getTargetInfo without a caller targetId;
3. Target.getTargets immediately after unfiltered discovery, before extension;
4. Target.getTargets before close, including nonfatal API-incompatibility paths.

The original post-load census remains. Every added await has the existing
operation fail fence plus explicit check before normal continuation. No native
detach is added: context cleanup disposes the additional anchor session. Only
genuinely unreached early phases retain null censuses; no fabricated success.

The actual session response seals page/about:blank target and present context
IDs privately. Discovery must identify that same page, not any same-URL page.
Exactly one of each of these two infrastructure tuples is accepted:

- browser_ui / chrome://omnibox-popup.top-chrome/
- browser_ui / chrome://omnibox-popup.top-chrome/omnibox_popup_aim.html

Each requires strictly attached=false, absent parent/opener, anchor's context,
distinct valid target ID and exact raw URL equality. No query, fragment, suffix,
normalization or general chrome:// exception. The other three finite observer
endpoint categories remain disallowed. First identities are sealed; duplicate
creation, replacements, changed tuple/context/attachment, unknown identities,
early destruction, crashes and postterminal revival fail. Anchor type/URL/context
remain fixed; its true-to-false detach is allowed only after closing begins, never
a later false-to-true transition. Closing starts immediately before owned cleanup.

The diagnostic ALSO requires the admitted extension-worker target to remain live
with the same type/URL/context until owned closing. This is stricter than164:
early destruction, replacement/mutation or crash is fatal diagnostic refusal,
not ordinary API incompatibility. Legitimate idle MV3 shutdown may be refused;
no claim is made that such shutdown is unsafe or that general MV3 lifetime is
validated. Known-worker destruction during closing is tombstoned, never revived.

The pure private policy copies native records/arrays using bounded own data
descriptors, rejects proxies/accessors, caps32 fields/record and128 census rows,
validates ASCII IDs [A-Za-z0-9._:-]{1,160}, and compares actual ID SETS with its
callback registry. It does not accept caller-forged normalized info: only its own
privately branded detached records can enter creation/worker admission. Policy
state is limited to anchor + exactly two infrastructure slots + at most one
originally admitted worker; IDs and bounded worker URL stay private and are
released at the final guard path. This separate small policy is not a certificate
or native-write authority. No raw IDs/URLs/hashes enter result metadata.

Census metadata distinguishes pre-load, original post-load and final. It reports
one anchor, two infrastructure targets, zero other targets, and zero-or-one exact
original extension worker with equality flags. The original browser/empty-URL
CENSUS exception remains, with separate count; it never permits discovery of an
unexpected browser target. Guardian independently checks all revised result
fields, phase reachability, count arithmetic, equality flags and final census
requirements. ID equality itself is enforced inside the trusted variant, not
inferred by guardian from flags.

## Unchanged safety boundaries

All launch options, sandbox, TLS, empty fresh profiles, extension stage six exact
files/two directories, HTTP/WebSocket/download denials, DNS NOTFOUND, original
worker authority/deferred checks, RPC settlement, two cleanup slots, baseline,
15s residual-subset then exact fresh handle census and normal drain stay intact.
No filter, target attachment to infrastructure, timeout increase or second-profile
rescue. Emergency owned-Job cleanup is a FAILURE, not fixed by this policy.

The observer retains two added type/five exact endpoint categories and bounded
lifecycle metadata. Its private registry caps32 targets/32 contexts/32768 logical
bytes, retains tombstones, and uses historical observed-blank comparison only
(not the actual-anchor binding supplied by the separate policy). Header128, map
entry32, ASCII key/field-name/string bytes1 per character, integer8, boolean/null1
are charged, including anchor/tombstones. This is logical accounting, not a V8
heap measurement. All callback/lifecycle/relation output shares32 slots charged
before emission. First fault, separate cleanup failure and actual physical
pending counters remain. Observer failure cannot skip original denial/cleanup;
original action/failure priority remains.

Heap256MiB, Job RSS/private1536MiB, host1GiB/C768MiB/D512MiB reserves; fresh D
TEMP/profile512MiB/8192entries, evidence1MiB/log64KiB/metadata64KiB. Bootstrap30s,
READY15s/ACK5s, variants45s, RPC10s/worker8s/cleanupRPC2s; child175s, parent180s,
wall195s/cleanup10s. All existing source/package initial/end and stage checks,
normal completion linkage and identity census remain. These are cooperative
trusted-host/client constraints, not binary attestation or complete OS egress
isolation.

## Tests and restricted diff

Focused command from repository root:

`node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none spikes/topic-resolution/harness/experimental/exact-browser-infrastructure-v1/test.mjs`

Exported PYTHON_AST_TEST uses injected files/identities/clocks and CODE only. When
the offline guard skips its child, execute that identical Python source separately;
never execute guardian main/prepare/run. Tests cover exact expected newly accepted
tuples, forbidden mutations/IDs/census sets, zero-hook descriptors/proxies,
four-await races, API-incompatible final census, physical pending preservation,
both cleanup counts, observation overflow and source/baseline/stage negatives.

The one test-only differential authenticates old164 observed-variant.mjs CODE
SHA256 b8c83d4881436046eba46ac48d9be547e1382f92bad22870b89de0df7b7f6799
BEFORE ordinary dynamic import. No old entrypoint or actual client is invoked;
this is not atomic OS loader attestation and adds no actual204 dependency.

Consequential diff from164: private exact compatibility policy/finite five error
codes; two anchor-binding operations; target-created and lifecycle identity
enforcement; pre-load/final set censuses and extended original census; three
census result fields; guardian schema/arithmetic/reachability validation.
Worker lifetime stability is an explicit additional diagnostic restriction.
Observer projection/caps are unchanged. Other run/guardian/ledger changes are
only own namespace/environment/handshake/module/decision identities. Tests/docs
describe this deliberate acceptance change, not byte-identical predicates.






