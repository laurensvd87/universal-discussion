# ADR-052: Insights use supplied page text, not provider web search

Date: 2026-10-07
Status: historically implemented in 0.13.15; narrow provider-search rule superseded by ADR-053 in 0.13.16

The owner later clarified that the current user's visit cache cannot supply
pages visited by other users, and explicitly approved bounded ChatGPT HTTP
research. [ADR-053](ADR-053-bounded-chatgpt-source-research-fallback.md)
supersedes only this ADR's blanket no-web-search rule when a deliberate
Insight has selected eligible public related URLs without accepted excerpts.
The no-raw-text-retention and explicit-share boundaries remain.

## Decision

The owner explicitly rules out ChatGPT web-search calls for Insights. An
Insight may use only the current tab's bounded, reattested public article
prefix and public related-page excerpts that the extension itself retrieved
from already-selected local Source URLs. The Responses request must contain
no `web_search` tool, even if an older extension sends the legacy
`allowWebResearch: true` flag. Prompts must not ask the model to open URLs or
search. Legacy settings must not re-enable the tool. The model may attribute
supplied related excerpts with ADR-051's validated `[[ref:n]]` markers.

This is not a promise of an external citation on every Insight. The related
reader still makes at most four anonymous direct HTTPS attempts per explicit
Get insights click, with existing URL/host-access, redirect, content-type,
size, parsing and short-text rejection rules. It supplies at most 2,048
characters per accepted page and retains no related raw text in SQLite. When
all attempts fail or concern a different specific story, the Insight may have
no external citation. Do not manufacture a citation from a vector neighbor or
from a model-written URL.

## Evidence and boundaries

The owner's De Standaard Kyiv article had one local same-Topic candidate with
the same article ID under a different slug; the next selected candidates
concerned broader Russia/Ukraine military news. A read-only replay of those
four selected URLs through the existing anonymous reader accepted zero
excerpts (three fetch/HTTP/redirect failures, one parse/short failure). This
does not prove what Chrome accepted on the owner's exact click, but it
explains how a successful citation-free result can occur. Two recent
content-free service traces recorded zero provider web-search calls; they
cannot be tied conclusively to that click.

No new page fetches, permissions, raw-text retention, provider, API key,
automatic Insight/post, Topic change, or publication are authorized by this
decision. Sending longer or session-cached text from previously visited pages
would be a separate privacy/retention/provider-data decision.

## Verification

No-tool request-envelope and legacy-true tests show `tools: []` and a
supplied-only prompt; extension tests show a hard-coded false flag with the
old control removed. Existing related-excerpt forwarding and validation
remain covered. Full restricted extension suite passed 973/973; service suite
passed 238/242 with four optional skips; loopback integration passed 2/2.
Both secret scans found zero findings. Independent read-only Trust review
found no blocking search/retention issue. The service was restarted with its
same Origin and durable pairing. No live provider request was needed or made
for this change. The owner must reload the unpacked extension to remove its
old search UI. The separate session-only cache question remains unanswered.
