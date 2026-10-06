# ADR-048: LLM evaluation, non-LLM runtime matching

Date: 2026-10-06
Status: owner authorized bounded pilot evaluation; production matcher unchanged

## Owner decision

The owner clarified that the assistant may inspect the **content** of approved
public pilot pages and decide whether their Topics match, solely to test and
fine-tune the algorithm. He does not want an LLM in the runtime matcher:
the product path should use embeddings and transparent signals such as
keywords and time. This expressly expands ADR-045/047's prior title-only,
no-body-in-model-context evaluation restriction for this bounded public-page
exercise. It does not expand automatic browser capture or future user-page
provider egress.

## Evaluation boundary

- Only the already approved public English editorial pilot scope in ADR-045:
  the three named origins and at most 24 screened pages. No private,
  authenticated, paywalled, owner-history or other-origin pages.
- The assistant may read article prose transiently to produce concise,
  evidence-linked pair judgments. Do not save raw body text in files, logs,
  repository artifacts or the production service. Avoid long quotations.
- Keep LLM content judgments separate from the owner's answer and earlier
  title-only triage, with frozen task/source provenance and an explicit
  `assistant-evaluation` actor. They are useful exploratory reference labels,
  not independent human gold or a store/legal clearance.
- Do not use cosine values when assigning reference labels. Report `same
  atomic development`, `related but distinct development`, `unrelated`, or
  `uncertain`, then compare the non-LLM matcher with those judgments afterward.
- An offline shadow experiment may combine the existing 384-vector with
  title keywords and reviewed publication date/time. It must not create new
  retained content-derived facts/keywords in production, call an AI provider
  at runtime, change live routing/thresholds, or migrate existing discussions.

Six sources are too few for trustworthy threshold calibration; treat them as
failure-mode probes. Any production matcher activation or broader retained
data representation still needs a separately reviewed decision. The full
200–250-pair scale-up, owner/security/privacy/provider/deployment/spending and
publication gates remain unchanged.
