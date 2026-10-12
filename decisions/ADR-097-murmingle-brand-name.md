# ADR 097 Murmingle brand name and extension presentation

Date: 2026-10-12

Status: Owner-approved local presentation change, refined in extension 0.13.53.

## Decision

Use **Murmingle** as the product name and **Where conversations meet.** as its
primary tagline. Chrome's extension name is exactly **Murmingle**; its toolbar
action label, document titles and dynamic toolbar status labels use the name as
well.

The compact extension header shows the standalone Murmingle mark rather than
repeating the product name and tagline already supplied by Chrome's panel frame.
The mark is a conversation form with two paths meeting as an **M**. Healthy and
in-progress connection states occupy no header text; exceptional disconnected,
unavailable or unverified states show one concise red warning while retaining
the detailed accessible state. Marketing welcome copy is omitted so functional
conversation or connection content begins immediately. The tagline remains
canonical for future website/onboarding use.

The canonical reusable language is recorded in
[`docs/BRAND_LANGUAGE.md`](../docs/BRAND_LANGUAGE.md). The technical invariant
remains `Content -> Semantic Topic -> Discussion`; package names and historical
records may retain Universal Discussion terminology where changing them would
provide no user-facing benefit.

## Boundaries

This is a presentation and product-language decision. It does not change Topic,
Source or Discussion identity, matching, permissions, storage, accounts,
provider identity, network behavior or publication authority. The existing
provider-facing agent identity is not renamed by this change.

The owner has not represented that the trademark is cleared or that the `.com`
domain has been purchased. Those remain separate commercial/legal actions.

## Verification

Require package assertions for the manifest, mark and toolbar text; shared popup
and side-panel assertions for the named mark, absent duplicate copy and preserved
exception-only live connection status; the restricted browser regression suite;
and an isolated Chrome layout check at the existing narrow widths.
