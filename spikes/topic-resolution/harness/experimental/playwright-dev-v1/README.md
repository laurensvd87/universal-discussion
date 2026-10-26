# Isolated Playwright development transport — not activated

Pinned official `playwright-core`1.64.1, npm metadata license Apache-2.0,
no package dependencies and no browser download. Registry metadata was fetched
through the bounded public HTTPS/DNS-pinned fetcher. Expected package integrity:

    sha512-BC4s8y6SEVA6Q1rSxZTto8hI1KUI3xXlHGZgvGqP4IqPdI/a6FX9H29IDNz7vKo9l21b6LfYosScPL6M3xxyDQ==

Installation uses a separate D: prefix/cache/TEMP, ignored install scripts,
empty dedicated user/global npm configs and a credential-stripped child
environment. It must not change the application's manifests, dependency locks,
runtime, protected login/pairing, running crawler or frozen capture studies.
Installed dependencies are local generated files, not a production deployment.

The four-consumed-TRAIN-control DEV harness is under review. No browser
has launched, and default imports must remain inert. Actual use requires root
and independent code review, a fixed source/package freeze and an explicit
owned-Job supervisor run. Each article uses a fresh context with no prior storage;
routes and socket denial must be installed before its sole page is created.
Only bounded hashes and compatibility metadata may be retained, not article text.
The profile/TEMP is fresh on D:, never the owner's existing browser profile.
Playwright is not a substitute for these fences; its API alone does not reproduce
the older raw4MiB/128-command transport bounds. Installed Chrome compatibility
requires testing; it is not assumed. No old failed study may be resumed or scored.

The new witness binds the exact admitted Playwright Request object to its
Response, plus separate frame/loader/isolated-world observations. It explicitly
does not claim cross-API Network.requestId correlation or native attestation.
No app access, E5, classifier, pairing, provider request or post belongs in this
compatibility test. See ADR147 for the prospective boundary.

Only the fresh output/TEMP/profile tree is metadata-budgeted at 512MiB and
8192 entries, with continuous drive reserves. Normal success requires an empty
own Job; emergency termination is recorded as failure. Package cleanup may
remove its own ephemeral profile; this harness has no recursive-delete command.

The root-written `freeze.json` must contain schema
`playwright-current-reader-dev-freeze/v1`, the exact ordered `sourceHashes`,
`protocolSha256` and `freezeHash`. The last value is SHA256 of JSON.stringify
of the preceding fields in that order. Sources include the fixed own/dependency
map and the entire installed package tree, not just its entry module. The
supervisor and Node recheck those bytes; neither creates a freeze or retries an
existing output directory. After review and freezing only, the fixed command is:

    python spikes/topic-resolution/harness/experimental/playwright-dev-v1/supervise.py --run-dev

Default invocation is inert. Synthetic policy/event/fence/helper tests do not
establish browser compatibility; only the separately supervised run can do that.

Official references:

- https://playwright.dev/docs/api/class-browsertype
- https://playwright.dev/docs/api/class-browsercontext
- https://playwright.dev/docs/api/class-cdpsession
- https://playwright.dev/docs/api/class-response
- https://github.com/microsoft/playwright/blob/main/LICENSE
