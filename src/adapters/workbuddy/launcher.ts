import { app, shell } from "electron";

export interface WorkBuddyLauncher {
  inspect?(): Promise<void>;
  openNewConversation(deepLink: string): Promise<"opened">;
}

export class ElectronWorkBuddyLauncher implements WorkBuddyLauncher {
  async inspect(): Promise<void> {
    try { await app.getApplicationInfoForProtocol("workbuddy://task"); }
    catch { throw new Error("未找到 WorkBuddy 的任务打开入口，请安装或重新打开 WorkBuddy。"); }
  }
  async openNewConversation(deepLink: string): Promise<"opened"> {
    await shell.openExternal(deepLink);
    return "opened";
  }
}
