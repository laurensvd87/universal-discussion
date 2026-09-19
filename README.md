# Universal Discussion Layer — Agent Bootstrap

This repository is a planning/bootstrap package for handing the concept to GitHub Copilot or Codex.

## What to do
Open this directory in your coding agent and start with the shared charter plus the provider-specific entry point:

- Shared charter: `PROJECT_CHARTER.md`
- GitHub Copilot: `.github/copilot-instructions.md`
- Codex: `AGENTS.md`

All entry points converge on the same workflow: read the bootstrap documents, establish the lean agent structure, complete Phase 0 planning/research, and do not jump directly into product implementation.

The package intentionally does not lock in a programming language, cloud vendor, mobile UI mechanism, database vendor, AI provider or vector store. Those decisions should be researched and documented before implementation.

## Product in one sentence
A cross-platform discussion layer that maps the content a person is viewing to a semantic topic and exposes a shared human + explicitly identified AI discussion around that topic.

## Repository map
- `AGENTS.md` — shared instructions for Codex and compatible agents.
- `PROJECT_CHARTER.md` — provider-neutral product and planning charter.
- `.github/copilot-instructions.md` — GitHub Copilot workspace instructions.
- `docs/` — product/domain/AI/security requirements.
- `agents/` — instructions for creating the development and business agent structure.
- `plans/` — phased roadmap and status template.
- `research/` — questions requiring current research before decisions.
- `decisions/` — ADR location.
- `prompts/` — initial owner prompts.
