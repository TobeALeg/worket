import { dialog, type BrowserWindow, type IpcMain } from "electron";
import { writeFileSync, chmodSync } from "node:fs";
import { normalizeImage } from "./images.js";
import type { ProblemReports } from "./service.js";
import { ensure } from "../contracts/definition.js";
export function registerProblemReports(ipc: IpcMain, window: ()=>BrowserWindow | null, reports: ProblemReports): void {
  ipc.handle("feedback:command",async(event,action:unknown,input:unknown)=>{
    ensure(event.sender === window()?.webContents,"INVALID_SENDER");
    switch(action) {
      case "draft": return reports.draft();
      case "save": return reports.save(input);
      case "add-image": return reports.add(normalizeImage(input));
      case "remove-image": ensure(typeof input === "string","INVALID_INPUT");return reports.remove(input);
      case "discard": reports.store.discard();return null;
      case "fault": return reports.fault();
      case "submit": return reports.submit(input);
      case "list": return reports.store.reports().filter(r=>r.scope===reports.client.scope());
      case "get": ensure(typeof input === "string","INVALID_INPUT"); {const item=reports.store.get(input);ensure(item.scope===reports.client.scope(),"AUTH_CHANGED");return item;}
      case "remote": return reports.client.request("/v1/problem-reports");
      case "remote-detail": ensure(typeof input === "string" && /^[a-f0-9-]{36}$/.test(input),"INVALID_INPUT");return reports.client.request(`/v1/problem-reports/${input}`);
      case "retry": ensure(typeof input === "string","INVALID_INPUT");reports.retry(input);return null;
      case "cancel": ensure(typeof input === "string","INVALID_INPUT");await reports.cancel(input);return null;
      case "delete-remote": ensure(typeof input === "string" && /^[a-f0-9-]{36}$/.test(input),"INVALID_INPUT");return reports.client.request(`/v1/problem-reports/${input}`,"DELETE");
      case "capture": {
        const panel=window();ensure(panel && !panel.isDestroyed(),"INVALID_STATE");
        const image=await panel.webContents.capturePage();return normalizeImage(image.toPNG().toString("base64"));
      }
      case "add-capture": {
        // Captures are normalized once more. No arbitrary paths are accepted over IPC.
        const image=input as {data?:unknown}; return reports.add(normalizeImage(image?.data));
      }
      case "export": {
        ensure(typeof input === "string","INVALID_INPUT");const item=reports.store.get(input);
        ensure(item.scope === reports.client.scope() && item.envelope,"AUTH_CHANGED");
        const target=await dialog.showSaveDialog({defaultPath:`worket-feedback-${item.id}.json`,filters:[{name:"诊断包",extensions:["json"]}]});
        if(!target.canceled && target.filePath){writeFileSync(target.filePath,JSON.stringify(item.envelope),{mode:0o600});chmodSync(target.filePath,0o600);}
        return !target.canceled;
      }
      case "renderer-error": reports.diagnostics.event("renderer","failed",{code:"RENDERER_ERROR"});return null;
      default: throw new Error("未知反馈操作");
    }
  });
}
