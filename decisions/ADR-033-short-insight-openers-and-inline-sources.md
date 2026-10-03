# ADR-033: Short insight openers and inline source links

Date: 2026-10-03
Status: local prototype implementation; no new provider or publication approval

## Context

The owner wants the first AI contribution to read like a useful, brief forum
opener, with more detail only if someone asks later. Earlier research-style
answers were long and sometimes led with inaccessible candidate URLs. The
current request supplies the bounded text prefix of the displayed page and
candidate titles/URLs; the optional ChatGPT web tool is domain-restricted but
does not guarantee that it opens a particular URL. A title or link alone is
not evidence that the page was read.

The existing provider result already has structured `url_citation` annotations
with URL, title and offsets. A separate plain-text URL list is unwieldy in a
discussion and makes it hard to see which claim a source supports.

## Decision

- Ask for one English, roughly 45–90-word (never more than 120-word target)
  conversation starter about the current page: one concrete observation,
  implication or verified contrast, optionally one useful question. This is a
  prompt target, not a guaranteed word-count validator. The page prefix stays
  primary; candidate pages are evidence only after verified retrieval. If a
  candidate cannot be reached, use available evidence and note the limitation
  only when it changes the conclusion. Never invent a source or claim that the
  unread remainder of the current page is silent.
- Use the provider's structured URL annotations as the machine-readable source
  format. The extension validates their offsets and public URLs and renders a
  small, accessible, clickable source icon inline at the supported span. Do
  not ask the model to invent free-form citation tokens or print a raw URL list.
- Preserve recognized inline source references in the AI-labelled post body
  when its human operator separately previews and shares it. The narrow link
  syntax is display data, not trusted HTML or an instruction. The source-page
  origin link remains separate from research citations. Human comments remain
  ordinary plain text.
- Model-written links lacking structured citation annotations are not silently
  upgraded to source icons. In the generated draft, unannotated raw URLs are
  replaced with a non-link placeholder; only validated annotations insert the
  persistable inline marker. After human editing or sharing, that marker is
  labelled neutrally as a source link, not as proof of provider attestation.
- No automatic provider follow-up is added. A later requested AI reply in the
  conversation needs a separately designed user trigger, bounded discussion
  context and egress/usage review; it is not implied by this first-post prompt.

## Boundaries

This changes neither background capture nor what is sent to ChatGPT. It adds
no search integration, URL fetcher, model, extension permission, paid retry,
automatic publication or remote service. Web research may still fail on a
publisher page even when that page loads in the user's browser; browser cookies
and logged-in access are not sent. An AI operator can edit a draft before
sharing, so the UI must not imply that every post-share source link was
cryptographically attested by the provider. Source links must pass the same
public-URL policy at render time and cannot become executable markup. The
private text editor displays the narrow marker syntax; the preview and posted
discussion render its icon.

## Evidence

The [OpenAI web-search guide](https://developers.openai.com/api/docs/guides/tools-web-search)
documents optional tool use, domain filters, and structured URL-citation
annotations. The [citation-formatting guide](https://developers.openai.com/api/docs/guides/citation-formatting)
requires clear, clickable source citations. Focused tests and the final
extension suite are recorded in `plans/STATUS.md` after integration. The one
synthetic live provider call before this change proved parser reachability,
not this prompt's real-page quality.
