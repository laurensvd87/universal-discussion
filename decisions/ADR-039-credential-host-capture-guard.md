# ADR-039: Exclude obvious credential and account hosts from future capture

Status: accepted as a safety correction within the existing public-page-only
capture scope, 2026-10-04. No new data collection or permission is approved.

## Context

A read-only audit of the owner-local Source catalog found a retained URL on
an account/credential host. No page body or credential was read for this
audit, and no catalog item was used in the live provider quality probe.
The previous shared URL policy rejected sensitive path components and some
host prefixes, but accepted credential-specific host labels such as
`passwords.google.com`. A separate public-only browser profile remains the
principal boundary because syntax cannot prove whether a page is signed in.

## Decision

The shared extension page URL policy rejects exact host labels `password`,
`passwords`, `account`, `accounts`, `auth`, `login`, `signin`, `sign-in`, and
`sso` at any subdomain depth before future capture. Public article paths and
merely similar labels remain eligible. This intentionally favors a rare false
negative for public articles on such a host over silent capture of an obvious
credential/account site. The same policy may make historical links on these
hosts non-clickable; their retained rows and discussions are not deleted.

This is a narrow prevention fix, not a general authenticated-page detector.
Generic hosts, custom account names and user-entered page text still require
the dedicated non-sensitive profile and existing owner guidance. No provider
data egress, storage migration or retrospective deletion is introduced.
Cleanup of retained entries requires separate owner direction.

Focused policy tests and the full extension suite pass; an independent
read-only trust review found the change a safe narrowing and confirmed its
limitations. See [STATUS](../plans/STATUS.md) for counts.
