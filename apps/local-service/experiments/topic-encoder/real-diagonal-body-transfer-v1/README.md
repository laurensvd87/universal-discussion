# Body-prefix transfer protocol

Offline, RAM-only, one-shot GlobeSumm research under ADR-065/069. Review and
hash-freeze this protocol before opening the private corpus. This asks whether
the **unchanged** 384-parameter adapter fitted to title plus normalized 384
characters of lead transfers to body-only E5. The 475 fit rows, 40 fit steps,
274 calibration rows, double-support rule, and relative coverage screen are
identical to the fresh title/lead experiment. Fit once from title/lead E5;
do not fit or tune on body vectors. Re-embed the 274 calibration rows from
normalized article body prefixes of up to 4096 characters and separately
calibrate raw body E5 and transformed body E5. No evaluation label influences
weights or cutoffs. Score the selected events once, using the same body input
and graph for both methods.

Reconstruct the old 1,192 main selection and 298 preliminary selection, then
the exact 292-article `real-diagonal-fresh-v1` selection. Exclude all their
whole events and any other event with a matching normalized title/384-lead
input key. SHA-256 over `body-transfer-v1\0` plus the event key orders remaining
whole events; greedily add those fitting the fixed 300-article budget. Require
250–300 selected articles. No selection, cutoff, or model choice changes after
the private one-shot run. If exclusions or counts are uncertain, stop.

The parser applies its existing NFKC, whitespace collapse and replacement of
only E5-contract-forbidden control characters with spaces before taking the
4096-character body prefix. This bounded sanitization was used by
`real-input-v2`; no event-dependent exclusion or substitute text is allowed.

Report only aggregate denominators; direct true/false edges; grouped true/
false pairs; pure multi-page article reach; mixed-group exposure; cross-language
and duplicate-adjusted support; complete events diagnostically. A relative
research gain requires nondecreasing pure-group article and correct grouped-pair
reach, a strict gain in either, and no increased direct false edges, grouped
false pairs, or mixed-group exposure. Zero observed errors do not establish
future precision. This is a **normalized GlobeSumm body surrogate**: it is not
the exact text selected and rendered by Chrome, nor independent publisher or
viewpoint evidence. It cannot establish live Source/root migration safety or
product rights for real-trained parameters.

Verify source and packaged-asset hashes before any private read. The runner
allows only absolute paths outside the repository, checks exact corpus size and
SHA-256, denies external capabilities, and emits aggregate JSON or fixed error
codes. It never writes weights, vectors, text, IDs, or per-row scores. Do not
redirect output into Git. Run fictional tests and `--dry-run` first. An actual
private-corpus run requires review of the frozen manifest; it is not part of
protocol preparation.
