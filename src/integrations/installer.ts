import type { ExecutorAdapter } from "../executors/types.js";

export class IntegrationInstaller {
  constructor(
    readonly appPath: string,
    readonly executors: ExecutorAdapter[],
  ) {}
  async install(): Promise<Record<string, string>> {
    const entries = await Promise.all(
      this.executors.map(async (adapter) => {
        try {
          if (adapter.isInstalled && !(await adapter.isInstalled()))
            return [adapter.id, "not-installed"] as const;
          return [
            adapter.id,
            adapter.installation === "EXPLICIT" ? "requires-explicit-setup" : (await adapter.install?.(this.appPath)) ?? "not-required",
          ] as const;
        } catch (error) {
          return [adapter.id, `unavailable: ${String(error)}`] as const;
        }
      }),
    );
    return Object.fromEntries(entries);
  }
}
