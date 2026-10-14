export class ExecutorNotRunningError extends Error {
  constructor(name: string) {
    super(`${name} 未运行`);
  }
}
