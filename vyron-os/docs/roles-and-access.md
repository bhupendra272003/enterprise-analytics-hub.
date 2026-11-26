# Roles and access control — design policy

| Role | Scope | Intended access |
|---|---|---|
| OWNER | Global | Organization and user administration, policy, all projects |
| MANAGER | Assigned organization/team | Team/project management, reporting |
| LEADER | Assigned teams | Review, collaboration, assignment coordination |
| ANALYST | Assigned workspace/datasets | Analysis tools and approved datasets |

## Enforcement requirements
- The web/API service must check authorization on every protected operation and object.
- Do not trust role names, hidden UI controls, or Linux group membership as security enforcement.
- Every user must have an individual account; audit relevant access and changes.
- Deny by default and validate organization/project scope on all data requests.
- Do not seed passwords or real datasets in the ISO.
- Access policies remain a design specification until application enforcement tests pass.
