# RBAC enforcement design — implementation contract

This is a backend security contract, not yet a working application.

## Role boundaries
- Owner: manage organization creation, identity, role assignment, security configuration, audit access.
- Manager: manage team workflow and reports within granted organization scope; cannot create organizations or promote Owner.
- Leader: team-level assignments and review; no organization-wide admin or identity-management privilege by default.
- Analyst: access only assigned datasets and tools; cannot manage roles, organization settings, or other users.

## Required enforcement
1. Resolve authenticated identity and organization scope server-side for every request.
2. Deny by default; validate role and resource ownership/assignment server-side.
3. Never trust client-side role names, hidden buttons, URL params, or submitted organization IDs.
4. Owner role cannot be assigned through public registration or self-service.
5. Validate organization membership and dataset permissions for every query/export.
6. Audit role changes, export/download actions, failed access, and organization settings.
7. Use least privilege for DB credentials, isolate tenants, avoid logging secrets.
8. Include tests for denied cross-tenant access and privilege escalation.

## Status
This policy and matrix are guidance. It must not be described as enforced until server middleware, DB constraints and negative tests are implemented and reviewed.
