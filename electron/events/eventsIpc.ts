// 渲染层画布事件 → 单写者日志仓库(harness S5-a)。
// 渲染层只缓冲与投递;seq/ts/redact/截断/分段全部在 appendEvents 单点完成(§1.2 写路径唯一)。
import { ipcMain } from "electron";
import { appendEvents } from "./eventLogRepository";
import type { NewNomiEvent } from "./types";

export function registerEventsIpc(): void {
  ipcMain.handle("nomi:events:append", async (_event, payload: { projectId?: string; events?: unknown }) => {
    const projectId = String(payload?.projectId || "");
    const events = Array.isArray(payload?.events) ? (payload.events as NewNomiEvent[]) : [];
    const written = appendEvents(projectId, events);
    return { ok: true, count: written.length };
  });
}
