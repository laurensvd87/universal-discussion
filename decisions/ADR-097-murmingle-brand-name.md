# ADR 097 Murmingle brand name and extension presentation

Date: 2026-10-12

Status: Owner-approved local presentation change, extension 0.13.51.

## Decision

Use **Murmingle** as the product name and **Where conversations meet.** as its
primary tagline. The name and tagline appear in the extension header. Chrome's
extension name, toolbar action label, document titles and dynamic toolbar status
labels use Murmingle as well.

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

Require package assertions for the manifest and toolbar text, shared popup and
side-panel markup assertions for the visible brand/tagline and preserved live
connection status, the restricted browser regression suite, and an isolated
Chrome community layout check at the existing narrow widths.
