# Vyron — Synthetic Data Generation Specification

## Status
Proposal only. Generation is not activated by this document. A trainer/owner approval and an infrastructure load test are required before scheduling.

## Scope
Generate linked, reproducible synthetic datasets for only the industries approved for the pilot. Every generated file and record group must be labelled synthetic. Use deterministic seeds or persisted run identifiers so failed batches can be retried without duplicating rows.

## Volume configuration
Previously discussed planning figures:
- Initial seed: 50,000+ rows.
- Daily incremental batch: 10,000+ rows.

The volume scope is still unresolved: these figures may mean per industry or total across all approved industries. Do not hard-code either interpretation. Require an explicit configuration and confirmation before the first production-like run.

## Execution requirements
- One scheduled run per day at a configurable timezone/time.
- Feature flag disabled by default until approval.
- Queue/background processing only; never generate large datasets in a synchronous web request.
- Chunked inserts or object writes with bounded memory.
- Idempotency key per schedule date, industry and dataset.
- Job states: QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED.
- Progress, row counts, duration, retries and safe error codes recorded.
- Failed jobs must not replace or corrupt the previous successful snapshot.
- Rate limits, maximum batch size and emergency pause control.
- Backpressure and concurrency limits.
- Retention and cleanup policy for temporary files.

## Storage architecture decision
The current repository contains both an Express/MySQL/local-disk path and a Cloudflare Worker path using D1, KV and Queues. Verify which path is authoritative for the deployed app before selecting storage. Large raw CSV/parquet objects should use durable private object storage; metadata and job state belong in a transactional database. D1/KV alone must not be assumed to be an appropriate bulk analytics warehouse.

## Data quality scenarios
Synthetic batches may deliberately include documented quality cases: missing values, duplicate rows, inconsistent casing/spacing, invalid dates, out-of-range values and referential-integrity violations. Keep a clean baseline and a separate quality-challenge variant so users can compare before/after outcomes.

## Validation before activation
- Confirm volume interpretation and industries.
- Estimate storage and transfer costs.
- Benchmark each dataset/table and total batch.
- Test idempotent retry and partial failure recovery.
- Verify tenant isolation and download permissions.
- Confirm dashboards remain responsive using aggregates or sampled views.
- Obtain trainer approval for the schedule and workload.
