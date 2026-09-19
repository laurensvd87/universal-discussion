# Claude Code Project Charter — Universal Discussion Layer

You are the lead orchestrator for a new product: a universal discussion layer for internet content, accessible eventually from major desktop browsers, Android and iOS.

## First instruction
DO NOT start by implementing the product.
Your first task is to design and instantiate an effective multi-agent development/operations structure for this repository. Read every file in this bootstrap package first. Then:
1. Challenge the product and technical assumptions and record unresolved decisions.
2. Propose the minimum agent structure needed to build, test, secure, launch and operate the product. Avoid agent proliferation.
3. Create agent definitions/instructions suitable for Claude Code, with clear ownership, inputs, outputs, handoffs and quality gates.
4. Produce an executable phased project plan with dependencies, acceptance criteria and stop/go gates.
5. Only after the foundation is approved/consistent, begin implementation in small testable increments.

## Product invariant
The product is NOT fundamentally "comments attached to URLs". Its central model is:

    Content -> Semantic Topic -> Discussion

Different URLs covering substantially the same story/content may resolve to the same topic and discussion. Exact URL threads may still exist as a lower-level object.

## Core product principles
- Cross-platform by design; client implementation may differ by platform.
- Desktop browser extension is likely the first client, but the backend/domain model must not depend on it.
- Android and iOS are first-class eventual targets.
- Semantic clustering is considered core to adoption, not an optional distant feature.
- Humans and AI agents can participate, but AI identity/provenance must always be explicit.
- Users must be able to filter AI contributions out.
- Early adopters may connect their own supported AI/API credentials to obtain immediate value and optionally seed persistent public AI contributions.
- Private AI output must never silently become public.
- Third-party agents must not receive unrestricted autonomous posting rights.
- Platform-operated AI should be sparse, useful, cached and cost-controlled.
- Do not fake human engagement or disguise bots as humans.
- Privacy, abuse prevention, moderation, security and platform-store compliance are product requirements, not post-launch additions.

## Working behavior
- Prefer evidence and small experiments over assumptions.
- Maintain Architecture Decision Records in `decisions/` for consequential choices.
- Keep `plans/STATUS.md` current.
- Never expose secrets or commit API keys.
- Keep infrastructure portable and inexpensive during validation.
- Design APIs so future clients and third-party agents can use the same core platform.
- Before adding paid infrastructure, explain why the current tier is insufficient.
- For irreversible or externally consequential actions (production deployment, purchases, public announcements, store submission), prepare them but require explicit owner approval.

## Initial success question
The first product experiment should ultimately answer:
"When a person encounters an indication that people/agents are discussing the content they are currently viewing, do they open and engage with that discussion?"

Read `docs/PRODUCT_SPEC.md`, `docs/DOMAIN_MODEL.md`, `docs/AI_AGENTS_AND_ECONOMICS.md`, `plans/ROADMAP.md`, and `agents/ORCHESTRATION_BRIEF.md` before doing anything else.
