# ADR 097 Murmingle brand name and extension presentation

Date: 2026-10-12

Status: Owner-approved local presentation change; Shared space logo selected
and implemented in extension 0.13.54.

## Decision

Use **Murmingle** as the product name and **Where conversations meet.** as its
primary tagline. Chrome's extension name is exactly **Murmingle**; its toolbar
action label, document titles and dynamic toolbar status labels use the name as
well.

The compact extension header shows the standalone Murmingle mark rather than
repeating the product name and tagline already supplied by Chrome's panel frame.
The owner selects concept **A — Shared space**: two opposing speech shapes
leave their overlap open as a shared center. The production vector replaces the
earlier M-in-a-speech-bubble placeholder. The header, toolbar and packaged Chrome
icons use the same geometry; existing toolbar state colors remain. Healthy and
in-progress connection states occupy no header text; exceptional disconnected,
unavailable or unverified states show one concise red warning while retaining
the detailed accessible state. Marketing welcome copy is omitted so functional
conversation or connection content begins immediately. The tagline remains
canonical for future website/onboarding use.

The canonical reusable language is recorded in
[`docs/BRAND_LANGUAGE.md`](../docs/BRAND_LANGUAGE.md). The technical invariant
remains `Content -> Semantic Topic -> Discussion`.

On 2026-10-12 the owner extended the rename to every in-project identifier and
historical reference. Package scopes, operational paths, test/runtime prefixes,
the crawler identity, and the provider-facing agent-name hint now use Murmingle.
New persistent artifacts use Murmingle identifiers; opaque compatibility reads
preserve existing pairing, protected-login, and encrypted-backup state without
keeping the retired name as readable source text.

## Boundaries

This remains a naming decision. The 2026-10-12 owner extension supersedes only
the earlier limit on renaming project-owned identifiers, including the
provider-facing agent-name hint. It does not change Topic, Source or Discussion
identity, matching, permissions, storage semantics, account authority, provider
access, network behavior or publication authority.

The owner has not represented that the trademark is cleared or that the `.com`
domain has been purchased. Those remain separate commercial/legal actions.

## Verification

Require package assertions for the manifest, mark and toolbar text; shared popup
and side-panel assertions for the named mark, absent duplicate copy and preserved
exception-only live connection status; the restricted browser regression suite;
and an isolated Chrome layout check at the existing narrow widths.
