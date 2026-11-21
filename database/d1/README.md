# Cloudflare D1 database

The initial Cloudflare D1 schema lives in `0001_initial.sql`. Governance and team accountability are added in `0007_vyron_governance.sql`.

## Scope

The migration creates the application's relational tables for:
- Users, organizations, memberships and invitations
- Organization access requests and audit logs
- Projects and tasks
- Datasets, immutable dataset versions, validation runs and anomaly runs
- Power BI report links and in-app notifications
- Email verification / password reset tokens
- A D1-native session table
- Owner-controlled synthetic generation settings/jobs linked to the active project and team
- Four membership roles (OWNER, MANAGER, LEADER, ANALYST), team roster ownership and one Leader per team
- Task assignment history, work events and Owner/Manager performance evidence
- Performance correction records and Owner-controlled synthetic generator settings/job metadata (generator execution is not yet enabled)

## MySQL-to-SQLite decisions

- MySQL `CHAR(36)` identifiers become SQLite `TEXT`.
- MySQL `ENUM` columns become `TEXT CHECK (...)` constraints.
- MySQL `JSON` columns become `TEXT`; the API must serialize and parse JSON values.
- MySQL `DATETIME` columns become ISO-compatible `TEXT` values with `CURRENT_TIMESTAMP` defaults.
- Unsigned numeric columns become SQLite `INTEGER` with non-negative checks where applicable.
- The duplicate MySQL `notifications` table declaration is represented once.
- `sessions` is included as a D1-oriented persistence table; the existing `express-mysql-session` implementation does not use it.

## Important deployment status

This is a schema migration artifact, **not a live database deployment**. The current Express API still uses `mysql2`, MySQL SQL dialect features, MySQL transactions and `express-mysql-session`. Do not point the current API at D1.

Before production deployment:
1. Implement a D1 data-access layer and migrate every API route away from MySQL-specific calls.
2. Replace MySQL session storage with a secure D1-compatible session implementation.
3. The Cloudflare Worker path currently stores small/private dataset objects in KV (generated CSVs are capped at 10 MiB); evaluate and migrate larger or long-retention files to private R2 with updated read/write/restore/cleaning paths. The legacy Express path still uses local disk.
4. Port the Python subprocess cleaning workflow to Worker-compatible JavaScript or a separately hosted Python service.
5. Configure a production email delivery provider and secrets.
6. Add integration tests for tenant isolation, authorization, session rotation, token expiry, uploads, version restore and data validation.
7. Create the actual D1 database, apply migrations, and verify backup/restore before switching traffic.

The CI workflow executes these SQL migrations against an in-memory SQLite database, verifies the four-role constraint and team/task columns, and runs a foreign-key check. This does not apply the migration to the live D1 database.