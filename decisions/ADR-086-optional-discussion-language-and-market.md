# ADR-086: Optional discussion language and delivery-market preferences

Date: 2026-10-11.
Status: owner approved; implemented, independently reviewed and verified in 0.13.45.

## Explicit approval

The owner approves optional Chrome UI-language context, a preferred generated
reply language (English by default), and a manually selected delivery country
and currency (both unset by default). Preferences stay in local extension
storage; only these fields accompany deliberate Insight or sparkle-reply
requests to ChatGPT. There is no IP lookup, precise location, browsing history,
additional provider request or new browser permission.

## Implementation contract

- Put compact controls behind the existing Settings icon, not in the discussion
  feed. Interface labels remain English and live in the language pack.
- Use the native Chrome UI-language API, not network-based locale detection.
  The language hint is optional and can be disabled. It does not identify the
  user's location and must not override the chosen reply language.
- Default generated replies to English. Never derive delivery country or
  currency from a browser language, visited domain, account identity or IP.
- Persist a bounded, versioned preference record locally. Storage failure or
  invalid stored data leaves safe defaults; asynchronous loading must not
  overwrite newer deliberate edits.
- Send an optional, strictly validated `preferences` object separately from
  the attested page/Topic context. Use bounded language tags and supported
  country/currency codes, not free-form instructions or extra fields. Validate
  on both client and service before requesting provider work.
- Treat market preferences as user-chosen hints, not verified residence,
  shipping eligibility, price conversion or tax totals. Selected reply language
  governs generated prose, not source facts or citation identity.
- Settings apply to the next deliberate request. Opening Settings, changing
  preferences or restoring them must not generate, search, retry or post.
  Existing in-flight jobs keep their captured preferences and normal context
  attestations; a preference is not new write authority.

## Unchanged boundaries

Keep opener/target/current-page limits, five-source ceiling, research-off,
selected-only opening Insights, broad validated reply research, safe provider
citations, canonical/historical destination checks, exact-body one-shot sharing
and private recovery. No extra parent/history, page/date extraction, raw logging,
retained page text, crawler, account switch, inference QA budget, publication,
provider billing or store-release approval follows.

## Verification plan

Use synthetic contract/integration tests for defaults, valid language/market
transfer, invalid/injected/extra fields, storage/load races, research-off and
zero unintended requests. Independently review the new data boundary. Run full
service and extension capability-denied suites, secret scans and package/diff
checks. Use isolated synthetic Chrome screenshots to check Settings reachability,
focus and narrow-panel overflow; do not use the owner's account or make a live
inference request.

## Completed evidence

GPT-6.1 Sol Medium client/backend slices and independent Trust review pass.
Shared validation rejects extra fields, accessors/non-enumerable data, malformed
or oversized tags, private-use/extensions, unsupported codes and explicit
undefined transport values. Persisted browser language is rejected: the native
hint is read only after valid deliberate-click checks and omitted when off or
unavailable. A saved language cannot silently survive hint opt-out.

The versioned record stores chosen settings and the hint-enabled preference,
not the actual native language. Load/edit races cannot overwrite newer edits;
saves are serialized. Requests capture settings and recheck Source/account/target
after preference hydration, so a delayed load cannot redirect a clicked request
to a changed page. Preference changes affect the next request, not the active
job, and do not invalidate its normal one-shot sharing checks.

Independent adversarial tests: **12 pass**; combined relevant routing/proof/storage
regressions **107 pass**. Focused client/controller/panel/storage **125 pass**;
focused package/UI/storage/Trust **58 pass**. Final full service **437 pass,
four optional skips**; extension **1,153 pass, one optional skip**;
capability-denied extension **1,154 pass**. Secret scans: service **631** and
extension **196** files, zero findings. Standard Git diff checks pass.

Isolated actual Chrome verifies default language/unknown market, gear-only
controls, keyboard focus, four inert edits and local-storage reconstruction.
Screenshots at 390/320 px show no horizontal overflow; root reviews the compact
settings. Existing typing/IME, inline/historical replies, delayed projection,
citations, tombstone pruning, dock/zoom/reduced-motion regressions pass. This
synthetic companion is layout/contract evidence, not a new native-panel trust
attestation or proof of live provider language/market compliance.

After confirming the exact existing project process and no pending Insight for
either actor, the normal backend is restarted with unchanged Origin/pairing/
protected login/SQLite and raw debug off. Authenticated health/catalog/status
are **200**, protected ChatGPT connection remains active and the database
generation/revision is unchanged across restart. Reload extension **0.13.45**.
No live inference request or new diagnostic budget; later release gates remain.
