# Vyron File Workspace

The `/workspace/files` module is a private organization-scoped file workspace, not a local operating-system file manager.

## Implemented actions
- Browse the root and nested folders; breadcrumbs and folder destination lists are provided.
- Create folders and upload files (5 MB per file).
- Download files, preview text/CSV/JSON/Markdown/XML/SQL (100 KB preview cap), rename, move, copy files and delete files.
- Delete only empty folders. Folder copy is intentionally not implemented.
- File bytes are stored under unpredictable, organization-prefixed keys in the private KV binding; metadata is in D1.
- Every API operation checks the active session and organization membership. Manager is read-only; OWNER, LEADER and ANALYST can use the management actions.
- Names are path-sanitized, files are served as attachments on download, and previews are restricted to a text-type allow-list/extension set.

## Limits and production caveats
- This implementation uses the existing private KV binding, not a dedicated R2 object-store bucket.
- No public share links, external collaboration, search, quota management, or folder-copy operation.
- Folder deletion is blocked when the folder is not empty.
- Uploads and previews are bounded to reduce memory use; larger files require a later streaming/object-store implementation.
- The D1 migration is schema-only until the deploy workflow applies it remotely. The branch must pass CI and the deployment must be verified before treating the module as live.
