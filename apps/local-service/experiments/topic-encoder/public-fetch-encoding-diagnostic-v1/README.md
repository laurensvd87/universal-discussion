# Fixed failed-TRAIN response encoding diagnostic v1

Code-only until root and independent review plus separate execution approval.
Default `node run.mjs` / `python supervise.py` are inert. The only prospective
active mode is `python supervise.py --diagnose-encoding`. Do not run it during
code review. Existing output/markers prohibit another attempt; never erase or
retry evidence automatically. ADR141's 38/80 failed capture and every frozen
source/prefix remain immutable. This is not a cohort retry or a replacement row.

Only `https://fr.wikipedia.org/wiki/Guerre_froide`, its origin robots.txt and
the existing TDM policy URL are eligible. At most three requests, no alternate
URL, redirect following, retry, header override, limit increase or decompression
fallback. Robots/TDM decisions precede page fetch; >=2-second origin spacing,
declared crawl delays and absolute 45-second budget apply. The unchanged
`createPublicFetcher` performs DNS pinning, TLS remote verification, headers,
status/MIME/UTF-8, compressed/decompressed byte and ratio guards. No outcome or
cause is assumed in advance.

The observing request wrapper passes the **same options object**, including its
same pinned lookup callback, to `https.request`. The existing fetcher's response
callback runs first, installing/performing its original validation. Only then
are hash/count-only listeners attached. No resume/pipe/stream clone or retained
chunks. Header observations are a bounded projection of status, singleton safe
content-encoding (<=64 ASCII allowlisted characters) and digits-only
content-length (<=32). Duplicate/unsafe values are flagged, not printed.

Persisted transport facts are observed compressed-byte count, SHA256 only when
the observed stream ends within the unchanged compressed cap, completion/cap
flags, the bounded header projection and safe error metadata. Error output keeps
only `PublicFetchError.code` and an explicit cause-code allowlist (including
`ERR_BUFFER_TOO_LARGE`, `Z_BUF_ERROR`, `Z_DATA_ERROR`); no error text/stack, IP,
cookies, arbitrary headers, HTML, title, extracted text, decoded body or vectors.
An incomplete hash is not represented as a complete response hash. Instrumented
metadata does not turn a rejected response into an accepted one.

If the page fetch unexpectedly succeeds, the same existing quoted-metadata
pruner and static extractor check TDM/noindex directives transiently. Text and
body are discarded/returned buffers zeroed, never persisted. Such a success
does not explain the historical failure or justify retrying the cohort.

New D: output/TEMP and exclusive persistent markers; no browser, owner profile,
app, provider, model, crawler or DB. Supervisor uses the reviewed Win32 Job
handshake: hidden Node cannot reach fetch before assignment, no breakaway,
kill-on-close, <=128 membership-verified PIDs, 512 MiB Job commit plus summed
RSS/private caps, host available physical/commit >=1 GiB, C: >=768 MiB and
D: >=512 MiB free, 50 ms polling, 45-second wall. Conservative RSS may count
shared pages twice. Own Job termination requires a bounded five-second empty
PID-list/own-child-exit proof; failure is a failure receipt. No process-name kill.
Result <=32 KiB, combined logs/result <=256 KiB, no automatic deletion. Node
rechecks six source files before result publication, supervisor rechecks its
two source dependencies and metadata linkage. These are ordinary byte-drift
checks, not adversarial attestation or semantic/quality authority.

Safe code-only checks from repository root:

```text
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/experiments/topic-encoder/public-fetch-encoding-diagnostic-v1/run.test.mjs
node --check apps/local-service/experiments/topic-encoder/public-fetch-encoding-diagnostic-v1/run.mjs
python -c "import ast,pathlib; ast.parse(pathlib.Path('apps/local-service/experiments/topic-encoder/public-fetch-encoding-diagnostic-v1/supervise.py').read_text())"
```

Tests use invented headers and compressed bodies/injected DNS+HTTPS transport,
never actual network. They prove neither live Win32/remote behavior nor the
unknown encoding of the failed article response. No production activation.
