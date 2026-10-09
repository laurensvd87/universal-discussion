# Rights reviewed local event corpus v1

This is an operator supplied, local research intake for **at most 250 reviewed
pairs**. The eligible public page origins are European Commission, Council and
Parliament sites, Global Voices, and Wikinews. Each item needs its own ownership,
license, attribution and collection review. A site notice is evidence to inspect,
not blanket clearance. No existing private holdout, production matcher, model
training, extension, provider or live Topic data is read or changed.

Raw page text, URLs, titles if recorded, and the manifest stay in an explicit
private directory **outside Git**. This tool makes no network request and sends
no text to an AI provider. The operator obtains each eligible public item and
saves a plain UTF-8 article-text extract as `raw/<id>.txt` beneath that private
directory. Do not include comments, third-party images, unrelated page chrome,
secrets, private pages or inaccessible material. Maximum text file size is
100,000 bytes. The test files contain only fictional text.

Create `manifest.json` in the private directory. It has this shape (illustrative
field names only; keep actual item metadata and text outside the repository):

```json
{
  "version": 1,
  "createdAt": "2026-10-09T11:00:00.000Z",
  "items": [{
    "id": "item_001", "url": "https://<eligible-host>/<public-page>",
    "publisher": "<actual publisher>", "language": "en",
    "publishedAt": "2026-10-08T12:00:00.000Z",
    "capturedAt": "2026-10-09T12:00:00.000Z",
    "textFile": "raw/item_001.txt", "sha256": "<lowercase SHA-256 of exact UTF-8 file bytes>",
    "rights": {
      "noticeUrl": "https://<rights-notice>", "license": "<item-specific terms>",
      "pageOwner": "<verified owner>", "attribution": "<required credit and link>",
      "reviewer": "<local human reviewer>", "reviewedAt": "2026-10-09T11:59:00.000Z",
      "localResearchAllowed": true, "collectionAllowed": true,
      "thirdPartyMaterialExcluded": true
    }
  }],
  "pairs": [{
    "left": "item_001", "right": "item_002", "label": "same",
    "evidence": "<human explanation of event identity and stage>",
    "reviewer": "<local human reviewer>", "reviewedAt": "2026-10-09T12:01:00.000Z"
  }]
}
```

The second item in the illustrative pair must also appear under `items` in a
real manifest. `label` is `same`, `different`, or `uncertain`; uncertain pairs
are retained for review, never silently counted as same or different. A related
stage of one unfolding story needs human judgment documented in `evidence`.
Different translations from one article are not independent publishers.
`publisher` and rights claims are operator declarations; the validator checks
their presence and consistency, not their legal truth. Independent human review
and publisher independence must be audited before quality claims.

From the repository root, with Node 24 or later:

```powershell
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/rights-corpus-v1/core.test.js
node apps/local-service/experiments/topic-encoder/rights-corpus-v1/run.js inspect --private-dir C:\private\rights-corpus --manifest C:\private\rights-corpus\manifest.json
```

`inspect` checks source-domain scope, item-level rights attestations, local file
paths and SHA-256, pair references and labels, the 250-pair cap and expiry. It
prints only counts, source-class counts, a manifest hash and expiry time. Error
codes do not contain page content or paths. It does not export article records
or labels to Git. The operator may run `inspect` after each intake increment.
Later offline evaluators can import `loadLocalCorpus()` from `core.js` for an
in-process, validated read of items, text and reviewed pairs. That function
does not log or write them; consumers must keep them local and private.

The 30-day clock starts at `createdAt`; it is not renewed by adding items.
`inspect` refuses an expired corpus, but **does not delete it**. This tool has
no deletion command because path changes during a Windows delete could remove
files outside the intended directory. Before acquiring the first item, the
operator must arrange and verify deletion of the private corpus and any copies
or backups by that deadline using a separate trusted local process. Without
that arrangement, the approved 30-day retention condition is not met and
acquisition must not start. The manifest is not tamper-proof, so changing its
clock or assertions would invalidate the review record.

The private directory must be controlled by the operator while `inspect` or
`loadLocalCorpus()` runs. The reader limits file sizes before loading bytes,
checks regular files and hashes, and rejects apparent path changes. It cannot
guarantee safety against an attacker concurrently replacing Windows directory
links; do not run it against a writable shared directory.

No score threshold or full-event-recall requirement is imposed by this intake.
For later method comparison, use the existing E5 set as the quality reference;
an approach that improves safe useful coverage may be preferable even when it
misses some valid pairs. Any product training, model distribution or live Topic
routing remains a separate gate.
