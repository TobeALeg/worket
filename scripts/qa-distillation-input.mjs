// Explicit local replay: copy the source DB, export only the actual outbound request,
// then optionally receive a real model response into that isolated copy.
import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createWorkCore } from '../dist/core/index.js';
import { DistillationService } from '../dist/distillation/service.js';
import { chunksFor } from '../server/workflow.mjs';
import { hash } from '../dist/definitions/storage.js';
import { resultItems } from '../dist/contracts/definition.js';

const [mode, directoryArg, database, oldJobId] = process.argv.slice(2);
if (!['prepare', 'receive'].includes(mode) || !directoryArg || (mode === 'prepare' && (!database || !oldJobId)))
  throw new Error('Usage: node scripts/qa-distillation-input.mjs prepare OUTPUT_DIR SOURCE_DB JOB_ID | receive OUTPUT_DIR');
const directory = resolve(directoryArg), replay = join(directory, 'replay.sqlite');
const save = (name, value) => writeFileSync(join(directory, name), JSON.stringify(value, null, 2), { mode: 0o600 });
if (mode === 'prepare') {
  assert.ok(!existsSync(replay), 'Use a new output directory for each replay');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const source = new DatabaseSync(resolve(database), { readOnly: true });
  try { await backup(source, replay); } finally { source.close(); }
}
const core = createWorkCore({ databasePath: replay });
let request;
const client = {
  capabilities: async () => ({ ruleSchemaVersions: [1], skillSchemaVersions: [1], analysisSchemaVersions: [1] }),
  submit: async (value, key) => { request = value; return { requestId: key, status: 'RUNNING' }; },
  get: async () => ({ status: 'RUNNING' }), cancel: async () => {}, ack: async () => {},
};
const service = new DistillationService(core, client);
try {
  if (mode === 'prepare') {
    const old = core.definitions.read('distillation_jobs', oldJobId);
    const original = core.definitions.read('source_snapshots', old.snapshotId);
    const before = service.wire(original), originalHash = hash(original);
    const job = service.retry({ jobId: old.id, expectedContentHash: original.contentHash, commandId: randomUUID() });
    await new Promise(r => setImmediate(r));
    assert.ok(request, core.definitions.read('distillation_jobs', job.id).error ?? 'Request was not prepared');
    const snapshot = core.definitions.read('source_snapshots', job.snapshotId);
    const reasons = {};
    for (const entry of snapshot.analysis.entries) {
      const key = `${entry.action}:${entry.reason}`;
      reasons[key] = (reasons[key] ?? 0) + 1;
    }
    const protectedEvents = original.sources.flatMap(s => s.events.filter(e => !e.kind.startsWith('tool.')).map(e => ({
      key: e.key, verbatim: request.sources.find(x => x.key === s.key).events.some(x => x.key === e.key && x.content === e.content),
    })));
    const report = { oldJobId: old.id, jobId: job.id, snapshotId: job.snapshotId,
      requestId: core.definitions.read('distillation_jobs', job.id).requestId,
      beforeBytes: Buffer.byteLength(JSON.stringify(before)), afterBytes: Buffer.byteLength(JSON.stringify(request)),
      analysis: request.analysis, reasons, protectedEvents: protectedEvents.length,
      allProtectedVerbatim: protectedEvents.every(e => e.verbatim),
      oldSnapshotUnchanged: originalHash === hash(core.definitions.read('source_snapshots', old.snapshotId)), realModel: false };
    try { report.chunks = chunksFor(request).length; } catch (error) { report.sizingError = error.message; process.exitCode = 1; }
    assert.ok(report.allProtectedVerbatim && report.oldSnapshotUnchanged);
    save('request.json', request); save('preflight.json', report); console.log(JSON.stringify(report, null, 2));
  } else {
    const report = JSON.parse(readFileSync(join(directory, 'preflight.json'), 'utf8'));
    const remote = JSON.parse(readFileSync(join(directory, 'remote-result.json'), 'utf8'));
    assert.equal(remote.status, 'SUCCEEDED'); assert.ok(remote.result);
    const job = core.definitions.read('distillation_jobs', report.jobId);
    await service.receive(job, { ...remote, requestId: report.requestId });
    const accepted = core.definitions.read('distillation_jobs', job.id);
    assert.equal(accepted.status, 'AWAITING_REVIEW');
    const draft = core.definitions.read('definition_drafts', accepted.draftId);
    const summary = { ...report, realModel: true, status: accepted.status, draftId: draft.id,
      items: resultItems(remote.result).length, blockingIssues: remote.result.issues.filter(i => i.blocking).length,
      nonBlockingIssues: remote.result.issues.filter(i => !i.blocking).length, versions: remote.result.versions,
      coverage: remote.result.coverage, isolatedDatabase: true, published: false };
    save('accepted.json', summary); console.log(JSON.stringify({ ...summary, coverage: { ...summary.coverage, eventKeys: `[${summary.coverage.eventKeys.length} event keys]` } }, null, 2));
  }
} finally { service.close(); core.close(); }
