# Alpha direct-cash cost worksheet

Status: Planning evidence only; no vendor, purchase, or deployment is approved.

Price check: 2026-09-20

## Purpose and limits

This worksheet replaces the top-down infrastructure placeholders with auditable
line items for two private-alpha shapes: a managed Postgres/backend candidate
and a single-node self-hosted candidate with provider backup slots. It is not a
quote, capacity claim, or recovery claim. Taxes, exchange rates, engineering,
security review, legal work, moderation, support, incident response, and
on-call labor remain outside the cash totals. Those omitted labor costs are
likely more important than the server bill. Public domain registration,
independent monitoring, and redundant compute are also explicit TBD line items
rather than hidden zeroes; the reference totals are not deployable budgets.

The comparison is deliberately provider-neutral at the architecture layer.
Supabase and Hetzner are reference prices because their current public pages
make the two shapes concrete; neither is selected by this document.

## Workload assumptions

The existing Phase 0 envelope assumes 60 user-invoked resolution checks and two
newly processed sources per MAU each month. This worksheet adds two
transactional authentication/account emails per MAU and caps a lookup response
at 2 KiB. Lookups must remain read-only and must not create a browsing-history
row. Raw page bodies, media, hosted embeddings, generative AI, analytics, and
passive/background observation remain off.

| MAU | Lookup requests/month | New sources/month | Account emails/month | Maximum lookup response egress |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 6,000 | 200 | 200 | about 12 MiB |
| 1,000 | 60,000 | 2,000 | 2,000 | about 117 MiB |
| 10,000 | 600,000 | 20,000 | 20,000 | about 1.15 GiB |

The request count is not a sizing result. P1.9 must replay the measured P1.8
workload, record CPU, memory, connections, storage growth, and p95 latency, then
replace the provisional compute sizes below.

## Reference price facts

- [Supabase pricing](https://supabase.com/pricing) lists Pro at USD 25/month,
  including USD 10/month of compute credit, one Micro compute instance, 8 GB of
  database disk, 250 GB egress, daily backups retained for seven days, and
  seven-day logs. Small compute is USD 15/month, so it adds USD 5 after that
  credit. The Pro spend cap is on by default. Point-in-time recovery, a log
  drain, and a custom project domain are separate add-ons and are not assumed.
- [Hetzner's 15 June 2026 German price table](https://docs.hetzner.com/de/general/infrastructure-and-availability/price-adjustment/)
  lists VAT-inclusive EU monthly prices of EUR 6.53 for CX23, EUR 10.10 for
  CX33, and EUR 19.03 for CX43, excluding IPv4. Hetzner documents backups as
  [20% of the server price](https://docs.hetzner.com/cloud/billing/faq/) for
  seven slots and a VAT-inclusive primary IPv4 at
  [EUR 0.60/month](https://docs.hetzner.com/de/cloud/servers/primary-ips/overview/).
  Its [cloud overview](https://www.hetzner.com/cloud) advertises at least 20 TB
  of included traffic for EU servers, far above the modeled lookup responses;
  that does not establish end-to-end capacity.
- [Resend pricing](https://resend.com/pricing) lists 3,000 emails/month on its
  free tier, subject to 100/day, and 50,000/month for USD 20 on Pro.
  Pay-as-you-go overage is not assumed or enabled in this model.

Prices and included quotas can change. Recheck them, the billing currency, VAT,
region, DPA/subprocessor terms, retention, and spend controls at any later
purchase gate. Any real email provider would receive addresses and
authentication metadata and therefore requires its own purpose, DPA,
data-region, access, and retention approval before use.

## Bottom-up monthly reference totals

### Managed reference

| Line item | 100 MAU | 1,000 MAU | 10,000 MAU | Basis |
| --- | ---: | ---: | ---: | --- |
| Pro plan + Micro compute | USD 25 | USD 25 | USD 25 | First Micro offset by included compute credit. |
| Provisional compute step-up | USD 0 | USD 0 | USD 5 | Small at 10,000 MAU is a placeholder pending load evidence. |
| Transactional email | USD 0 | USD 0 | USD 20 | 200/2,000 fit free only while demand stays at or below 100/day; 20,000 uses Pro. |
| Hosted embeddings/generative AI | USD 0 | USD 0 | USD 0 | Not approved and excluded. |
| **Reference vendor bill** | **USD 25** | **USD 25** | **USD 50** | Before tax and exchange movement. |

The included seven-day backup and log windows are reference features, not an
accepted retention policy. The managed option still needs restore evidence,
row/object authorization tests, operator-access review, region/DPA review, and
confirmation that spend caps cover every enabled usage category.

### Self-hosted reference

| Line item | 100 MAU | 1,000 MAU | 10,000 MAU | Basis |
| --- | ---: | ---: | ---: | --- |
| One EU cloud server | EUR 6.53 | EUR 10.10 | EUR 19.03 | CX23/CX33/CX43 placeholders, VAT included. |
| Seven-slot backup service | EUR 1.31 | EUR 2.02 | EUR 3.81 | 20%, rounded up to cents. |
| One primary IPv4 | EUR 0.60 | EUR 0.60 | EUR 0.60 | IPv6 remains available without this fee. |
| Transactional email | USD 0 | USD 0 | USD 20 | Same monthly and 100/day reference assumptions. |
| Hosted embeddings/generative AI | EUR 0 | EUR 0 | EUR 0 | Not approved and excluded. |
| **Reference vendor bill** | **EUR 8.44** | **EUR 12.72** | **EUR 23.44 + USD 20** | Before any independent monitoring or redundancy. |

This single-node shape has provider backup slots but no demonstrated
application-consistent restore and is not highly available. It co-locates the
application and database, has no independent log service, and does not price a
standby, load balancer, managed database, or 24-hour operations. Adding a second
application node alone would not make PostgreSQL highly available. The apparent
cash advantage is therefore not an equivalent service-level comparison.

## Budget and decision implications

The reference bills fit inside the existing EUR 75 / 150 / 750 monthly hard
caps only at a rough planning level. A USD bill must be converted with a
documented buffer at the purchase gate; no 1:1 currency assumption authorizes
spend. Disable optional overage, keep alerts below the owner-approved cap, and
fail closed or degrade nonessential work before incurring uncontrolled cost.

Direct cash cost is unlikely by itself to decide between the candidates at
private-alpha scale. The decision should turn on measured load, data location
and processor terms, authorization fit, backup/restore and deletion behavior,
portability, and who can credibly own patching and incidents. A managed
candidate is the safer default when no named operator can meet the self-hosted
duties; self-hosting is credible only with an accepted runbook, restore drill,
patch cadence, monitoring, secrets boundary, and incident owner.

Before ADR-003 can be accepted, P1.9 must replace each provisional size with a
reproducible benchmark, add storage/backup growth and external observability
where needed, exercise restore and deletion, and record a low/base/high total
for the selected operational shape. This worksheet authorizes none of those
external services.
