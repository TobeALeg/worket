import { ensure, object, string } from '../contracts/definition.js';
import { confirmOutputTypes } from '../definitions/output-ports.js';
import type { DistillationDesktop } from '../distillation/desktop.js';
import type { AppService } from '../app/app-service.js';
import { MaterialStore } from '../definitions/storage.js';

/** Renderer commands enter the same domain module used by executor submission and tests. */
export class WorkflowDesktop {
  constructor(readonly app: AppService, readonly distillation: DistillationDesktop, readonly openPath: (path: string) => Promise<unknown>) {}
  async call(action: string, input: unknown = {}): Promise<unknown> {
    string(action); object(input); const w = this.app.core().workflows;
    switch (action) {
      case 'openOutput': {
        string(input.runId); string(input.nodeId); string(input.key);
        const run = w.run(input.runId), node = run.nodes[input.nodeId]?.find(n => n.generation === input.generation);
        const output = node?.outputs.find(o => o.key === input.key); ensure(output?.material, 'MATERIAL_MISSING');
        new MaterialStore(run.directory).verify(output.material); return this.openPath(output.material.path);
      }
      case 'previewOutput': {
        string(input.runId); string(input.nodeId); string(input.key);
        const run = w.run(input.runId), output = run.nodes[input.nodeId]?.find(n => n.generation === input.generation)?.outputs.find(o => o.key === input.key);
        ensure(output?.material, 'MATERIAL_MISSING'); const store = new MaterialStore(run.directory); store.verify(output.material);
        if (!/\.(md|txt|json|csv|log|yaml|yml|html|xml)$/i.test(output.material.originalPath) || output.material.size > 256 * 1024) return { text: null };
        const text = store.read(output.material.path, 256 * 1024).toString('utf8'); return { text: text.includes('\0') ? null : text };
      }
      case 'catalog': {
        const contracts = []; let cursor: string | undefined;
        do { const page = w.repository.definitions({ limit: 100, ...(cursor ? { cursor } : {}) }); contracts.push(...page.items); cursor = page.cursor ?? undefined; } while (cursor);
        return { definitions: w.definitions(), contracts };
      }
      case 'confirmPorts': return confirmOutputTypes(w.repository, input as Parameters<typeof confirmOutputTypes>[1]);
      case 'definition': string(input.id); return w.definition(input.id);
      case 'save': return w.save(input as Parameters<typeof w.save>[0]);
      case 'runs': if (input.workflowId !== undefined) string(input.workflowId); return w.runs(input.workflowId as string | undefined).map(r => w.detail(r.id));
      case 'detail': string(input.runId); return w.detail(input.runId);
      case 'create': return w.detail(w.create(input as Parameters<typeof w.create>[0]));
      case 'submit': w.submit(input as Parameters<typeof w.submit>[0]); break;
      case 'review': w.review(input as Parameters<typeof w.review>[0]); break;
      case 'rework': w.rework(input as Parameters<typeof w.rework>[0]); break;
      case 'impact': string(input.runId); string(input.nodeId); return w.impact(input.runId, input.nodeId);
      case 'adopt': w.adopt(input as Parameters<typeof w.adopt>[0]); break;
      case 'status': w.setStatus(input as Parameters<typeof w.setStatus>[0]); break;
      case 'dispatch': {
        string(input.executorId); string(input.commandId);
        const workId = w.prepare({ ...input, commandId: `${input.commandId}:prepare` } as Parameters<typeof w.prepare>[0]);
        await this.distillation.dispatch({ workId, executorId: input.executorId, commandId: `${input.commandId}:dispatch` }); break;
      }
      default: throw new Error('UNKNOWN_COMMAND');
    }
    ensure(typeof input.runId === 'string', 'INVALID_INPUT'); return w.detail(input.runId);
  }
}
