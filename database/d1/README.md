# Cloudflare D1 database

The initial Cloudflare D1 schema lives in `0001_initial.sql`.

## Scope

The migration creates the application's relational tables for:
- Users, organizations, memberships and invitations
- Organization access requests and audit logs
- Projects and tasks
- Datasets, immutable dataset versions, validation runs and anomaly runs
- Power BI report links and in-app notifications
- Email verification / password reset tokens
- A D1-native session table

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
3. Move private dataset files from local disk to private R2 objects and update all read/write/restore/cleaning paths.
4. Port the Python subprocess cleaning workflow to Worker-compatible JavaScript or a separately hosted Python service.
5. Configure a production email delivery provider and secrets.
6. Add integration tests for tenant isolation, authorization, session rotation, token expiry, uploads, version restore and data validation.
7. Create the actual D1 database, apply migrations, and verify backup/restore before switching traffic.

The CI workflow executes this SQL against an in-memory SQLite database to catch schema syntax and missing-table errors.