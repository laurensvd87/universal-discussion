# Universal Discussion Layer

Use the repository-wide workflow in `AGENTS.md` as the shared project contract. This file is the GitHub Copilot entry point.

Before implementation, read `PROJECT_CHARTER.md`, `README.md`, and the referenced product, domain, AI, security, roadmap, research, and orchestration documents. Start with Phase 0 planning and research. Keep `plans/STATUS.md` current and record consequential choices in `decisions/`.

Preserve these invariants: semantic topics sit between content and discussions; AI identity and provenance are explicit; private AI output never becomes public silently; browsing data and provider credentials are minimized and protected; and irreversible external actions require owner approval.

Prefer small, testable changes with focused validation. Do not invent a stack or provider before the relevant research and ADR exist.