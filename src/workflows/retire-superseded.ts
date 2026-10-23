import type { DatabaseSync } from 'node:sqlite';
import type { WorkflowRun } from './types.js';

/** Called inside the workflow command/migration transaction. Accepted history stays completed. */
export function retireSupersededWorks(db: DatabaseSync, run: WorkflowRun): void {
  for (const node of Object.values(run.nodes).flat()) {
    if (node.phase !== 'SUPERSEDED' || !node.workId) continue;
    const changed = db.prepare("UPDATE work_instances SET status='ARCHIVED', updated_at=? WHERE id=? AND status='OPEN'").run(run.updatedAt, node.workId);
    if (!changed.changes) continue;
    db.prepare("UPDATE execution_episodes SET status='ENDED', ended_at=? WHERE work_instance_id=? AND status='ACTIVE'").run(run.updatedAt, node.workId);
    db.prepare("UPDATE capture_bindings_v2 SET status='INACTIVE' WHERE work_instance_id=? AND status='ACTIVE'").run(node.workId);
  }
}
