import type { DatabaseSync } from 'node:sqlite';
import type { Snapshot } from '../distillation/service.js';
import { currentSourceObservations, sourceRoots } from '../core/source-revisions.js';
import { ensure } from '../contracts/definition.js';
import type { Draft, DefinitionRepository } from './repository.js';
import { hash } from './storage.js';

export type SourceChange = {
  workId: string; eventId: string; title: string; before: string; current?: string;
  status: 'REVISED' | 'PENDING' | 'ABSENT' | 'UNAVAILABLE';
  observationId?: string;
};
export type SourceReview = { hash: string; changes: SourceChange[] };

function observations(db: DatabaseSync, workId: string) {
  return db.prepare('SELECT id,external_id,kind,content,metadata_json FROM source_events WHERE work_instance_id=? ORDER BY sequence,row_id')
    .all(workId).map(row => ({ id: String(row.id), externalId: String(row.external_id), kind: String(row.kind),
      content: row.content as string | null, metadata: JSON.parse(String(row.metadata_json)) }));
}

/** Compare only the submitted scope with locally observed revisions. Never replace its frozen evidence. */
export function sourceReview(repository: DefinitionRepository, draft: Draft): SourceReview {
  if (!draft.jobId) return { hash: hash([]), changes: [] };
  const job = repository.read<{ snapshotId: string }>('distillation_jobs', draft.jobId);
  const snapshot = repository.read<Snapshot>('source_snapshots', job.snapshotId);
  const changes: SourceChange[] = [];
  for (const source of snapshot.sources) {
    ensure(!source.deleted && repository.db.prepare('SELECT id FROM work_instances WHERE id=?').get(source.workId), 'SOURCE_DELETED');
    const archive = observations(repository.db, source.workId), roots = sourceRoots(archive);
    const latest = new Map(currentSourceObservations(archive).map(event => [roots.get(event.id), event]));
    for (const selected of source.events) {
      const current = latest.get(roots.get(selected.id));
      const status = !current ? 'UNAVAILABLE' : current.kind === 'source.check' ? 'PENDING'
        : current.kind === 'source.absent' ? 'ABSENT'
        : hash(current.content ?? '') !== selected.hash || current.kind !== selected.kind ? 'REVISED' : undefined;
      if (status) changes.push({ workId: source.workId, eventId: selected.id, title: source.title, before: selected.content, status,
        ...(current ? { observationId: current.id } : {}), ...(status === 'REVISED' ? { current: current!.content ?? '' } : {}) });
    }
  }
  return { hash: hash({ snapshotId: snapshot.id, changes }), changes };
}
