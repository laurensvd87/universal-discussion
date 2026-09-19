# ADR-002: Browser observation and data-egress boundary

Status: Accepted for the user-invoked direction; connected-use gate open

Date: 2026-09-19

Owners: Product/client, trust/security/privacy

## Context

The initial success question assumes a person can encounter an activity indicator while browsing. A passive indicator normally requires access to page URLs or content before a user gesture. Those observations can expose sensitive browsing behavior and trigger extension warnings, consent duties, retention risks, and store review.

## Decision

For the first connected prototype, use a user-initiated action with gesture-scoped `activeTab` access. Process only public HTTP(S) pages on a reviewed domain/path allowlist. Do not run in private/incognito mode, on obvious local/private-network targets, browser-internal pages, or files. Authentication/sensitivity cannot be detected reliably on a public hostname, so the allowlist, an explicit warning not to invoke the tool on signed-in/sensitive pages, and a documented residual risk replace any claim of perfect exclusion.

Before any request leaves the browser, define and test an allowlisted egress object. The default proposal contains a normalized origin/path and explicitly allowed public metadata; it excludes URL credentials, fragments, unreviewed query values, cookies, headers, full browsing history, DOM/page text, account identifiers, and telemetry. Application/proxy logs must not reconstruct a browsing history.

This decision intentionally does not claim to validate a passive indicator. A passive, per-site, or all-sites experiment requires a follow-up decision covering consent, permissions, data fields, account linkage, retention/deletion, sensitive-site exclusions, telemetry, and store disclosures.

The owner confirmed the user-invoked `activeTab` direction on 2026-09-19 after reviewing the limitation that it does not test passive discovery. Trust review supports this least-privilege direction. Acceptance does not approve any URL/data egress, real-user collection, deployment, or store submission; those remain behind the connected-use gate below.

## Alternatives considered

- Required `<all_urls>` or equivalent host access: best indicator coverage, highest privacy and adoption risk.
- Optional per-site host access: clearer control but fragmented coverage and onboarding complexity.
- Tabs permission for URL-only observation: less page access than content scripts, but still continuous browsing visibility.
- User gesture / `activeTab`: least privilege, but cannot show a data-backed pre-click count.
- Local-only bloom/filter index of active sources: promising later experiment, but freshness, size, and privacy leakage need a design.

## Consequences

- The first browser increment tests panel usefulness and the page-to-topic flow, not passive discovery CTR.
- Cross-browser UI adapters remain separate because Chrome and Firefox sidebar APIs differ.
- Product must decide whether the passive discovery hypothesis justifies broader, clearly consented access.

## Security/privacy/cost impact

This minimizes browsing-data exposure and avoids continuous background transmission. It does not eliminate legal review: a user-initiated URL may still be personal data in context. No production telemetry is allowed until purpose, controls, retention, and deletion are defined.

## Validation / connected-use gate

Owner acceptance of this ADR approves the least-privilege, user-initiated direction and the limitation that it does not test passive discovery. It does not authorize browsing-data egress or real-user collection. Before any connected use, produce:

- threat-model review of the exact manifest and data flow;
- automated permission/egress snapshot tests;
- tests for private/local exclusions, the reviewed allowlist, and the user warning/residual-risk behavior;
- proxy/application log inspection proving excluded fields are absent;
- current Chrome/Firefox policy review; and
- owner approval of the exact experiment and residual risks.

Rollback disables the feature, revokes its permissions, and immediately purges primary/cache observation records. The approved retention record must define when access logs and backups expire or are deleted, how that SLA is verified, and any legal hold exception; rollback must not imply impossible synchronous erasure from every backup.
