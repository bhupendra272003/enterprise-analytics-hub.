-- Organization-scoped virtual file workspace. Stored bytes remain in private KV.
CREATE TABLE IF NOT EXISTS workspace_files (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES workspace_files(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL CHECK(node_type IN ('FOLDER','FILE')),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 255),
  mime_type TEXT,
  storage_key TEXT,
  file_size INTEGER NOT NULL DEFAULT 0 CHECK(file_size BETWEEN 0 AND 5242880),
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((node_type='FOLDER' AND storage_key IS NULL AND file_size=0) OR
         (node_type='FILE' AND storage_key IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_files_parent_name
  ON workspace_files(organization_id,parent_id,name) WHERE parent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_files_root_name
  ON workspace_files(organization_id,name) WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_workspace_files_org_parent
  ON workspace_files(organization_id,parent_id,node_type,name);
