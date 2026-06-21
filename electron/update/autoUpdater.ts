import { app, BrowserWindow, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";

// 版本号 + 检查更新 + 一键更新（功能需求 1/2/3）。
// GitHub Releases provider 由 package.json build.publish 自动派生，无需额外服务器。
// 全程用户显式触发：关自动下载 / 关退出即装，下载与安装都必须用户点（P2 用户掌控）。

type AppInfo = { version: string; platform: NodeJS.Platform; arch: string };

const EVENT_CHANNEL = "nomi:update:event";

function broadcast(payload: Record<string, unknown>): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(EVENT_CHANNEL, payload);
  }
}

function describeError(error: unknown): string {
  if (error == null) return "未知错误";
  if (error instanceof Error) return error.message || String(error);
  return String(error);
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, "").replace(/\s+\n/g, "\n").trim();
}

type ReleaseNote = { version: string; note: string | null };

function normalizeNotes(notes: string | ReleaseNote[] | null | undefined): string {
  if (!notes) return "";
  if (typeof notes === "string") return stripHtml(notes);
  return notes
    .map((entry) => stripHtml(entry.note || ""))
    .filter(Boolean)
    .join("\n");
}

let eventsWired = false;

function wireUpdaterEvents(): void {
  if (eventsWired) return;
  eventsWired = true;
  autoUpdater.on("checking-for-update", () => broadcast({ type: "checking" }));
  autoUpdater.on("update-available", (info) =>
    broadcast({ type: "available", version: info.version, notes: normalizeNotes(info.releaseNotes) }));
  autoUpdater.on("update-not-available", () => broadcast({ type: "up-to-date" }));
  autoUpdater.on("download-progress", (progress) =>
    broadcast({ type: "progress", percent: Math.max(0, Math.min(100, Math.round(progress.percent))) }));
  autoUpdater.on("update-downloaded", (info) => broadcast({ type: "downloaded", version: info.version }));
  autoUpdater.on("error", (error) => broadcast({ type: "error", message: describeError(error) }));
}

export function registerUpdaterIpc(): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  // electron-updater 默认日志器会刷屏 + 抢崩溃日志，错误统一走事件透传给用户，关掉它。
  autoUpdater.logger = null;
  wireUpdaterEvents();

  ipcMain.handle("nomi:app:version", (): AppInfo => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
  }));

  ipcMain.handle("nomi:update:check", async () => {
    // 未打包（dev）时 electron-updater 不可用——诚实回错，不假装能更新。
    if (!app.isPackaged) {
      broadcast({ type: "error", message: "开发模式下不可用，请在安装版中检查更新" });
      return { ok: false, reason: "not-packaged" };
    }
    try {
      await autoUpdater.checkForUpdates();
      return { ok: true };
    } catch (error) {
      broadcast({ type: "error", message: describeError(error) });
      return { ok: false };
    }
  });

  ipcMain.handle("nomi:update:download", async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (error) {
      broadcast({ type: "error", message: describeError(error) });
      return { ok: false };
    }
  });

  ipcMain.handle("nomi:update:install", () => {
    // 立即重启并安装（非静默）。mac 未签名会被 Gatekeeper 拦——降级实况以真机为准。
    setImmediate(() => {
      try {
        autoUpdater.quitAndInstall();
      } catch (error) {
        broadcast({ type: "error", message: describeError(error) });
      }
    });
    return { ok: true };
  });
}
