# ADR-062: Dynamic dashboard refresh without a listener

Date: 2026-10-08. Status: owner-requested implementation; verification in STATUS.

## Context and decision

The owner asked for a Refresh button and prefers the Topic Atlas to update
dynamically. The ADR-061 report was a one-shot HTML snapshot. A file opened in
the browser cannot itself query SQLite. Rather than add a new loopback port or
give the browser database access, the standalone Node program remains running
and reads only the local service database generation/revision. When it changes,
the program recomputes the existing allowlisted dashboard data and atomically
writes a sibling `snapshot.js` file. The report loads that local file on
Refresh and periodically while open, updating the map in place if the
snapshot changed. Its embedded initial data remains a fallback.

`npm start` owns this read-only watcher until Ctrl+C. `--no-open` remains a
one-shot export. No extension permission, new listener, provider request,
automatic web fetch, SQLite write, or new data category is introduced.
The local script contains only the same URL/title/Topic/coordinate/edge data
already present in the report; JSON serialization and browser-side validation
bound untrusted titles and URLs. The two files reside in the same private
OS-temp directory and can be deleted together when no longer wanted.

## Limits

Updates are best-effort after a short polling delay; they are not a live
database transaction in the browser. A stopped watcher leaves the last
snapshot readable but cannot generate new data. Refresh then reports no new
snapshot instead of falsely claiming success. The browser never runs code
from page content, and opening a source URL still requires a click. No
deployment, store, remote-access, or private-page approval follows.

Verification: eight restricted synthetic tests and a separate headless-Chrome
local-file bridge smoke pass. The real owner database was read only; no test
insert or service interruption was made. A running CLI was stopped via Ctrl+C
after confirming the watcher stayed active. Manual Refresh briefly waits for
the watcher poll, then reads the newest local file; it cannot force SQLite to
have completed an in-flight page ingestion.
