import type { WorkflowDraft } from '../workflows/drafts.js';
import type { WorkflowContent } from '../workflows/types.js';
import { api, cid } from './workflow-ui.js';

/** Serial writes preserve every acknowledged revision, including edits made during a save. */
export class WorkflowDraftEditor {
  id: string;
  revision: number;
  private sequence = 0;
  private saved = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private writing: Promise<void> | undefined;
  constructor(readonly content: WorkflowContent, readonly baseId: string | undefined, private readonly selected: () => string, private readonly status: (message: string) => void, draft?: WorkflowDraft) {
    this.id = draft?.id ?? cid(); this.revision = draft?.revision ?? 0;
  }
  changed(): void {
    this.sequence++; this.status('正在保存草稿…'); clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush().catch(() => {}); }, 500);
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.writing) { await this.writing; if (this.saved < this.sequence) await this.flush(); return; }
    this.writing = this.write();
    try { await this.writing; } finally { this.writing = undefined; }
  }
  private async write(): Promise<void> {
    try {
      while (this.saved < this.sequence) {
        const sequence = this.sequence;
        const next: WorkflowDraft = await api('saveDraft', { id: this.id, expectedRevision: this.revision, content: structuredClone(this.content), selectedNode: this.selected(), ...(this.baseId ? { baseId: this.baseId } : {}) });
        this.revision = next.revision; this.saved = sequence;
      }
      this.status('草稿已保存');
    } catch (error) {
      this.status(`草稿保存失败：${error instanceof Error ? error.message : String(error)}`); throw error;
    }
  }
  async saveCopy(): Promise<void> {
    if (this.writing) await this.writing.catch(() => {});
    this.id = cid(); this.revision = 0; this.saved = -1; await this.flush();
  }
}
