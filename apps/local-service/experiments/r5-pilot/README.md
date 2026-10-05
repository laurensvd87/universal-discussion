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
