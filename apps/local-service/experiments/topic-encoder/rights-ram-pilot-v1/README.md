# RAM-only rights-reviewed pair pilot v1

This is an isolated research scaffold. `runRamPilot()` accepts a reviewed object
in process memory, an injected fetch function, and exactly two trusted local
methods named `e5` and `candidate`. It has no CLI, listener, storage, logger,
provider call, real fetch implementation, or live Topic integration. The tests
use fictional text only.

The review schema follows `rights-corpus-v1` except that it has no text file,
hash or `capturedAt`: `version`, `createdAt`, `items` and `pairs`; each item has
`id`, public eligible `url`, `publisher`, `language`, `publishedAt`, and
item-specific `rights`; each pair has two item IDs, a `same`, `different` or
`uncertain` label, evidence, reviewer and review time. The exact field and
rights requirements are enforced in `core.js`. Input must be assembled in
memory from a separately reviewed workflow. Never serialize it or pass it via
CLI arguments or environment variables.

The injected transport receives `{redirect: 'manual', signal}`. It must obey
both, and must provide the final response URL, headers and a readable stream.
The reviewed input is copied and frozen before the first asynchronous call;
later caller mutations cannot change the fetch list or pair labels. Common
URL normalization catches host-case and trailing-slash duplicates, but it
cannot prove that all redirects, editions or publisher syndications are
different articles. A separate duplicate/source audit is still needed.

Only exact-URL HTTP 200 text/html or text/plain is accepted. HTML requires a
trusted `extractArticle(html)` callback that selects public article prose and
returns 50–4,096 UTF-8 bytes of plain text; missing or invalid extraction
fails closed before embedding. Both HTML extracts and text/plain bodies pass
the same byte limit and a basic markup/page-chrome rejection. This check does
not establish that the content is an article. The callback needs separate
review before any real fetch, and this scaffold does not establish production
body-E5 parity.
Each raw body is limited to 100,000 bytes, each fetch has a five-second abort
deadline. The review is limited to 250 pairs, 500 items, and 30 days from
`createdAt`. Text goes to the local embedder
only while that item is processed; 384D vectors remain in the call and are
copied before storage and zeroed on completion or error. Comparators receive
copies, so they cannot alter vectors used by later pair checks. The returned
object contains counts, source class counts and pair confusion counts only.
It contains no row, URL, title,
text, vector or model weight. Exceptions use fixed codes.

This is **intake and transport scaffolding with pair-only diagnostics**. It
cannot declare a candidate better from pair counts alone. It does not compute
transitive grouping, mixed Topic exposure, source deduplication, production
body-E5 parity or discussion
route churn, so its result cannot satisfy ADR-069's full E5-relative product
decision. The operator's rights declarations are checked for presence, not
verified for legal truth. Injected transport and model functions must be
trusted, reviewed local code: they can log or retain their arguments. The
transport must stop on abort; the five-second deadline is **not** a completion
guarantee and cannot stop a callback that ignores abort. Such a callback may
continue in the background after this function returns. Do not attach a real
transport until cooperative-abort tests and an independent Trust review verify
that contract.
JavaScript strings, operating-system swap and crash dumps cannot be reliably
erased by this module. A crash loses this module's in-process results; it does
not prove forensic deletion. No real acquisition or 200–250-pair review is
claimed by this scaffold.

Run fictional checks from the repository root:

```powershell
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/rights-ram-pilot-v1/core.test.js
```
