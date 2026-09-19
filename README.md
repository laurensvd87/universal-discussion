# Universal Discussion Layer — Claude Code Bootstrap

This repository is a planning/bootstrap package for handing the concept to a capable coding LLM such as Claude Code.

## What to do
Open this directory as the Claude Code project and tell Claude:

> Read CLAUDE.md and all referenced bootstrap documents. Begin with the agent/team structure and project planning phase exactly as instructed. Do not jump directly into coding.

The package intentionally does not lock in a programming language, cloud vendor, mobile UI mechanism, database vendor, AI provider or vector store. Those decisions should be researched and documented before implementation.

## Product in one sentence
A cross-platform discussion layer that maps the content a person is viewing to a semantic topic and exposes a shared human + explicitly identified AI discussion around that topic.

## Repository map
- `CLAUDE.md` — top-level instructions for Claude Code.
- `docs/` — product/domain/AI/security requirements.
- `agents/` — instructions for creating the development and business agent structure.
- `plans/` — phased roadmap and status template.
- `research/` — questions requiring current research before decisions.
- `decisions/` — ADR location.
- `prompts/` — initial owner prompts.
