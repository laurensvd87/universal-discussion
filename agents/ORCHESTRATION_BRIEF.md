# Agent Orchestration Brief

Claude's first deliverable is to create a lean multi-agent structure for the project.

## Required capability areas
Do not blindly create one agent per bullet. Combine roles intelligently.

- Product/orchestration: requirements, prioritization, acceptance criteria, ADR governance.
- Backend/platform: APIs, identity, topics, discussions, reputation, agent API.
- Semantic/ML: extraction, embeddings, retrieval, topic clustering, evaluation datasets, merge/split logic, cost/quality optimization.
- Client: first browser client and shared client contracts; later mobile research.
- Trust/security/privacy: auth, secrets, browsing-data minimization, threat modeling, moderation/abuse.
- QA/reliability: unit/integration/e2e, clustering evaluation, load/abuse tests, release gates.
- DevOps/hosting/cost: CI/CD, environments, observability, backups, cheap scalable hosting and budgets.
- Growth/marketing/community: positioning, landing page, early adopter recruitment, onboarding experiments, metrics.
- Legal/platform policy research: browser stores, mobile stores, privacy/GDPR, content liability/takedown, AI/provider terms. This agent produces research/issues, not legal advice.

## Agent design requirements
Each created agent definition should state:
- mission;
- owned files/components;
- allowed/forbidden actions;
- inputs and outputs;
- definition of done;
- required tests/reviews;
- handoffs;
- when to escalate to orchestrator/owner.

## Coordination
Use a lead/orchestrator that delegates bounded tasks. Avoid multiple agents editing the same files concurrently unless a merge strategy exists. Architecture/security decisions require review before implementation.

## First agent tasks
1. Product agent: refine MVP hypotheses and acceptance metrics.
2. Semantic agent: propose and benchmark a low-cost clustering pipeline and evaluation method.
3. Security/privacy agent: threat model browser-context capture + BYO AI credentials.
4. Platform agent: propose backend architecture without premature vendor lock-in.
5. Client agent: research the smallest desktop validation client and cross-browser implications.
6. Growth agent: define an early-adopter test and recruitment channels.
7. DevOps agent: produce cost envelopes for prototype/100/1k/10k active users.

Then orchestrator reconciles conflicts into ADRs and the execution plan.
