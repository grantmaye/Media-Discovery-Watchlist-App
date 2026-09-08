import type { Sql } from './database';
export async function migrate(db: Sql) {
  await db.query(
    'CREATE TABLE IF NOT EXISTS workspaces(id text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now())',
  );
  await db.query(
    'CREATE TABLE IF NOT EXISTS watch_entries(workspace_id text REFERENCES workspaces(id) ON DELETE CASCADE,title_id text NOT NULL,data jsonb NOT NULL,PRIMARY KEY(workspace_id,title_id))',
  );
}
