// Local synchronous cost only: no provider, network or actual business history.
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createWorkCore } from '../dist/core/index.js';
import { ImprovementCollector } from '../dist/improvement/collector.js';
import { RecordingCollection } from '../dist/improvement/recording.js';
const results = [];
for (const messagesPerWork of [200, 2000]) {
  const directory = mkdtempSync(join(tmpdir(), 'worket-recording-idle-'));
  const core = createWorkCore({ databasePath: join(directory, 'local.sqlite') });
  const collector = new ImprovementCollector(core.definitions.db, { improvementIdentity: () => 'synthetic-idle' });
  const recording = new RecordingCollection(core, collector);
  try {
    for (let n = 0; n < 3; n++) {
      const work = core.createWork({ definition: { key: 'qa', name: 'idle', version: 1 }, executor: { type: 'AGENT', name: 'qa' }, environment: { type: 'CODEX_DESKTOP', name: 'qa' }, source: { adapter: 'codex', conversationId: `qa-${n}` } });
      core.appendSourceEvents(work.instance.id, Array.from({ length: messagesPerWork }, (_, i) => ({ externalId: `message-${i}`, sequence: i + 1, kind: i % 2 ? 'agent.response' : 'user.prompt', content: `合成消息 ${i} ` + '约定与本次输入分离。'.repeat(100), timestamp: new Date(0).toISOString(), executorType: i % 2 ? 'AGENT' : 'HUMAN', environmentType: 'CODEX_DESKTOP', metadata: {}, artifactRefs: [] })));
      recording.start(work.instance.id);
    }
    let snapshots = 0, recordAttempts = 0;
    const getWork = core.getWork.bind(core), record = collector.record.bind(collector);
    core.getWork = (...args) => { snapshots++; return getWork(...args); };
    collector.record = (...args) => { recordAttempts++; return record(...args); };
    const elapsed = [];
    for (let n = 0; n < 30; n++) { const start = performance.now(); recording.collect(); elapsed.push(performance.now() - start); }
    elapsed.sort((a, b) => a - b);
    results.push({ messagesPerWork, works: 3, idlePasses: elapsed.length, snapshots, recordAttempts,
      medianMs: elapsed[Math.floor(elapsed.length / 2)], maxMs: elapsed.at(-1), totalMs: elapsed.reduce((sum, n) => sum + n, 0) });
  } finally { core.close(); rmSync(directory, { recursive: true, force: true }); }
}
console.log(JSON.stringify({ kind: 'synthetic local collector benchmark', providerCalls: 0, results }, null, 2));
