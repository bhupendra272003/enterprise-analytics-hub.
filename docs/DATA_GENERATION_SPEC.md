# Vyron — Owner-Controlled Synthetic Data Generator

## Operating principle
**No automatic generation. No cron. No background schedule.** The system generates data only after the Owner opens the generator, selects approved industries and dataset volumes, and explicitly clicks **Generate data** followed by a confirmation.

An industry without an approved active project/team is idle and excluded from generation. The generator must not create data merely because an industry template exists.

## Owner controls
The Owner configures:
- Enabled industries (only those approved for the current pilot).
- Datasets/tables to generate for each industry.
- Exact maximum rows per dataset and optional total rows per job.
- Batch size, seed, date range and quality-challenge profile.
- Optional storage/retention cap.

The system validates that per-dataset and total limits are respected. Manager, Leader and Analyst roles cannot modify settings or start jobs. The Owner may grant read-only job visibility, but not generator control by default.

## First-run confirmation
Before queuing, show a summary:
- Industry and dataset/table list.
- Requested rows per table and total estimated rows.
- Estimated storage and processing time when available.
- Synthetic-data label and generation seed.
- Active project/team association.
- Warning if any dataset has no active team or if the configured cap is exceeded.

Require an explicit confirmation. Reject the request if the Owner's configured limit is exceeded.

## Execution architecture
- API validates Owner membership, approval state, enabled industries and configured limits.
- Persist a generation job and immutable configuration snapshot.
- Process jobs in a background worker/queue; never create a large dataset inside the HTTP request.
- Generate deterministic, relationally consistent synthetic records in bounded chunks.
- Use idempotency keys based on job, industry, dataset and batch number.
- Track QUEUED, RUNNING, COMPLETED, FAILED and CANCELLED states.
- Persist row counts, batch progress, duration, retry count and safe error codes.
- Support pause/cancel and retry of failed batches without duplicate rows.
- Never replace the last successful snapshot until the new run passes validation.
- Use durable private object storage for large CSV/Parquet files and a transactional database for metadata/job state.
- Apply tenant isolation, access checks, retention and backup policies.

## Industry templates
1. Banking & Finance: customers (synthetic), accounts, transactions, cards (masked/fake), loans, repayments, branches, complaints and fraud scenarios.
2. Hospital & Healthcare: synthetic patients, appointments, admissions, lab, pharmacy, billing, claims, bed occupancy, doctors and inventory.
3. Logistics & Supply Chain: orders, shipments, vehicles, warehouses, inventory, routes, delivery events, returns and suppliers.
4. Retail & E-commerce: customers, products, orders, payments, returns, inventory, promotions and channels.

All records must be clearly labelled synthetic. Never generate or ingest real patient, bank-customer, cardholder or other personal data without formal authorization and safeguards.

## Volume policy
Historical discussion mentioned 50,000+ initial rows and 10,000+ daily additions. These are not defaults and do not imply a schedule. The Owner must decide the actual volume and whether limits apply per dataset, per industry or across the whole job. No volume is assumed or hard-coded.

## Current implementation boundary
This is a specification, not a claim that the generator is already operational. The repository currently has no verified production-ready generator worker, durable bulk-data storage, Owner-only generation endpoint or end-to-end job UI. These must be implemented and load-tested before enabling large runs. Until then, keep generation disabled and use only small local test fixtures.