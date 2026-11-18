# NEXUS ANALYTICS — Enterprise Analytics Hub

A multi-tenant analytics and team collaboration platform. This repository starts with Module 01: identity, organizations, memberships, invitations and approval foundations.

## Stack
- API: Node.js 20+, Express, MySQL 8+
- Authentication: secure server-side sessions and bcrypt password hashing
- Validation: Zod
- Security baseline: Helmet, CORS allow-list, rate limiting and origin/request-header checks

## Repository layout
- `apps/api`: Express API
- `database/schema.sql`: MySQL schema
- `docs/ARCHITECTURE.md`: architecture and roadmap
- `docs/API-TESTING.md`: local smoke-test sequence

## Local setup
1. Create a MySQL 8 database and run `database/schema.sql`.
2. Copy `apps/api/.env.example` to `apps/api/.env` and set local credentials.
3. From `apps/api`, run `npm install`.
4. Run `npm run dev`.
5. Check `GET http://localhost:4000/health`.

## Important
This is a development foundation, not production-certified software. Before public deployment, complete CSRF protection, email verification, password recovery, MFA, security review, backups, monitoring, strict CORS configuration and managed secret storage. Never commit real credentials or customer data.

## Roadmap
1. Identity, organizations and access approvals
2. Team directory and invitations UI
3. Projects, tasks, assignments and reviews
4. Authorized data connectors and ingestion
5. Immutable raw snapshots and versioned working datasets
6. Governed SQL/Python analyst workspace
7. Power BI/report integration and dashboards
8. Audit console, alerts, backups and security hardening
