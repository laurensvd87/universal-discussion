# Murmingle brand language

## Brand

- Product name: **Murmingle**
- Capitalization: `Murmingle`, never `MurMingle`
- Pronunciation: **MUR-min-guhl**
- Primary tagline: **Where conversations meet.**
- Compact positioning line: **The web, in conversation.**

## Product promise

Murmingle brings conversations about the same subject together, even when the
people and source material are spread across different pages. Its product model
remains:

`Content -> Semantic Topic -> Discussion`

The name suggests many voices gathering into one conversation. It should feel
human, curious and welcoming rather than technical or institutional.

## Mark and product surfaces

The owner selected **A — Shared space** from the
[logo concept board](brand/murmingle-logo-concepts.png) on 2026-10-12.
The mark uses two opposing, diagonally offset speech shapes. Their overlap is
left open, making a shared central space between the two voices. It contains no
letter. This replaces the earlier M-in-a-speech-bubble placeholder.

Use the standalone mark where the surrounding surface already names Murmingle,
such as Chrome's side-panel frame. The vector geometry is the master artwork;
the SVG, toolbar and packaged Chrome icons use the same geometry from
[`murmingle-geometry.js`](../spikes/topic-resolution/browser/chromium/murmingle-geometry.js).
The transparent [SVG](../spikes/topic-resolution/browser/chromium/icons/murmingle.svg)
is the reusable vector asset. The concept board
records the selected direction, not production vector coordinates or typography.

Use soft periwinkle **#AEB5FF** on a dark **#141519** surface, or a single dark
color on a light surface. Keep the central opening transparent and use one color
for both speech shapes. Preserve the proportions, opposing tails and negative
space; do not fill the center, stretch the symbol or add a letter. Leave at least
one quarter of the symbol's width as clear space around it in a brand lockup.
The header's 28px mark and Chrome's 16px icon are the small-screen reference sizes.
Toolbar colors continue to communicate the existing connection/Topic states.

Chrome's static icons place the periwinkle mark on a rounded dark square, as in
the approved preview, so it remains legible in light and dark browser frames.
Regenerate 16/32/48/128px PNGs with `node harness/generate-murmingle-icons.js`
from `spikes/topic-resolution`. The local Chrome renderer checks the transparent
center and both speech shapes at 16/24/28/32/48/128px and compares SVG/Canvas
pixels before writing icons.

The compact extension header uses the mark without repeating the product name
or tagline. **Where conversations meet.** remains the primary brand line for a
website, onboarding and other surfaces with room to introduce the product.

## Reusable copy

### One sentence

Murmingle is a conversation layer for the web, bringing discussions about the
same topic together across pages.

### Short introduction

Read from different sources. Meet around the same topic. Continue the
conversation wherever you find it.

### Interface language

- Join the conversation.
- See what people are saying about this topic.
- Continue the conversation across the web.
- No comments yet. Start the conversation.

Use **Murmingle** as the product or place. Do not force it into a verb in routine
interface copy.

## Usage guardrails

- Lead with conversation and people; explain semantic matching only when useful.
- Do not describe Murmingle as merely comments attached to URLs.
- Keep Topic, Source and Discussion meanings aligned with the domain model.
- Do not imply that related pages are identical, that matching is infallible, or
  that private AI output is public.
- The name decision does not assert trademark registration or domain ownership.
