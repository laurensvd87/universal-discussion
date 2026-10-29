# General website subjects: development evidence

29 October 2026. General websites are the primary implementation path. No
Wikipedia identity service, ontology, predefined child vocabulary, LLM or new
model is required by this candidate. Wikipedia metadata remains optional.

These are inspected development examples, not representative accuracy or live
activation. Original v1 code, policy and all earlier results remain unchanged.

## Actual recipe and video

The owner's two specified public pages have stored title/body E5 vectors:

- `https://www.leukerecepten.nl/recepten/kapsalon-maken/`
- `https://www.youtube.com/watch?v=rd5EWR83AGs`

The frozen v1 candidate already finds their common named subject **Kapsalon**,
with accepted ancestor `cooking` and paired cosine0.9184236323780453. The pure
two-document name pass took median0.1237ms/p950.3169ms. This excludes capture,
inference, HTTP, SQL and UI time. The bounded general application planner also
reuses one opaque UUID on a second pass with an invented candidate revision1.
This is actual stored material through planning, not persistence/restart proof.

## New non-Wikipedia cohort and retained failures

The closed12-page cohort spans animal pages in English/German and gaming product
pages. Original capture:5available/7unavailable. A declared six-observation repair
pass subsequently yields4available/2unavailable, giving9 unique usable pages.
All12 original and6 repair outcomes remain recorded. A denied Steam publisher
was excluded from the repair; Nintendo's repaired attempts end in policy refusal.
Neither is evidence of a usable page, and neither should be bypassed/retried.

Four iFixit product pages exposed an actual static-parser bug: `<` and quotes
inside inert script text were treated as HTML tags. On the same four responses,
the exact old parser refuses at attribute-count129; the repaired parser succeeds
within the unchanged128 bound. Bounded raw-script/style handling now skips that
text without executing scripts. Unsupported double-escaped scripts and unusual
closing forms refuse explicitly; this is not a complete HTML5 parser. Another
real failure came from slightly early timer delivery in the paced collector:
up to three remaining-interval waits preserve the original spacing/deadline and
HTTP request caps, rather than making another request early or retrying HTTP.
These extraction/timing fixes are source-only; the sealed live crawler is unchanged.

With two publishers required, frozen v1 names the two English red-panda pages
and two giant-panda pages but cannot use distinct products on the same repair
site. New v2 permits two genuinely different materials from one publisher for
a **subject**. Near duplicates and known conflicting roots remain excluded.
This does not establish independent reporting, truth or event identity.

The first v2 comparison exposes unwanted publisher-footer and instruction-suffix
names. Its output remains retained. A subsequent explicit development refinement
excludes those weak single-publisher scopes. Across all9 usable pages it yields:

| Subject | Assigned pages | Interpretation |
| --- | ---: | --- |
| Giant panda | 2 | Separate from red panda |
| Red panda | 2 | English examples only |
| Nintendo Switch | 2 | Product family, not reliable Switch2/OLED leaf separation |
| Steam Deck | 2 | Product family, not reliable OLED/LCD leaf separation |

The German WWF red-panda page stays page-only with a broad `nature` ancestor.
Cross-language and model-specific leaf matching remain unresolved. Eight named
assignments out of nine available examples must not be reported as universal
coverage, fresh validation, nine correct specific leaves or end-to-end latency.
The refined pure9-document pass took median0.6572ms/p951.5748ms. All actual local
encoder runs disposed their model and exited0; no download/provider was needed.

## Application boundary

`src/application/automatic-named-subject-plan.js` now exposes an explicit
`planAutomaticNamedSubjectsV2` entry with a source-fingerprinted policy descriptor.
Wrong policy identities/thresholds refuse; the old entry retains v1 behavior.
Names are evidence, not IDs: new subjects receive opaque UUIDs, and bounded
retrieved candidates can preserve their UUID/revision and existing parent.
Ambiguous existing scopes defer, missing Source witnesses refuse, and ancestry
cycles visible in the input refuse. SQL must still check full ancestry and all
generation/receipt/Source-version/stamp/revision fences atomically. There is no
generic SQL publication, schema18 installation or live named-topic UI yet.
The joined37 pure tests pass with64MiB heap and the offline capability guard.

## Retained local receipts

These ignored local receipts are not included in Git exports. Root verified
seven result hashes and27 individual case files in
`data/general-web-topic-root-audit-20261029.json`. This is a same-agent result
audit; historical source pins were not independently reverified in that audit.

| Receipt under `apps/local-service/data/` | SHA-256 |
| --- | --- |
| `general-topic-owner-focus-verified-20261029/result.json` | `1b27e07387a0d10608091bff764d5a2dacaad6799cba49753f8c374f501d2674` |
| `general-topic-registry-plan-20261029/result.json` | `de9fa2aa0f57c4190e892eaa655ce66e72911206ad97eb3c875fa7dad5311215` |
| `general-web-subject-screen-capture-20261029/result.json` | `a464fc8d95c266e94d2ae50f6f3997e7f71e61311699b1d55ff35b39ef132d47` |
| `general-web-subject-screen-features-20261029/result.json` | `0ac97b6560ca5208f49667cb97a583d094ff3ed03e67db37d84f69e1fe670a06` |
| `general-web-subject-repair-capture-20261029/result.json` | `f1563c82dccb453f88ad8f9f835ec9e3538ab6910cebbb9fe71b2ab57436c41e` |
| `general-web-subject-variants-20261029/result.json` | `ed49a8b7b2a7241a405f0862c7a8cf16f88d9532bcdd7c0b9b0bd2ef630702f5` |
| `general-web-subject-refinement-20261029/result.json` | `d6d80b2904bd8e83a32c2e4f935b348bab5814e36901ac0a96b46376400b08b2` |

The unsuccessful initial owner diagnostic is retained too: it expected the wrong
success enum despite an already correct Kapsalon proposal. The corrected runner
has a separate namespace; no original result was rewritten. All product/animal
refinements are DEV, with prospective additional language/domain tests still due.
