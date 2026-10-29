import { hostname } from 'node:os';
import { executionProvenance } from './provenance.js';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { currentSourceEvents } from '../core/source-revisions.js';
import type { WorkSnapshot } from '../core/types.js';
import type { WorkCore } from '../core/types.js';
import { ensure, object, string } from '../contracts/definition.js';
import { hash, MaterialStore } from '../definitions/storage.js';
import { buildWorkPackage, isDefinitionStart, packageMarkdown } from '../definitions/work-package.js';
import { deliveryFooter } from '../executors/delivery-markers.js';
import { DeliveryLedger } from '../connectors/delivery-ledger.js';
import type { LocalDefaults, LocalExecutionRecord, LocalManifest, LocalRunner, LocalRunnerEvent, LocalStatus } from './types.js';

type State = Omit<LocalExecutionRecord, 'manifest' | 'manifestHash' | 'events'>;
const unsettled = new Set<LocalStatus>(['STARTING', 'RUNNING', 'WAITING_APPROVAL', 'UNKNOWN']);

/** One local launch per work. Ambiguous external outcomes are never retried as a new task. */
export class LocalExecution {
  readonly db;
  #closed = false;
  constructor(readonly core: WorkCore, readonly runner: LocalRunner, readonly sourceDirectory?: (work: WorkSnapshot) => Promise<string | undefined>) {
    this.db = core.definitions.db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS local_projects (id TEXT PRIMARY KEY, directory TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS local_execution_defaults (definition_key TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES local_projects(id), files_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS local_executions (work_id TEXT PRIMARY KEY REFERENCES work_instances(id) ON DELETE CASCADE,
        manifest_json TEXT NOT NULL, manifest_hash TEXT NOT NULL, state_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS local_execution_commands (command_id TEXT PRIMARY KEY, work_id TEXT NOT NULL REFERENCES local_executions(work_id) ON DELETE CASCADE, request_hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS local_execution_events (id INTEGER PRIMARY KEY, work_id TEXT NOT NULL REFERENCES local_executions(work_id) ON DELETE CASCADE, at TEXT NOT NULL, kind TEXT NOT NULL, data_json TEXT NOT NULL);
    `);
    for (const row of this.db.prepare('SELECT work_id,state_json FROM local_executions').all()) {
      const state = JSON.parse(String(row.state_json)) as State;
      if (unsettled.has(state.status) && state.status !== 'UNKNOWN') {
        state.status = 'UNKNOWN'; state.approvals = []; state.error = 'Worket 已重新启动，请先核对原聊天；不会重复发起。';
        this.#save(String(row.work_id), state);
      }
    }
  }
  async defaults(definitionId: string): Promise<LocalDefaults> {
    const definition = this.core.definitions.get(definitionId);
    const row = this.db.prepare('SELECT p.directory,d.files_json FROM local_execution_defaults d JOIN local_projects p ON p.id=d.project_id WHERE d.definition_key=?').get(definition.definitionKey);
    if (row) return { directory: String(row.directory), files: JSON.parse(String(row.files_json)), origin: 'REMEMBERED' };
    const directories = new Set<string>();
    const sourceWorkIds: string[] = [];
    for (const workId of new Set(definition.refs.filter(ref => !ref.deleted).map(ref => ref.workId))) {
      const work = this.core.getWork(workId);
      if (!work) continue;
      // A prompt's cwd is the source session workspace; tool calls may use unrelated subdirectories.
      const prompt = currentSourceEvents(work.sourceArchive).findLast(event => event.kind === 'user.prompt' && typeof event.metadata.cwd === 'string');
      const directory = this.summary(workId)?.directory ?? (prompt?.metadata.cwd as string | undefined)
        ?? await this.sourceDirectory?.(work);
      if (!directory || !isAbsolute(directory)) continue;
      let canonical = directory;
      try { canonical = realpathSync(directory); } catch { /* Keep a missing known project visible; never silently replace it. */ }
      directories.add(canonical); sourceWorkIds.push(workId);
    }
    if (directories.size === 1) return { directory: [...directories][0]!, files: [], origin: 'SOURCE', sourceWorkIds };
    return { directory: join(dirname(this.core.definitions.materials.directory), 'local-projects', encodeURIComponent(definition.definitionKey)), files: [], origin: 'DEFAULT' };
  }
  get(workId: string): LocalExecutionRecord | null {
    const row = this.db.prepare('SELECT * FROM local_executions WHERE work_id=?').get(workId);
    if (!row) return null;
    const manifest = JSON.parse(String(row.manifest_json)) as LocalManifest;
    ensure(hash(manifest) === row.manifest_hash, 'EXECUTION_MANIFEST_CHANGED', '执行清单校验失败');
    const events = this.db.prepare('SELECT at,kind,data_json FROM local_execution_events WHERE work_id=? ORDER BY id').all(workId)
      .map(event => ({ at: String(event.at), kind: String(event.kind), data: JSON.parse(String(event.data_json)) }));
    return { manifest, manifestHash: String(row.manifest_hash), ...JSON.parse(String(row.state_json)), events };
  }
  summary(workId: string): { status: LocalStatus; directory: string; lastMessage?: string } | undefined {
    const row = this.db.prepare('SELECT manifest_json,state_json FROM local_executions WHERE work_id=?').get(workId);
    if (!row) return;
    const state = JSON.parse(String(row.state_json)) as State;
    return { status: state.status, directory: (JSON.parse(String(row.manifest_json)) as LocalManifest).project.directory,
      ...(state.lastMessage ? { lastMessage: state.lastMessage } : {}) };
  }
  async start(input: { workId: string; files: string[]; commandId: string }): Promise<LocalExecutionRecord> {
    object(input); string(input.workId); string(input.commandId);
    ensure(Array.isArray(input.files) && input.files.length <= 32 && input.files.every(path => typeof path === 'string' && isAbsolute(path)), 'INVALID_EXECUTION_FILES');
    const requestHash = hash({ action: 'start', ...input });
    if (this.#replay(input.commandId, input.workId, requestHash)) return this.get(input.workId)!;
    ensure(!this.get(input.workId), 'ALREADY_STARTED', '此工作已有发起记录，请查看执行依据或在原聊天继续。');
    const before = this.core.getWork(input.workId);
    ensure(before?.definition.kind === 'REUSABLE', 'WORK_NOT_OPEN');
    const defaults = await this.defaults(before.definition.id);
    // Source lookup may await an adapter. Recheck before any write or external launch.
    if (this.#replay(input.commandId, input.workId, requestHash)) return this.get(input.workId)!;
    ensure(!this.get(input.workId), 'ALREADY_STARTED', '此工作已有发起记录，请查看执行依据或在原聊天继续。');
    const work = this.core.getWork(input.workId);
    ensure(work?.instance.status === 'OPEN' && work.definition.kind === 'REUSABLE', 'WORK_NOT_OPEN');
    ensure(!this.core.workflows.context(input.workId), 'WORKFLOW_OWNS_DISPATCH', '流程节点请从所属流程开展');
    ensure(!work.activeBinding && isDefinitionStart(work), 'ALREADY_STARTED', '已有执行记录，请继续原工作');
    if (defaults.origin === 'DEFAULT') mkdirSync(defaults.directory, { recursive: true });
    ensure(existsSync(defaults.directory) && statSync(defaults.directory).isDirectory(), 'PROJECT_DIRECTORY_UNAVAILABLE', `原项目文件夹不可用：${defaults.directory}`);
    const directory = realpathSync(defaults.directory);
    const definition = this.core.definitions.get(work.definition.id);
    const pkg = buildWorkPackage(work, this.core.definitions);
    const id = randomUUID();
    const store = new MaterialStore(join(this.core.definitions.instanceFiles.store(input.workId).directory, 'execution', id));
    const files = [...new Set([...(existsSync(join(directory, 'AGENTS.md')) ? [join(directory, 'AGENTS.md')] : []), ...input.files].map(path => realpathSync(path)))];
    const projectMaterials = files.map(path => store.copy(path, 'project-reference', true));
    let project = this.db.prepare('SELECT id FROM local_projects WHERE directory=?').get(directory);
    if (!project) { project = { id: randomUUID() }; this.db.prepare('INSERT INTO local_projects VALUES (?,?)').run(String(project.id), directory); }
    const delivery = this.core.createHandoffPackage(input.workId);
    const active = this.core.startExecutionEpisode(input.workId, {
      executor: { type: 'AGENT', name: 'Codex' }, environment: { type: 'CODEX_DESKTOP', name: 'Codex · 本地自动执行' },
      source: { adapter: 'codex', conversationId: `pending:${delivery.id}` }, endCurrentEpisode: true,
    });
    const prompt = ['请按以下已确认工作约定与本次输入开始执行。', '', packageMarkdown(pkg, work),
      '', `本次项目文件夹：${directory}`, '本次新建文件使用项目内的独立目录，遵守项目命名约定，不覆盖其他工作。中间需要修改或验收时可以停下，不将回合结束当作验收通过。',
      ...(projectMaterials.length ? ['', '发起时固定的项目资料（以下副本保留当时内容，请按各资料用途读取）：', ...projectMaterials.map(m => `${basename(m.originalPath)}\n原位置：${m.originalPath}\n本次固定副本：${m.path}`)] : []),
      '', deliveryFooter(input.workId, delivery.id, true)].join('\n');
    const manifest: LocalManifest = { id, workId: input.workId, episodeId: active.activeEpisode!.id, deliveryId: delivery.id,
      createdAt: new Date().toISOString(), project: { id: String(project.id), directory, resolution: defaults.origin, ...(defaults.sourceWorkIds ? { sourceWorkIds: defaults.sourceWorkIds } : {}) }, executorId: 'codex',
      host: { name: hostname(), platform: process.platform, arch: process.arch },
      ...executionProvenance(directory),
      permissionRequest: { sandbox: 'workspace-write', approvalPolicy: 'on-request' }, workPackage: pkg, projectMaterials, prompt };
    const state: State = { status: 'STARTING', approvals: [] };
    this.db.prepare('INSERT INTO local_executions VALUES (?,?,?,?)').run(input.workId, JSON.stringify(manifest), hash(manifest), JSON.stringify(state));
    this.db.prepare('INSERT INTO local_execution_commands VALUES (?,?,?)').run(input.commandId, input.workId, requestHash);
    this.db.prepare('INSERT INTO local_execution_defaults VALUES (?,?,?) ON CONFLICT(definition_key) DO UPDATE SET project_id=excluded.project_id,files_json=excluded.files_json')
      .run(definition.definitionKey, String(project.id), JSON.stringify(input.files));
    new DeliveryLedger(this.db).record(input.workId, delivery.id, prompt);
    this.#event(input.workId, 'start-requested', { commandId: input.commandId, manifestId: id });
    try { await this.runner.start({ prompt, cwd: directory, onEvent: event => this.#observe(input.workId, event) }); }
    catch (error) { this.#unknown(input.workId, error); }
    return this.get(input.workId)!;
  }
  async continue(input: { workId: string; text: string; commandId: string }): Promise<LocalExecutionRecord> {
    object(input); string(input.workId); string(input.text); string(input.commandId);
    ensure(input.text.trim().length > 0 && input.text.length <= 100_000, 'INVALID_INPUT');
    const digest = hash({ action: 'continue', ...input });
    if (this.#replay(input.commandId, input.workId, digest)) return this.get(input.workId)!;
    const record = this.get(input.workId);
    ensure(record?.threadId && !unsettled.has(record.status), 'EXECUTION_NOT_IDLE', '请先等待本轮结束或核对执行状态');
    ensure(this.core.getWork(input.workId)?.instance.status === 'OPEN', 'WORK_NOT_OPEN');
    ensure(realpathSync(record.manifest.project.directory) === record.manifest.project.directory, 'PROJECT_MOVED');
    this.db.prepare('INSERT INTO local_execution_commands VALUES (?,?,?)').run(input.commandId, input.workId, digest);
    this.#event(input.workId, 'follow-up', { text: input.text, commandId: input.commandId });
    this.#update(input.workId, state => { state.status = 'STARTING'; state.approvals = []; delete state.error; });
    try { await this.runner.continue(record.threadId, { prompt: input.text, cwd: record.manifest.project.directory, onEvent: event => this.#observe(input.workId, event) }); }
    catch (error) { this.#unknown(input.workId, error); }
    return this.get(input.workId)!;
  }
  requireIdle(workId: string): void {
    const status = this.summary(workId)?.status;
    ensure(!status || !unsettled.has(status), 'EXECUTION_NOT_IDLE', '请先在执行依据中停止或核对本地执行，再进行此操作。');
  }
  async reconcile(workId: string): Promise<LocalExecutionRecord> {
    const record = this.get(workId);
    ensure(record?.threadId, 'THREAD_NOT_KNOWN', '尚未获得聊天编号，请检查执行者后再处理；不会重复发起。');
    await this.runner.inspect(record.threadId, event => this.#observe(workId, event));
    this.#event(workId, 'status-checked', {});
    return this.get(workId)!;
  }
  materialPath(workId: string, path: string): string {
    const record = this.get(workId);
    const material = record?.manifest.projectMaterials.find(item => item.path === path);
    ensure(material && hash(readFileSync(material.path)) === material.hash, 'MATERIAL_CHANGED', '固定副本缺失或发生变化');
    return material.path;
  }
  approve(workId: string, requestId: string, accept: boolean): void {
    ensure(typeof accept === 'boolean', 'INVALID_APPROVAL');
    const record = this.get(workId);
    ensure(record?.threadId && record.approvals.some(item => item.id === requestId), 'APPROVAL_EXPIRED');
    this.runner.approve(record.threadId, requestId, accept);
    this.#event(workId, 'approval-response', { requestId, accept });
    this.#update(workId, state => { state.approvals = state.approvals.filter(item => item.id !== requestId); state.status = state.approvals.length ? 'WAITING_APPROVAL' : 'RUNNING'; });
  }
  async interrupt(workId: string): Promise<void> {
    const record = this.get(workId);
    ensure(record?.threadId && record.turnId && ['RUNNING', 'WAITING_APPROVAL'].includes(record.status), 'EXECUTION_NOT_RUNNING');
    await this.runner.interrupt(record.threadId, record.turnId);
    this.#event(workId, 'interrupt-requested', {});
  }
  close(): void {
    this.#closed = true; this.runner.close();
    for (const row of this.db.prepare('SELECT work_id,state_json FROM local_executions').all()) {
      const state = JSON.parse(String(row.state_json)) as State;
      if (unsettled.has(state.status)) { state.status = 'UNKNOWN'; state.approvals = []; state.error = '执行连接已关闭，请核对原聊天。'; this.#save(String(row.work_id), state); }
    }
  }
  #replay(commandId: string, workId: string, digest: string): boolean {
    const row = this.db.prepare('SELECT * FROM local_execution_commands WHERE command_id=?').get(commandId);
    if (!row) return false;
    ensure(row.work_id === workId && row.request_hash === digest, 'COMMAND_CONFLICT', '同一请求不能用于不同的执行内容'); return true;
  }
  #event(workId: string, kind: string, data: Record<string, unknown>): void {
    this.db.prepare('INSERT INTO local_execution_events(work_id,at,kind,data_json) VALUES (?,?,?,?)').run(workId, new Date().toISOString(), kind, JSON.stringify(data));
  }
  #save(workId: string, state: State): void { this.db.prepare('UPDATE local_executions SET state_json=? WHERE work_id=?').run(JSON.stringify(state), workId); }
  #update(workId: string, update: (state: State) => void): void {
    const row = this.db.prepare('SELECT state_json FROM local_executions WHERE work_id=?').get(workId);
    if (!row) return;
    const state = JSON.parse(String(row.state_json)) as State; update(state); this.#save(workId, state);
  }
  #unknown(workId: string, error: unknown): void {
    this.#event(workId, 'connection-error', { error: String(error) });
    this.#update(workId, state => { if (unsettled.has(state.status)) { state.status = 'UNKNOWN'; state.error = `启动或连接结果待核对，不会重复发起。${String(error)}`; } });
  }
  #observe(workId: string, event: LocalRunnerEvent): void {
    if (this.#closed || !this.core.getWork(workId)) return;
    this.#event(workId, event.type, event as unknown as Record<string, unknown>);
    if (event.type === 'thread') {
      const record = this.get(workId)!;
      const pending = `pending:${record.manifest.deliveryId}`;
      if (this.core.getWork(workId)?.activeBinding?.conversationId === pending) this.core.bindConversation(workId, 'codex', pending, event.threadId);
    }
    this.#update(workId, state => {
      if (event.type === 'thread') Object.assign(state, { threadId: event.threadId }, event.model ? { model: event.model } : {}, event.runtime ? { runtime: event.runtime } : {}, event.sessionPolicy ? { sessionPolicy: event.sessionPolicy } : {});
      if (event.type === 'turn') {
        // A fast turn can finish before the initial turn/start response arrives.
        if (state.turnId === event.turnId && !unsettled.has(state.status) && event.status === 'RUNNING') return;
        state.turnId = event.turnId;
        if (!(state.status === 'WAITING_APPROVAL' && event.status === 'RUNNING')) state.status = event.status;
        if (!unsettled.has(event.status)) { state.approvals = []; delete state.error; }
        if (event.error) state.error = event.error;
      }
      if (event.type === 'approval') { state.approvals.push(event.approval); state.status = 'WAITING_APPROVAL'; }
      if (event.type === 'observation' && event.kind === 'reply' && typeof event.data.text === 'string') state.lastMessage = event.data.text;
      if (event.type === 'disconnected' && unsettled.has(state.status)) { state.status = 'UNKNOWN'; state.approvals = []; state.error = event.error; }
    });
  }
}
