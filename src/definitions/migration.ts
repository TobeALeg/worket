import { retireSupersededWorks } from '../workflows/retire-superseded.js';
import { existsSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { transaction } from "./storage.js";
export function migrateDefinitions(
  db: DatabaseSync,
  databasePath: string,
): void {
  const version = Number(
    (db.prepare("PRAGMA user_version").get() as { user_version: number })
      .user_version,
  );
  if (version > 6)
    throw new Error(
      "DATABASE_VERSION_UNSUPPORTED：请使用新版 Worket 或恢复迁移前备份",
    );
  if (version === 6) return;
  if (version === 5) {
    if (databasePath !== ':memory:' && !existsSync(`${databasePath}.before-workflow-status-v6.bak`))
      db.prepare('VACUUM INTO ?').run(`${databasePath}.before-workflow-status-v6.bak`);
    transaction(db, () => {
      for (const row of db.prepare('SELECT payload_json FROM workflow_runs').all())
        retireSupersededWorks(db, JSON.parse(String(row.payload_json)));
      db.exec('PRAGMA user_version = 6');
    });
    return;
  }
  if (version === 4) {
    if (databasePath !== ':memory:' && !existsSync(`${databasePath}.before-workflow-drafts-v5.bak`))
      db.prepare('VACUUM INTO ?').run(`${databasePath}.before-workflow-drafts-v5.bak`);
    transaction(db, () => {
      db.exec(`CREATE TABLE workflow_drafts (id TEXT PRIMARY KEY, base_id TEXT REFERENCES workflow_definitions(id), revision INTEGER NOT NULL, content_json TEXT NOT NULL, selected_node TEXT NOT NULL, updated_at TEXT NOT NULL, published_id TEXT REFERENCES workflow_definitions(id)) STRICT;
        CREATE INDEX workflow_runs_definition ON workflow_runs(workflow_id);
        CREATE INDEX workflow_runs_updated ON workflow_runs(json_extract(payload_json,'$.updatedAt'),id);
        PRAGMA user_version = 5;`);
    });
    return migrateDefinitions(db, databasePath);
  }
  if (version === 3) {
    if (databasePath !== ':memory:' && !existsSync(`${databasePath}.before-workflows-v4.bak`))
      db.prepare('VACUUM INTO ?').run(`${databasePath}.before-workflows-v4.bak`);
    transaction(db, () => {
      db.exec(`CREATE TABLE workflow_definitions (id TEXT PRIMARY KEY, definition_key TEXT NOT NULL, version INTEGER NOT NULL, payload_json TEXT NOT NULL, UNIQUE(definition_key,version)) STRICT;
        CREATE TABLE workflow_contract_refs (workflow_id TEXT NOT NULL REFERENCES workflow_definitions(id), contract_id TEXT NOT NULL REFERENCES work_definitions(id) ON DELETE RESTRICT, PRIMARY KEY(workflow_id,contract_id)) STRICT;
        CREATE TABLE workflow_runs (id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES workflow_definitions(id), payload_json TEXT NOT NULL) STRICT;
        CREATE TABLE workflow_node_works (work_id TEXT PRIMARY KEY REFERENCES work_instances(id) ON DELETE RESTRICT, run_id TEXT NOT NULL REFERENCES workflow_runs(id), node_id TEXT NOT NULL, generation INTEGER NOT NULL, UNIQUE(run_id,node_id,generation)) STRICT;
        PRAGMA user_version = 4;`);
    });
    return migrateDefinitions(db, databasePath);
  }
  if (version === 2) {
    if (databasePath !== ':memory:' && !existsSync(`${databasePath}.before-category-v3.bak`))
      db.prepare('VACUUM INTO ?').run(`${databasePath}.before-category-v3.bak`);
    transaction(db, () => {
      db.exec(`CREATE TABLE definition_categories (definition_key TEXT PRIMARY KEY, category TEXT NOT NULL) STRICT;
        PRAGMA user_version = 3;`);
    });
    migrateDefinitions(db, databasePath);
    return;
  }
  if (version === 1) {
    if (
      databasePath !== ":memory:" &&
      !existsSync(`${databasePath}.before-storage-v2.bak`)
    )
      db.prepare("VACUUM INTO ?").run(`${databasePath}.before-storage-v2.bak`);
    transaction(db, () => {
      db.exec(`ALTER TABLE capture_bindings RENAME TO capture_bindings_v2;
        CREATE VIEW capture_bindings AS SELECT '请使用支持沉淀的 Worket；回滚需恢复迁移前备份' AS upgrade_required;
        PRAGMA user_version = 2;`);
    });
    migrateDefinitions(db, databasePath);
    return;
  }
  if (
    databasePath !== ":memory:" &&
    existsSync(databasePath) &&
    !existsSync(`${databasePath}.before-distillation-v1.bak`)
  )
    db.prepare("VACUUM INTO ?").run(
      `${databasePath}.before-distillation-v1.bak`,
    );
  transaction(db, () => {
    db.exec(`
      ALTER TABLE work_definitions ADD COLUMN kind TEXT NOT NULL DEFAULT 'GENERAL';
      ALTER TABLE work_definitions ADD COLUMN payload_json TEXT;
      CREATE TABLE source_snapshots (id TEXT PRIMARY KEY, payload_json TEXT NOT NULL) STRICT;
      CREATE TABLE distillation_jobs (id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL REFERENCES source_snapshots(id), payload_json TEXT NOT NULL) STRICT;
      CREATE TABLE definition_drafts (id TEXT PRIMARY KEY, payload_json TEXT NOT NULL) STRICT;
      CREATE TABLE definition_materials (id TEXT PRIMARY KEY, payload_json TEXT NOT NULL) STRICT;
      CREATE TABLE definition_material_refs (definition_id TEXT NOT NULL REFERENCES work_definitions(id) ON DELETE CASCADE, material_id TEXT NOT NULL REFERENCES definition_materials(id), role TEXT NOT NULL, PRIMARY KEY(definition_id, role)) STRICT;
      CREATE TABLE pending_dispatches (work_id TEXT PRIMARY KEY REFERENCES work_instances(id) ON DELETE CASCADE, command_id TEXT NOT NULL, status TEXT NOT NULL, read_at TEXT) STRICT;
      CREATE TABLE instance_inputs (work_id TEXT PRIMARY KEY REFERENCES work_instances(id) ON DELETE CASCADE, payload_json TEXT NOT NULL) STRICT;
      CREATE TABLE review_events (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, payload_json TEXT NOT NULL) STRICT;
      CREATE TABLE command_results (id TEXT PRIMARY KEY, hash TEXT NOT NULL, owner_id TEXT NOT NULL, payload_json TEXT NOT NULL) STRICT;
      ALTER TABLE capture_bindings RENAME TO capture_bindings_v2;
      CREATE VIEW capture_bindings AS SELECT '请使用支持沉淀的 Worket；回滚需恢复迁移前备份' AS upgrade_required;
      PRAGMA user_version = 2;
    `);
  });
  migrateDefinitions(db, databasePath);
}
