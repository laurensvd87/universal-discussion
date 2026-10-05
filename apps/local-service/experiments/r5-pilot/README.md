# R5 one-page provenance pilot

`one-url.js` handles one operator-selected English editorial article at a time
from exactly `en.wikinews.org`, `globalvoices.org`, or `www.voanews.com` over
HTTPS. It accepts no URL query or fragment. The operator must inspect the
specific page and its rights notice before supplying the metadata and evidence
fields below. `--published` is a source date (`YYYY-MM-DD`) with
`--publication-precision day`, or an actual UTC timestamp with
`--publication-precision instant`; the command does not invent a midnight time.

The accepted path opens a fresh temporary Chrome profile, allows one exact
top-level document request, and blocks redirects and page subresources. It
uses the packaged production `collectPageContent` reader in an isolated world
and the packaged browser E5 model. It saves URL, title, manually reviewed
publication date/time and provenance, extractor/model IDs, input SHA-256, and
one 384-value vector. Article text is processed transiently and is absent from
the saved JSON and logs. Chrome may briefly write browser data in its temporary
profile despite cache-disabling settings; the owned profile is removed after
the browser closes. No summary is generated or saved during acquisition.

The evidence JSON records the reviewed page URL, metadata-origin URL, rights
evidence URL and observation time, license ID, rights basis, title-rights
decision, publisher-originality decision, attribution URL, disposition, and
reason code. `evidenceSha256` hashes this **reviewer-declared record** in fixed
field order; it is not a hash of the publisher policy page. Accepted records
require `permitted` title rights, `publisher-original`, and the accepted reason
code. A rejected disposition writes a provenance-only record and does not open
Chrome. The operator must not put article excerpts in any argument.

All records and `inventory.json` go only under the Git-ignored
`spikes/topic-resolution/review/work/r5-pilot/` path. The inventory records a
digest of saved record files. The writer rejects a duplicate URL and stops at
24 total saved URLs, including rejections. Stdout is metadata-free status only:
`{"status":"saved"}` or `{"status":"recorded"}`. The command has no owner
service/database, provider call, crawler, account session, or model download.

Synthetic example; replace each value after reviewing the real page and terms:

```powershell
node one-url.js --url https://en.wikinews.org/wiki/ARTICLE_NAME --published 2024-01-03 --publication-precision day --publisher Wikinews --rights-url https://en.wikinews.org/wiki/Wikinews:Copyright --metadata-origin https://en.wikinews.org/wiki/ARTICLE_NAME --evidence-at 2026-10-05T12:00:00Z --license-id CC-BY-4.0 --rights-basis site-policy-and-page-notice --title-rights permitted --originality publisher-original --attribution-url https://en.wikinews.org/wiki/ARTICLE_NAME --disposition accepted --rationale verified-original-editorial-and-title-rights --english-reviewed
```

For a rejection, use `--disposition rejected`, a reason such as
`unclear-license`, and the actual `--title-rights` and `--originality` values.
The rejected record contains no title, text, or vector. The real public
network path has not yet been exercised; a publisher page may abstain if it
requires blocked subresources or the reader cannot qualify its article region.

Run the synthetic checks from this directory:

```powershell
node --import ../../../../spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none capture.test.js one-url.test.js save-record.test.js
node --test --test-isolation=none browser-capture.test.js
```

## Local owner review

`node owner-review.js prepare` reads the accepted records, verifies the existing
inventory digest and creates one frozen, create-only task under the sibling
Git-ignored `review/work/r5-owner-review/task.json` path. The task binds each
source file's SHA-256 and the inventory SHA-256; its envelope binds the whole
task with the existing canonical JSON SHA-256 algorithm. Preparation refuses
an existing snapshot. Later captures cannot change the frozen pair IDs.

`node owner-review.js view` (or no argument) reads only that frozen task and
refuses if none exists or its digest fails. It shows up to 30 deterministic
opaque pairs with public titles, URLs and source dates, followed by blank
`Label` and `Rationale` fields. It does not compute similarity, generate labels,
or show scores, vectors, input digests, rights details or construction hints.
The owner has already seen some scores, so this is an exploratory owner review,
not a blinded or independent quality benchmark. Save annotated output only
inside the Git-ignored review workspace. The existing distinct-role completion
ledger has different independence requirements and is not used here.

Synthetic check:

```powershell
node --import ../../../../spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none owner-review.test.js
```
