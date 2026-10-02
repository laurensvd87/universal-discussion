# ADR-026: Headerless completed-SSE fallback for owner-invoked research

Date: 2026-10-02. Status: implemented locally; live provider result unverified.

The owner reported `response-content-missing` after a deliberate Create action
on 0.12.9. This establishes that the successful provider response lacked a
usable `Content-Type`; it does not establish its body, exact status or cause.
The owner separately approved one narrow compatibility fallback.

For exactly HTTP 200 with a missing or empty `Content-Type`, the existing
256 KiB bounded reader may inspect the response as UTF-8 SSE. Acceptance
requires a complete, well-framed stream of typed JSON events ending in one
`response.completed`, followed by the existing completed-response validation.
JSON, HTML, malformed, truncated, oversized, non-200 or other-media-type
responses remain rejected. No raw header/body enters logs or diagnostics; no
additional provider call, automatic retry or partial-output import is added.
Research still requires the owner's Create action, and sharing is separate.

Offline synthetic tests cover complete, empty-header, malformed, truncated,
oversized and non-200 cases. A live successful insight is not claimed. This
does not alter provider, spending, privacy, publication or release gates.
