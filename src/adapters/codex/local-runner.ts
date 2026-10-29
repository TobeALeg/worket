import { CodexAppServerClient } from './app-server-client.js';
import type { LocalRunner, LocalStartRequest } from '../../execution/types.js';

/** Separate from history reads: this connection owns execution and approvals. */
export class CodexLocalRunner implements LocalRunner {
  readonly #tasks = new Map<string, LocalStartRequest>();
  readonly #requests = new Map<string, { rpcId: string | number; threadId: string; method: string }>();
  #closed = false;
  constructor(readonly client = new CodexAppServerClient()) {
    client.onEvent((method, params) => this.#event(method, params));
    client.onDisconnect(error => {
      if (!this.#closed) for (const input of this.#tasks.values()) input.onEvent({ type: 'disconnected', error: error.message });
      this.#requests.clear();
    });
    client.requestHandler = (id, method, params) => {
      const task = this.#tasks.get(params.threadId);
      const supported = ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(method);
      if (!task || !supported) {
        // No silent grants. Unsupported interactions are declined and recorded.
        if (method === 'item/tool/requestUserInput') client.respond(id, { answers: {} });
        else if (method === 'item/permissions/requestApproval') client.respond(id, { permissions: {}, scope: 'turn' });
        else if (method === 'mcpServer/elicitation/request') client.respond(id, { action: 'decline', content: null });
        else if (supported) client.respond(id, { decision: 'decline' });
        else client.rejectRequest(id, 'Worket does not support this interactive request');
        task?.onEvent({ type: 'observation', kind: 'interaction-declined', data: { method, reason: '本次交互未授予；可在工作里补充说明后继续。' } });
        return;
      }
      const key = String(id);
      this.#requests.set(key, { rpcId: id, threadId: params.threadId, method });
      task.onEvent({ type: 'approval', approval: { id: key, method,
        title: method.includes('commandExecution') ? '执行命令需要批准' : '修改文件需要批准',
        detail: [params.reason, params.command, params.cwd, params.grantRoot].filter(Boolean).join('\n') || '执行者申请本次操作权限。',
      } });
    };
  }
  async start(input: LocalStartRequest): Promise<void> {
    const started = await this.client.rpc('thread/start', {
      cwd: input.cwd, sandbox: 'workspace-write', approvalPolicy: 'on-request', approvalsReviewer: 'user',
    });
    const threadId = started.thread.id as string;
    this.#tasks.set(threadId, input);
    input.onEvent({ type: 'thread', threadId, model: started.model, runtime: this.client.runtimeIdentity,
      sessionPolicy: { sandbox: started.sandbox, approvalPolicy: started.approvalPolicy, approvalsReviewer: started.approvalsReviewer },
    });
    await this.#turn(threadId, input.prompt);
  }
  async continue(threadId: string, input: LocalStartRequest): Promise<void> {
    const resumed = await this.client.rpc('thread/resume', { threadId, cwd: input.cwd, sandbox: 'workspace-write', approvalPolicy: 'on-request', approvalsReviewer: 'user' });
    if (resumed.thread.id !== threadId) throw new Error('执行者未恢复原聊天');
    this.#tasks.set(threadId, input);
    input.onEvent({ type: 'thread', threadId, model: resumed.model, runtime: this.client.runtimeIdentity,
      sessionPolicy: { sandbox: resumed.sandbox, approvalPolicy: resumed.approvalPolicy, approvalsReviewer: resumed.approvalsReviewer },
    });
    await this.#turn(threadId, input.prompt);
  }
  async #turn(threadId: string, prompt: string): Promise<void> {
    const result = await this.client.rpc('turn/start', { threadId, input: [{ type: 'text', text: prompt }] });
    this.#tasks.get(threadId)?.onEvent({ type: 'turn', turnId: result.turn.id, status: 'RUNNING' });
  }
  async inspect(threadId: string, onEvent: LocalStartRequest['onEvent']): Promise<void> {
    const result = await this.client.rpc('thread/read', { threadId, includeTurns: true });
    const turn = result.thread.turns?.at(-1);
    if (!turn || !['completed', 'interrupted', 'failed'].includes(turn.status)) return;
    for (const item of turn.items ?? []) if (item.type === 'agentMessage' && item.phase !== 'commentary')
      onEvent({ type: 'observation', kind: 'reply', data: { text: item.text } });
    onEvent({ type: 'turn', turnId: turn.id, status: turn.status === 'completed' ? 'TURN_ENDED' : turn.status === 'interrupted' ? 'INTERRUPTED' : 'FAILED' });
  }
  approve(threadId: string, requestId: string, accept: boolean): void {
    const request = this.#requests.get(requestId);
    if (!request || request.threadId !== threadId) throw new Error('此权限请求已失效，请刷新工作');
    this.client.respond(request.rpcId, { decision: accept ? 'accept' : 'decline' });
    this.#requests.delete(requestId);
  }
  async interrupt(threadId: string, turnId: string): Promise<void> {
    await this.client.rpc('turn/interrupt', { threadId, turnId });
  }
  close(): void { this.#closed = true; this.client.close(); this.#tasks.clear(); this.#requests.clear(); }
  #event(method: string, params: any): void {
    const input = this.#tasks.get(params?.threadId);
    if (!input) return;
    if (method === 'turn/started') input.onEvent({ type: 'turn', turnId: params.turn.id, status: 'RUNNING' });
    if (method === 'turn/completed') input.onEvent({ type: 'turn', turnId: params.turn.id,
      status: params.turn.status === 'completed' ? 'TURN_ENDED' : params.turn.status === 'interrupted' ? 'INTERRUPTED' : 'FAILED',
      ...(params.turn.error ? { error: params.turn.error.message ?? JSON.stringify(params.turn.error) } : {}),
    });
    if (method === 'item/completed') {
      const item = params.item;
      if (item.type === 'agentMessage' && item.phase !== 'commentary') input.onEvent({ type: 'observation', kind: 'reply', data: { text: item.text, turnId: params.turnId } });
      if (item.type === 'commandExecution') input.onEvent({ type: 'observation', kind: 'command', data: { command: item.command, cwd: item.cwd, exitCode: item.exitCode, turnId: params.turnId } });
      if (item.type === 'fileChange') input.onEvent({ type: 'observation', kind: 'files', data: { changes: item.changes?.map((change: any) => ({ path: change.path, kind: change.kind })), status: item.status, turnId: params.turnId } });
    }
  }
}
