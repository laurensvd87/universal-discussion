# ADR-058: Selected URL reference IDs for ChatGPT research

Date: 2026-10-08
Status: implemented locally; PCGames remains a verified provider-access limit

## Owner direction and boundary

After the PCGames `response-web-citation` diagnosis, the owner directed that
ChatGPT name only the URLs supplied by the app as `ref1`, `ref2`, and so on.
This chooses strict selected-URL links over ADR-057's proposed same-publisher
relaxation. A model-written ID alone does **not** prove it read that URL or
that the linked article supports the claim. The app must not turn an invented
ID into a false clickable attribution.

The service now assigns `ref1`–`ref5` in the existing selected candidate order
and supplies this exact mapping to the explicit ChatGPT request. The prompt
asks for `[[webref:n]]` beside a supported related-page claim and no other
source links. The Responses request asks for
`web_search_call.action.sources`, documented by OpenAI as the URLs consulted
by the search. A completed answer's marker becomes a source link only when a
completed search reports that exact selected URL. Unknown/malformed IDs and
provider annotations to any unselected URL still fail closed. The source
list does not establish full-page access or claim-level support; private
review and a separate Share action remain required. Legacy `[[ref:n]]`
remains distinct for supplied excerpts. The popup can format up to five
attested web IDs into its existing clickable superscript UI.

No new extension permission, automatic AI call/retry/share, related-page HTTP
fetch, retained page text, or remote service was added. The optional raw local
debug mode, when explicitly enabled, can now contain the returned source list;
default logging remains content-free. Publication and broader provider/privacy
gates remain separate.

## Verification and unresolved product limit

One live owner-authorized public PCGames/GameStar QA request with the initial
ref-capable prompt still emitted an unselected GameStar provider citation;
it was rejected. A second request with a stricter ref-only prompt emitted
one `[[webref:n]]` but the tool returned **zero** exact selected-URL source
hits. It too was rejected, without logging raw text/URLs or sharing a post.
These two outcomes demonstrate why ID substitution alone cannot guarantee a
truthful related-page citation. The regular local service was restarted with
the same Origin, pairing, and SQLite state. No automatic retry was made.

The safe ref path is implemented and offline-tested, but **does not resolve
this PCGames case**. If ChatGPT cannot report a selected URL as consulted,
the user can turn related research off for a current-page-only Insight; an
automatic second provider request or attribution to an unverified URL is not
authorized. Any decision to accept model-only IDs, cite an unselected source,
or add an automatic fallback requires an explicit new owner trust/usage choice.

Official tool contract: https://developers.openai.com/api/docs/guides/tools-web-search
