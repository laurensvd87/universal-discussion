# ADR-083: Arrow-only presentation of provider Markdown citations

Date: 2026-10-11.
Status: owner-requested formatting correction; implemented and independently
verified in extension 0.13.41.

## Evidence and decision

The owner reports a useful source arrow preceded by a duplicate Markdown source
label with a non-navigable omitted-link placeholder. The shared formatter treats
non-token annotated spans as prose: it preserves the Markdown source wrapper,
neutralizes its raw URL, then appends the accepted source arrow. Existing tests
cover citation transport and arrows but do not cover this citation-only wrapper.

Replace only recognized citation-only Markdown link spans, optionally enclosed
in parentheses, with the existing arrow when their exact destination matches
the already-validated citation. Keep genuinely cited prose. Unsupported markup,
unannotated destinations, contradictory URLs, unsafe links and malformed spans
gain no authority. The shared formatter remains the single body transformation
used for result display and service-side exact-body sharing proof.

Already saved duplicate omitted-link labels can be suppressed in presentation
only when immediately adjacent to an existing safe arrow and their domain matches
its destination host. Do not rewrite old posts, infer a missing destination,
strip arbitrary prose or suppress unverified-source qualifiers.

The official [OpenAI web-search guide](https://developers.openai.com/api/docs/guides/tools-web-search)
describes URL/title/span annotations and requires visible, clickable inline
citations. It does not require displaying literal Markdown source wrappers. The
OpenAI Docs skill informs preservation of those annotations and clickable arrows,
not acceptance of additional URLs or intermediate stream events.

## Verification and scope

Focused normal/strict-fallback and renderer tests cover exact Markdown wrappers,
ordinary prose, mismatches, raw/unannotated links, repeated citations, Unicode
spans and already-saved duplicates. Disposable Chrome uses synthetic data only.
No new live inference is needed or authorized by this formatting change; the
previous agent diagnostic budget remains exhausted. The normal backend must load
the same checked formatter as the extension, preserving login/pairing/SQLite.
No source selection, provider request, retry, data scope, permission, migration,
publication or store-release approval follows.

Completed checks: focused formatter 14 pass; independent service/runtime proof/
SQLite-reopen/render tests 86 pass. Full service 400 pass/4 optional skips;
extension 1,117 pass/1 optional skip; restricted 1,118 pass. Synthetic disposable
Chrome checks old/new/private/published arrow-only examples, exact hrefs, safe
inert markup and previous regressions. Root reviews the saved-example screenshot.
Secret/diff checks pass. Normal service restarted only after no active provider
connection, with original pairing/login/database/Origin and raw debug off.
STATUS and IMPLEMENTATION_HANDOFF record the final evidence.
