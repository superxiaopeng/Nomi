import { BrowserWindow, WebContentsView, ipcMain, screen, session, shell } from "electron";
import type { DownloadItem, Rectangle, Session, WebContents } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extensionFromMime, extensionFromUrl } from "../assets/assetPaths";

const BROWSER_ACCEPT_LANGUAGE = "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7";
const BROWSER_CHROME_MAJOR_VERSION = Math.max(120, Number.parseInt(process.versions.chrome?.split(".")[0] || "", 10) || 124);
const BROWSER_CHROME_VERSION = `${BROWSER_CHROME_MAJOR_VERSION}.0.0.0`;
const BROWSER_SEC_CH_UA = `"Google Chrome";v="${BROWSER_CHROME_MAJOR_VERSION}", "Chromium";v="${BROWSER_CHROME_MAJOR_VERSION}", "Not.A/Brand";v="99"`;
const BROWSER_SEC_CH_UA_PLATFORM =
  process.platform === "darwin" ? "macOS" : process.platform === "linux" ? "Linux" : "Windows";
const BROWSER_UA_PLATFORM =
  process.platform === "darwin"
    ? "Macintosh; Intel Mac OS X 10_15_7"
    : process.platform === "linux"
      ? "X11; Linux x86_64"
      : "Windows NT 10.0; Win64; x64";
const STANDARD_CHROME_UA =
  `Mozilla/5.0 (${BROWSER_UA_PLATFORM}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${BROWSER_CHROME_VERSION} Safari/537.36`;
const configuredBrowserSessions = new WeakSet<Session>();
const browserSessionProxyPromises = new WeakMap<Session, Promise<void>>();

type BrowserViewRecord = {
  viewId: number;
  tabId: string;
  ownerWindowId: number;
  view: WebContentsView;
  lastBounds: Rectangle;
  resourceCaptureEnabled: boolean;
  promptCategories: BrowserPromptCategory[];
};

type BrowserViewCreatePayload = {
  tabId?: unknown;
  partition?: unknown;
};

type BrowserViewIdPayload = {
  viewId?: unknown;
};

type BrowserViewNavigatePayload = BrowserViewIdPayload & {
  url?: unknown;
};

type BrowserViewResizePayload = BrowserViewIdPayload & {
  bounds?: Partial<Rectangle>;
};

type BrowserViewImportImagePayload = BrowserViewIdPayload & {
  projectId?: unknown;
  url?: unknown;
  fileName?: unknown;
  title?: unknown;
};

type BrowserViewImportMediaPayload = BrowserViewImportImagePayload & {
  mediaType?: unknown;
};

type BrowserViewPromptImagePayload = BrowserViewIdPayload & {
  projectId?: unknown;
  url?: unknown;
  fileName?: unknown;
  title?: unknown;
};

type BrowserViewPromptScreenshotPayload = BrowserViewIdPayload & {
  projectId?: unknown;
  fileName?: unknown;
  title?: unknown;
  sourceRect?: BrowserResourceCaptureRectPayload;
};

type BrowserChromeMenuItemPayload = {
  id?: unknown;
  label?: unknown;
  description?: unknown;
  type?: unknown;
  enabled?: unknown;
};

type BrowserChromeMenuPayload = {
  x?: unknown;
  y?: unknown;
  width?: unknown;
  items?: unknown;
};

type BrowserResourceCaptureRectPayload = {
  left?: unknown;
  top?: unknown;
  width?: unknown;
  height?: unknown;
};

type BrowserResourceCapturePayload = {
  url?: unknown;
  mediaType?: unknown;
  title?: unknown;
  fileName?: unknown;
  pageUrl?: unknown;
  pageTitle?: unknown;
  extractionMode?: unknown;
  sourceRect?: BrowserResourceCaptureRectPayload;
};

type BrowserPromptCategory = {
  id: string;
  label: string;
};

type BrowserPromptCategoriesPayload = BrowserViewIdPayload & {
  categories?: unknown;
};

type BrowserPromptScreenshotSelectionResult =
  | {
      ok: true;
      rect: { left: number; top: number; width: number; height: number };
    }
  | {
      ok: false;
      reason?: "cancelled" | "error";
      message?: string;
    };

type BrowserDownloadResult = {
  absolutePath: string;
  fileName: string;
  contentType: string;
  mediaType: "image" | "video" | null;
  cleanupDir: string;
};

type BrowserAssetOverlayDockMode = "left" | "right" | null;

type BrowserAssetOverlayRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type BrowserAssetOverlayCaptureRequest = {
  requestId?: unknown;
  url?: unknown;
  mediaType?: unknown;
  title?: unknown;
  fileName?: unknown;
  sourceRect?: Partial<BrowserAssetOverlayRect>;
};

type BrowserAssetOverlayPromptRequest = {
  requestId?: unknown;
  sourceType?: unknown;
};

type BrowserAssetOverlayPayload = BrowserViewIdPayload & {
  bounds?: Partial<Rectangle>;
  captureRequest?: BrowserAssetOverlayCaptureRequest;
  promptRequest?: BrowserAssetOverlayPromptRequest;
};

type BrowserAssetOverlayStatePayload = {
  dockMode?: unknown;
  popoverRect?: Partial<BrowserAssetOverlayRect> | null;
  captureEnabled?: unknown;
};

type BrowserAssetOverlayRecord = {
  ownerWindowId: number;
  window: BrowserWindow;
  hostBounds: Rectangle;
  viewId: number | null;
  captureEnabled: boolean;
  rendererReady: boolean;
  pendingShow: boolean;
  pendingCaptureRequest: BrowserAssetOverlayCaptureRequest | null;
  pendingPromptRequest: BrowserAssetOverlayPromptRequest | null;
  dockMode: BrowserAssetOverlayDockMode;
  popoverRect: BrowserAssetOverlayRect | null;
  pointerInteractive: boolean;
  hoverInteractive: boolean;
  dragInteractive: boolean;
  hoverInteractiveTimer: NodeJS.Timeout | null;
  dragInteractiveResetTimer: NodeJS.Timeout | null;
};

type BrowserChromeMenuItem =
  | {
      id: string;
      label: string;
      description: string;
      type: "normal";
      enabled: boolean;
    }
  | {
      type: "separator";
    };

type BrowserChromeMenuRecord = {
  ownerWindowId: number;
  window: BrowserWindow;
  settled: boolean;
  resolve: (result: { id: string | null }) => void;
};

const browserViews = new Map<number, BrowserViewRecord>();
const browserViewsByWindow = new Map<number, Set<number>>();
const browserAssetOverlaysByWindow = new Map<number, BrowserAssetOverlayRecord>();
const browserChromeMenusByWindow = new Map<number, BrowserChromeMenuRecord>();
const browserChromeMenusByWebContents = new Map<number, BrowserChromeMenuRecord>();
let nextBrowserViewId = 1;
const BROWSER_IMAGE_DRAG_MIME = "application/x-nomi-browser-image";
const BROWSER_IMAGE_DRAG_START_CONSOLE_PREFIX = "__NOMI_BROWSER_IMAGE_DRAG_START__";
const BROWSER_IMAGE_DRAG_END_CONSOLE_MESSAGE = "__NOMI_BROWSER_IMAGE_DRAG_END__";
const BROWSER_IMAGE_PROMPT_CONSOLE_PREFIX = "__NOMI_BROWSER_IMAGE_PROMPT__";
const BROWSER_TEXT_PROMPT_CONSOLE_PREFIX = "__NOMI_BROWSER_TEXT_PROMPT__";
const DEFAULT_BROWSER_PROMPT_CATEGORIES: readonly BrowserPromptCategory[] = [
  { id: "image", label: "图片提示词" },
  { id: "video", label: "视频提示词" },
];
const BROWSER_PROFILE_PARTITION = "persist:nomi-browser-profile";
const BROWSER_MEDIA_MAX_BYTES = 200 * 1024 * 1024;
const BROWSER_ASSET_OVERLAY_SHAPE_SLOP = 10;
let browserAssetOverlayRendererUrlResolver: (() => string) | null = null;

function clampNumber(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function setRequestHeader(headers: Record<string, string | string[]>, name: string, value: string): void {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) delete headers[key];
  }
  headers[name] = value;
}

function configureBrowserSessionProxy(viewSession: Session): Promise<void> {
  const existing = browserSessionProxyPromises.get(viewSession);
  if (existing) return existing;
  const next = import("../systemProxy")
    .then(({ applySystemProxy }) => applySystemProxy(viewSession))
    .then(() => undefined)
    .catch((error) => {
      console.error("[nomi:browser] applySystemProxy for browser session failed:", error);
    });
  browserSessionProxyPromises.set(viewSession, next);
  return next;
}

async function configureBrowserSession(viewSession: Session): Promise<void> {
  viewSession.setUserAgent(STANDARD_CHROME_UA, BROWSER_ACCEPT_LANGUAGE);
  if (!configuredBrowserSessions.has(viewSession)) {
    configuredBrowserSessions.add(viewSession);
    viewSession.webRequest.onBeforeSendHeaders((details, callback) => {
      if (!/^https?:\/\//i.test(details.url)) {
        callback({});
        return;
      }
      const requestHeaders = { ...details.requestHeaders };
      setRequestHeader(requestHeaders, "User-Agent", STANDARD_CHROME_UA);
      setRequestHeader(requestHeaders, "Accept-Language", BROWSER_ACCEPT_LANGUAGE);
      setRequestHeader(requestHeaders, "Sec-CH-UA", BROWSER_SEC_CH_UA);
      setRequestHeader(requestHeaders, "Sec-CH-UA-Mobile", "?0");
      setRequestHeader(requestHeaders, "Sec-CH-UA-Platform", `"${BROWSER_SEC_CH_UA_PLATFORM}"`);
      callback({ requestHeaders });
    });
  }
  await configureBrowserSessionProxy(viewSession);
}

function getSenderWindow(sender: WebContents): BrowserWindow {
  const win = BrowserWindow.fromWebContents(sender);
  if (!win || win.isDestroyed()) throw new Error("Browser window is unavailable");
  return win;
}

function readViewId(payload: BrowserViewIdPayload): number {
  const value = Number(payload?.viewId);
  if (!Number.isFinite(value) || value <= 0) throw new Error("viewId is required");
  return value;
}

function getBrowserViewForSender(sender: WebContents, payload: BrowserViewIdPayload): BrowserViewRecord {
  const record = browserViews.get(readViewId(payload));
  if (!record) throw new Error("Browser view not found");
  const win = getSenderWindow(sender);
  const parent = win.getParentWindow();
  if (record.ownerWindowId !== win.id && record.ownerWindowId !== parent?.id) {
    throw new Error("Browser view belongs to another window");
  }
  return record;
}

function bringBrowserViewToFront(record: BrowserViewRecord): void {
  const win = BrowserWindow.fromId(record.ownerWindowId);
  if (!win || win.isDestroyed()) return;
  win.contentView.addChildView(record.view);
}

function getOwnerWindowForSender(sender: WebContents): BrowserWindow {
  const win = getSenderWindow(sender);
  const parent = win.getParentWindow();
  return parent && !parent.isDestroyed() ? parent : win;
}

function getOverlayForSender(sender: WebContents): BrowserAssetOverlayRecord | null {
  const owner = getOwnerWindowForSender(sender);
  return browserAssetOverlaysByWindow.get(owner.id) ?? null;
}

function normalizeOverlayBounds(bounds: Partial<Rectangle> | undefined): Rectangle {
  return normalizeBounds(bounds);
}

function normalizeOverlayDockMode(value: unknown): BrowserAssetOverlayDockMode {
  return value === "left" || value === "right" ? value : null;
}

function normalizePromptExtractionMode(value: unknown): "replicate" | "style" {
  return value === "style" ? "style" : "replicate";
}

function normalizePromptCategories(input: unknown): BrowserPromptCategory[] {
  const normalized: BrowserPromptCategory[] = [];
  const seen = new Set<string>();
  const pushCategory = (idValue: unknown, labelValue: unknown): void => {
    const id = typeof idValue === "string" ? idValue.trim() : "";
    const label = typeof labelValue === "string" ? labelValue.trim() : "";
    if (!id || !label || seen.has(id)) return;
    seen.add(id);
    normalized.push({ id, label });
  };

  for (const category of DEFAULT_BROWSER_PROMPT_CATEGORIES) {
    pushCategory(category.id, category.label);
  }
  if (Array.isArray(input)) {
    for (const category of input) {
      if (!category || typeof category !== "object") continue;
      const candidate = category as { id?: unknown; label?: unknown };
      pushCategory(candidate.id, candidate.label);
    }
  }
  return normalized;
}

function normalizeOverlayRect(rect: Partial<BrowserAssetOverlayRect> | null | undefined): BrowserAssetOverlayRect | null {
  if (!rect) return null;
  const left = Math.round(Number(rect.left));
  const top = Math.round(Number(rect.top));
  const width = Math.round(Number(rect.width));
  const height = Math.round(Number(rect.height));
  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  if (width <= 0 || height <= 0) return null;
  return {
    left,
    top,
    width,
    height,
    right: Math.round(Number(rect.right ?? left + width)),
    bottom: Math.round(Number(rect.bottom ?? top + height)),
  };
}

function sameRectangle(left: Rectangle | null | undefined, right: Rectangle | null | undefined): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

function sameOverlayRect(
  left: BrowserAssetOverlayRect | null | undefined,
  right: BrowserAssetOverlayRect | null | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.left === right.left &&
    left.top === right.top &&
    left.right === right.right &&
    left.bottom === right.bottom &&
    left.width === right.width &&
    left.height === right.height
  );
}

function overlayRendererUrl(): string {
  const base = browserAssetOverlayRendererUrlResolver?.();
  if (!base) throw new Error("Browser asset overlay renderer URL is unavailable");
  const url = new URL(base);
  url.searchParams.set("nomiOverlay", "browserAsset");
  url.hash = "/browser-asset-overlay";
  return url.toString();
}

function browserAssetOverlayWindowBounds(owner: BrowserWindow, hostBounds: Rectangle): Rectangle {
  const contentBounds = owner.getContentBounds();
  return {
    x: contentBounds.x + hostBounds.x,
    y: contentBounds.y + hostBounds.y,
    width: hostBounds.width,
    height: hostBounds.height,
  };
}

function sendBrowserAssetOverlayConfig(
  record: BrowserAssetOverlayRecord,
  captureRequest: BrowserAssetOverlayCaptureRequest | null = null,
  promptRequest: BrowserAssetOverlayPromptRequest | null = null,
): void {
  if (record.window.isDestroyed()) return;
  record.window.webContents.send("browser:asset-overlay:config", {
    opened: record.window.isVisible(),
    viewId: record.viewId,
    bounds: record.hostBounds,
    captureEnabled: record.captureEnabled,
    captureRequest,
    promptRequest,
  });
}

function sendBrowserAssetOverlayState(record: BrowserAssetOverlayRecord, opened = record.window.isVisible()): void {
  const owner = BrowserWindow.fromId(record.ownerWindowId);
  if (!owner || owner.isDestroyed()) return;
  owner.webContents.send("browser:asset-overlay:state", {
    opened,
    dockMode: opened ? record.dockMode : null,
    popoverRect: opened ? record.popoverRect : null,
    captureEnabled: opened ? record.captureEnabled : false,
  });
}

function setBrowserAssetOverlayShape(record: BrowserAssetOverlayRecord, rects: Rectangle[]): void {
  const shapedWindow = record.window as BrowserWindow & { setShape?: (rects: Rectangle[]) => void };
  try {
    shapedWindow.setShape?.(rects);
  } catch {
    // Shape support is platform-dependent; mouse forwarding remains as the fallback.
  }
}

function applyBrowserAssetOverlayShape(record: BrowserAssetOverlayRecord): void {
  if (record.window.isDestroyed()) return;
  if (!record.dockMode || !record.popoverRect) {
    setBrowserAssetOverlayShape(record, []);
    return;
  }
  const rawLeft = Math.round(record.popoverRect.left - record.hostBounds.x);
  const rawTop = Math.round(record.popoverRect.top - record.hostBounds.y);
  const rawRight = rawLeft + Math.round(record.popoverRect.width);
  const rawBottom = rawTop + Math.round(record.popoverRect.height);
  const left = clampNumber(rawLeft - BROWSER_ASSET_OVERLAY_SHAPE_SLOP, 0, record.hostBounds.width);
  const top = clampNumber(rawTop - BROWSER_ASSET_OVERLAY_SHAPE_SLOP, 0, record.hostBounds.height);
  const right = clampNumber(rawRight + BROWSER_ASSET_OVERLAY_SHAPE_SLOP, left + 1, record.hostBounds.width);
  const bottom = clampNumber(rawBottom + BROWSER_ASSET_OVERLAY_SHAPE_SLOP, top + 1, record.hostBounds.height);
  setBrowserAssetOverlayShape(record, [
    {
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    },
  ]);
}

function applyBrowserAssetOverlayMouseEvents(record: BrowserAssetOverlayRecord): void {
  if (record.window.isDestroyed()) return;
  const shapedDockInteractive = Boolean(record.dockMode && record.popoverRect);
  const interactive =
    shapedDockInteractive || record.pointerInteractive || record.hoverInteractive || record.dragInteractive;
  record.window.setIgnoreMouseEvents(!interactive, { forward: true });
}

function showBrowserAssetOverlay(
  record: BrowserAssetOverlayRecord,
  captureRequest: BrowserAssetOverlayCaptureRequest | null = null,
  promptRequest: BrowserAssetOverlayPromptRequest | null = null,
): void {
  if (record.window.isDestroyed()) return;
  if (!record.rendererReady) {
    record.pendingShow = true;
    if (captureRequest) record.pendingCaptureRequest = captureRequest;
    if (promptRequest) record.pendingPromptRequest = promptRequest;
    return;
  }
  record.pendingShow = false;
  const pendingCaptureRequest = captureRequest ?? record.pendingCaptureRequest;
  const pendingPromptRequest = promptRequest ?? record.pendingPromptRequest;
  record.pendingCaptureRequest = null;
  record.pendingPromptRequest = null;
  if (!record.window.isVisible()) record.window.showInactive();
  record.window.moveTop();
  sendBrowserAssetOverlayConfig(record, pendingCaptureRequest, pendingPromptRequest);
  sendBrowserAssetOverlayState(record, true);
}

function isCursorInsideBrowserAssetOverlayPopover(record: BrowserAssetOverlayRecord): boolean {
  if (!record.popoverRect) return false;
  const owner = BrowserWindow.fromId(record.ownerWindowId);
  if (!owner || owner.isDestroyed()) return false;
  const cursor = screen.getCursorScreenPoint();
  const contentBounds = owner.getContentBounds();
  const slop = record.dockMode ? 28 : 10;
  const left = contentBounds.x + record.popoverRect.left - slop;
  const top = contentBounds.y + record.popoverRect.top - slop;
  const right = contentBounds.x + record.popoverRect.right + slop;
  const bottom = contentBounds.y + record.popoverRect.bottom + slop;
  return cursor.x >= left && cursor.x <= right && cursor.y >= top && cursor.y <= bottom;
}

function updateBrowserAssetOverlayHoverInteractive(record: BrowserAssetOverlayRecord): void {
  const nextInteractive =
    !record.window.isDestroyed() && record.window.isVisible() && isCursorInsideBrowserAssetOverlayPopover(record);
  if (record.hoverInteractive === nextInteractive) return;
  record.hoverInteractive = nextInteractive;
  applyBrowserAssetOverlayMouseEvents(record);
}

function startBrowserAssetOverlayHoverTracking(record: BrowserAssetOverlayRecord): void {
  if (record.hoverInteractiveTimer) return;
  record.hoverInteractiveTimer = setInterval(() => updateBrowserAssetOverlayHoverInteractive(record), 80);
  updateBrowserAssetOverlayHoverInteractive(record);
}

function stopBrowserAssetOverlayHoverTracking(record: BrowserAssetOverlayRecord): void {
  if (record.hoverInteractiveTimer) {
    clearInterval(record.hoverInteractiveTimer);
    record.hoverInteractiveTimer = null;
  }
  if (!record.hoverInteractive) return;
  record.hoverInteractive = false;
  applyBrowserAssetOverlayMouseEvents(record);
}

function setBrowserAssetOverlayDragInteractive(record: BrowserAssetOverlayRecord, interactive: boolean): void {
  record.dragInteractive = interactive;
  if (record.dragInteractiveResetTimer) {
    clearTimeout(record.dragInteractiveResetTimer);
    record.dragInteractiveResetTimer = null;
  }
  if (interactive) {
    record.dragInteractiveResetTimer = setTimeout(() => {
      record.dragInteractive = false;
      record.dragInteractiveResetTimer = null;
      applyBrowserAssetOverlayMouseEvents(record);
    }, 30_000);
  }
  applyBrowserAssetOverlayMouseEvents(record);
}

function setBrowserAssetOverlayCaptureEnabled(record: BrowserAssetOverlayRecord, enabled: boolean): void {
  record.captureEnabled = enabled;
  if (!record.viewId) return;
  const browserRecord = browserViews.get(record.viewId);
  if (!browserRecord || browserRecord.ownerWindowId !== record.ownerWindowId) return;
  browserRecord.resourceCaptureEnabled = enabled;
  void installBrowserResourceCaptureBridge(browserRecord, enabled);
}

function setBrowserAssetOverlayHostBounds(record: BrowserAssetOverlayRecord, bounds: Rectangle): void {
  const boundsChanged = !sameRectangle(record.hostBounds, bounds);
  record.hostBounds = bounds;
  const owner = BrowserWindow.fromId(record.ownerWindowId);
  if (!owner || owner.isDestroyed() || record.window.isDestroyed()) return;
  if (bounds.width < 1 || bounds.height < 1) {
    stopBrowserAssetOverlayHoverTracking(record);
    record.window.hide();
    return;
  }
  if (boundsChanged) {
    record.window.setBounds(browserAssetOverlayWindowBounds(owner, bounds), false);
    applyBrowserAssetOverlayShape(record);
  }
}

function disableOverlayResourceCapture(record: BrowserAssetOverlayRecord): void {
  setBrowserAssetOverlayCaptureEnabled(record, false);
}

function closeBrowserAssetOverlay(record: BrowserAssetOverlayRecord): void {
  disableOverlayResourceCapture(record);
  setBrowserAssetOverlayDragInteractive(record, false);
  stopBrowserAssetOverlayHoverTracking(record);
  record.pointerInteractive = false;
  record.pendingShow = false;
  record.pendingCaptureRequest = null;
  record.pendingPromptRequest = null;
  record.dockMode = null;
  record.popoverRect = null;
  if (!record.window.isDestroyed()) {
    applyBrowserAssetOverlayShape(record);
    record.window.setIgnoreMouseEvents(false);
    record.window.hide();
    sendBrowserAssetOverlayConfig(record);
  }
  sendBrowserAssetOverlayState(record, false);
}

function ensureBrowserAssetOverlay(owner: BrowserWindow): BrowserAssetOverlayRecord {
  const current = browserAssetOverlaysByWindow.get(owner.id);
  if (current && !current.window.isDestroyed()) return current;

  const overlayWindow = new BrowserWindow({
    parent: owner,
    modal: false,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    title: "Nomi Browser Asset Overlay",
    webPreferences: {
      preload: path.join(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  overlayWindow.setMenuBarVisibility(false);
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  const record: BrowserAssetOverlayRecord = {
    ownerWindowId: owner.id,
    window: overlayWindow,
    hostBounds: { x: 0, y: 0, width: 0, height: 0 },
    viewId: null,
    captureEnabled: false,
    rendererReady: false,
    pendingShow: false,
    pendingCaptureRequest: null,
    pendingPromptRequest: null,
    dockMode: null,
    popoverRect: null,
    pointerInteractive: false,
    hoverInteractive: false,
    dragInteractive: false,
    hoverInteractiveTimer: null,
    dragInteractiveResetTimer: null,
  };
  browserAssetOverlaysByWindow.set(owner.id, record);

  overlayWindow.once("closed", () => {
    if (record.hoverInteractiveTimer) clearInterval(record.hoverInteractiveTimer);
    if (record.dragInteractiveResetTimer) clearTimeout(record.dragInteractiveResetTimer);
    if (browserAssetOverlaysByWindow.get(owner.id) === record) {
      browserAssetOverlaysByWindow.delete(owner.id);
    }
  });
  owner.once("closed", () => {
    if (!overlayWindow.isDestroyed()) overlayWindow.destroy();
    browserAssetOverlaysByWindow.delete(owner.id);
  });
  overlayWindow.webContents.on("did-finish-load", () => sendBrowserAssetOverlayConfig(record));
  void overlayWindow.loadURL(overlayRendererUrl());
  return record;
}

function openBrowserAssetOverlay(
  owner: BrowserWindow,
  payload: BrowserAssetOverlayPayload,
  captureRequest: BrowserAssetOverlayCaptureRequest | null = null,
  promptRequest: BrowserAssetOverlayPromptRequest | null = null,
): BrowserAssetOverlayRecord {
  const viewId = readViewId(payload);
  const browserRecord = browserViews.get(viewId);
  if (!browserRecord || browserRecord.ownerWindowId !== owner.id) throw new Error("Browser view not found");
  const record = ensureBrowserAssetOverlay(owner);
  record.viewId = viewId;
  setBrowserAssetOverlayHostBounds(record, normalizeOverlayBounds(payload.bounds));
  record.pointerInteractive = false;
  record.hoverInteractive = false;
  record.dragInteractive = false;
  startBrowserAssetOverlayHoverTracking(record);
  applyBrowserAssetOverlayMouseEvents(record);
  showBrowserAssetOverlay(record, captureRequest, promptRequest);
  return record;
}

function normalizeBounds(bounds: Partial<Rectangle> | undefined): Rectangle {
  const x = Math.max(0, Math.round(Number(bounds?.x ?? 0)));
  const y = Math.max(0, Math.round(Number(bounds?.y ?? 0)));
  const width = Math.max(0, Math.round(Number(bounds?.width ?? 0)));
  const height = Math.max(0, Math.round(Number(bounds?.height ?? 0)));
  return { x, y, width, height };
}

function normalizeBrowserChromeMenuPayload(payload: BrowserChromeMenuPayload): {
  x: number;
  y: number;
  width: number;
  items: BrowserChromeMenuItem[];
} {
  const x = Math.max(0, Math.round(Number(payload?.x ?? 0)));
  const y = Math.max(0, Math.round(Number(payload?.y ?? 0)));
  const width = clampNumber(Math.round(Number(payload?.width ?? 224)), 160, 420);
  const rawItems = Array.isArray(payload?.items) ? payload.items : [];
  const items = rawItems.flatMap((raw): BrowserChromeMenuItem[] => {
    const item = raw as BrowserChromeMenuItemPayload;
    if (item?.type === "separator") return [{ type: "separator" }];
    const id = String(item?.id || "").trim();
    const label = String(item?.label || "").trim();
    const description = String(item?.description || "").trim();
    if (!id || !label) return [];
    return [
      {
        id,
        label,
        description,
        type: "normal",
        enabled: item.enabled !== false,
      },
    ];
  });
  if (!items.some((item) => item.type === "normal")) throw new Error("At least one menu item is required");
  return { x, y, width, items };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function browserChromeMenuHeight(items: BrowserChromeMenuItem[]): number {
  const contentHeight = items.reduce((total, item) => {
    if (item.type === "separator") return total + 9;
    return total + (item.description ? 64 : 38);
  }, 0);
  return Math.max(1, contentHeight + 12);
}

function browserChromeMenuHtml(items: BrowserChromeMenuItem[]): string {
  const rows = items
    .map((item) => {
      if (item.type === "separator") return '<div class="separator" role="separator"></div>';
      const disabled = item.enabled ? "" : " disabled";
      const description = item.description ? `<span class="description">${escapeHtml(item.description)}</span>` : "";
      return `<button type="button" role="menuitem" data-id="${escapeHtml(item.id)}"${disabled}><span class="label">${escapeHtml(item.label)}</span>${description}</button>`;
    })
    .join("");
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Nomi Browser Chrome Menu</title>
    <style>
      :root { color-scheme: dark; }
      html, body { margin: 0; width: 100%; min-height: 100%; overflow: hidden; background: transparent; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .menu { box-sizing: border-box; width: 100%; min-height: 100%; padding: 6px; border: 1px solid rgba(255,255,255,.11); border-radius: 12px; background: rgba(31,29,25,.98); box-shadow: 0 18px 45px rgba(0,0,0,.42); }
      button { box-sizing: border-box; display: grid; width: 100%; min-height: 38px; padding: 7px 10px; border: 0; border-radius: 8px; background: transparent; color: rgba(255,255,255,.92); text-align: left; cursor: default; }
      button:hover, button:focus-visible { background: rgba(255,255,255,.08); outline: none; }
      button:disabled { color: rgba(255,255,255,.38); }
      .label { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 13px; font-weight: 650; line-height: 18px; }
      .description { display: block; margin-top: 2px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: rgba(255,255,255,.72); font-size: 12px; line-height: 17px; }
      .separator { height: 1px; margin: 4px 4px; background: rgba(255,255,255,.11); }
    </style>
  </head>
  <body>
    <div class="menu" role="menu" aria-label="浏览器菜单">${rows}</div>
    <script>
      const api = window.nomiDesktop && window.nomiDesktop.browserChromeMenu;
      const selectFromEvent = (event) => {
        const button = event.target && event.target.closest ? event.target.closest('button[data-id]') : null;
        if (!button || button.disabled || !api) return;
        api.select(button.dataset.id || '');
      };
      document.addEventListener('pointerup', selectFromEvent);
      document.addEventListener('click', selectFromEvent);
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && api) api.cancel();
      });
      const first = document.querySelector('button[data-id]:not([disabled])');
      if (first) first.focus();
    </script>
  </body>
</html>`;
}

function closeBrowserChromeMenu(record: BrowserChromeMenuRecord, id: string | null): void {
  if (record.settled) return;
  record.settled = true;
  browserChromeMenusByWindow.delete(record.ownerWindowId);
  browserChromeMenusByWebContents.delete(record.window.webContents.id);
  record.resolve({ id });
  if (!record.window.isDestroyed()) record.window.close();
}

function showBrowserChromeMenu(
  owner: BrowserWindow,
  payload: ReturnType<typeof normalizeBrowserChromeMenuPayload>,
): Promise<{ id: string | null }> {
  return new Promise((resolve) => {
    const current = browserChromeMenusByWindow.get(owner.id);
    if (current) closeBrowserChromeMenu(current, null);
    const contentBounds = owner.getContentBounds();
    const height = browserChromeMenuHeight(payload.items);
    const menuWindow = new BrowserWindow({
      parent: owner,
      modal: false,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      title: "Nomi Browser Chrome Menu",
      x: contentBounds.x + payload.x,
      y: contentBounds.y + payload.y,
      width: payload.width,
      height,
      webPreferences: {
        preload: path.join(__dirname, "../preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    menuWindow.setMenuBarVisibility(false);
    const record: BrowserChromeMenuRecord = {
      ownerWindowId: owner.id,
      window: menuWindow,
      settled: false,
      resolve,
    };
    browserChromeMenusByWindow.set(owner.id, record);
    browserChromeMenusByWebContents.set(menuWindow.webContents.id, record);
    menuWindow.once("blur", () => closeBrowserChromeMenu(record, null));
    menuWindow.once("closed", () => closeBrowserChromeMenu(record, null));
    owner.once("closed", () => {
      if (!menuWindow.isDestroyed()) menuWindow.destroy();
      closeBrowserChromeMenu(record, null);
    });
    menuWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    menuWindow.once("ready-to-show", () => {
      if (!menuWindow.isDestroyed()) menuWindow.show();
    });
    void menuWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(browserChromeMenuHtml(payload.items))}`);
  });
}

function normalizeBrowserUrl(url: unknown): string {
  const value = String(url || "").trim();
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) browser URLs are supported");
  }
  return parsed.toString();
}

function normalizeBrowserMediaUrl(url: unknown, baseUrl: string): string {
  const value = String(url || "").trim();
  const parsed = new URL(value, baseUrl || undefined);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:" && parsed.protocol !== "blob:") {
    throw new Error("Only http(s) and page blob media URLs are supported");
  }
  return parsed.toString();
}

function normalizeBrowserMediaType(value: unknown): "image" | "video" | null {
  return value === "video" || value === "image" ? value : null;
}

function safeHeaderUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function fileNameFromMediaUrl(url: string, fallback: unknown, contentType: string): string {
  const ext = extensionFromMime(contentType, extensionFromUrl(url));
  const preferred = String(fallback || "").trim();
  const fromPath = (() => {
    try {
      return path.basename(new URL(url).pathname);
    } catch {
      return "";
    }
  })();
  const rawName = preferred || fromPath || `browser-resource-${Date.now()}.${ext}`;
  return rawName.includes(".") ? rawName : `${rawName}.${ext}`;
}

function safeTempFileName(fileName: string): string {
  const baseName = Array.from(path.basename(fileName))
    .map((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || '<>:"/\\|?*'.includes(char) ? "_" : char;
    })
    .join("")
    .trim();
  return baseName || `browser-resource-${Date.now()}.bin`;
}

function fallbackContentTypeForMediaType(mediaType: "image" | "video" | null): string {
  return mediaType === "video" ? "video/mp4" : "image/png";
}

function normalizeDownloadedContentType(
  contentType: string,
  requestedMediaType: "image" | "video" | null,
): string {
  const normalized = String(contentType || "").split(";")[0]?.trim().toLowerCase() || "";
  if (!normalized || normalized === "application/octet-stream") {
    return fallbackContentTypeForMediaType(requestedMediaType);
  }
  return normalized;
}

function acceptHeaderForMediaType(mediaType: "image" | "video" | null): string {
  if (mediaType === "video") return "video/webm,video/mp4,video/*,*/*;q=0.8";
  if (mediaType === "image") return "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
  return "image/avif,image/webp,image/apng,image/svg+xml,image/*,video/webm,video/mp4,video/*,*/*;q=0.8";
}

function urlsMatch(left: string, right: string): boolean {
  try {
    return new URL(left).href === new URL(right).href;
  } catch {
    return left === right;
  }
}

function downloadItemMatchesUrl(item: DownloadItem, url: string): boolean {
  return [item.getURL(), ...item.getURLChain()].some((candidate) => urlsMatch(candidate, url));
}

function normalizeCaptureSourceRect(
  record: BrowserViewRecord,
  rect: BrowserResourceCaptureRectPayload | undefined,
): { left: number; top: number; right: number; bottom: number; width: number; height: number } | null {
  const width = Math.round(Number(rect?.width));
  const height = Math.round(Number(rect?.height));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const viewWidth = Math.max(1, record.lastBounds.width);
  const viewHeight = Math.max(1, record.lastBounds.height);
  const boundedWidth = Math.min(width, viewWidth);
  const boundedHeight = Math.min(height, viewHeight);
  const localLeft = Math.min(Math.max(0, Math.round(Number(rect?.left) || 0)), viewWidth - boundedWidth);
  const localTop = Math.min(Math.max(0, Math.round(Number(rect?.top) || 0)), viewHeight - boundedHeight);
  const left = record.lastBounds.x + localLeft;
  const top = record.lastBounds.y + localTop;
  return {
    left,
    top,
    right: left + boundedWidth,
    bottom: top + boundedHeight,
    width: boundedWidth,
    height: boundedHeight,
  };
}

function normalizeLocalCaptureRect(
  record: BrowserViewRecord,
  rect: BrowserResourceCaptureRectPayload | undefined,
): Rectangle | null {
  const width = Math.round(Number(rect?.width));
  const height = Math.round(Number(rect?.height));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const viewWidth = Math.max(1, record.lastBounds.width);
  const viewHeight = Math.max(1, record.lastBounds.height);
  const boundedWidth = Math.min(width, viewWidth);
  const boundedHeight = Math.min(height, viewHeight);
  const x = Math.min(Math.max(0, Math.round(Number(rect?.left) || 0)), viewWidth - boundedWidth);
  const y = Math.min(Math.max(0, Math.round(Number(rect?.top) || 0)), viewHeight - boundedHeight);
  return { x, y, width: boundedWidth, height: boundedHeight };
}

function sendBrowserViewState(record: BrowserViewRecord): void {
  const win = BrowserWindow.fromId(record.ownerWindowId);
  if (!win || win.isDestroyed()) return;
  const contents = record.view.webContents;
  win.webContents.send("browser:view:state", {
    viewId: record.viewId,
    tabId: record.tabId,
    url: contents.getURL(),
    title: contents.getTitle(),
    canGoBack: contents.canGoBack(),
    canGoForward: contents.canGoForward(),
    loading: contents.isLoading(),
  });
}

function destroyBrowserView(record: BrowserViewRecord): void {
  browserViews.delete(record.viewId);
  browserViewsByWindow.get(record.ownerWindowId)?.delete(record.viewId);
  const win = BrowserWindow.fromId(record.ownerWindowId);
  void record.view.webContents.session.cookies.flushStore().catch(() => undefined);
  try {
    record.view.setVisible(false);
    win?.contentView.removeChildView(record.view);
  } catch {
    // The owner window may already be closing.
  }
  if (!record.view.webContents.isDestroyed()) {
    record.view.webContents.close({ waitForBeforeUnload: false });
  }
}

async function installBrowserImageDragBridge(record: BrowserViewRecord): Promise<void> {
  const contents = record.view.webContents;
  if (contents.isDestroyed()) return;
  const script = `
(() => {
  const dragMime = ${JSON.stringify(BROWSER_IMAGE_DRAG_MIME)};
  if (window.__nomiBrowserImageDragBridgeInstalled) return true;
  window.__nomiBrowserImageDragBridgeInstalled = true;
  const pickImageElement = (target) => {
    if (!(target instanceof Element)) return null;
    if (target instanceof HTMLImageElement) return target;
    return target.closest ? target.closest('img') : null;
  };
  const readImageUrl = (image) => {
    if (!image) return '';
    return image.currentSrc || image.src || image.getAttribute('data-src') || image.getAttribute('data-original') || '';
  };
  document.addEventListener('dragstart', (event) => {
    const transfer = event.dataTransfer;
    if (!transfer) return;
    const image = pickImageElement(event.target);
    const rawUrl = readImageUrl(image);
    if (!rawUrl) return;
    let url = '';
    try {
      url = new URL(rawUrl, window.location.href).href;
    } catch {
      return;
    }
    const title = (image.getAttribute('alt') || image.getAttribute('title') || document.title || '').trim();
    const payload = {
      url,
      title,
      pageUrl: window.location.href,
      pageTitle: document.title || '',
    };
    try { transfer.setData(dragMime, JSON.stringify(payload)); } catch {}
    try { transfer.setData('text/uri-list', url); } catch {}
    try { transfer.setData('text/plain', url); } catch {}
    transfer.effectAllowed = 'copy';
    try { console.info(${JSON.stringify(BROWSER_IMAGE_DRAG_START_CONSOLE_PREFIX)} + JSON.stringify(payload)); } catch {}
  }, true);
  document.addEventListener('dragend', () => {
    try { console.info(${JSON.stringify(BROWSER_IMAGE_DRAG_END_CONSOLE_MESSAGE)}); } catch {}
  }, true);
  return true;
})()
`;
  try {
    await contents.executeJavaScript(script, true);
  } catch {
    // Some pages reject script execution during transient navigation states; the next load event retries.
  }
}

async function installBrowserPromptHoverBridge(record: BrowserViewRecord): Promise<void> {
  const contents = record.view.webContents;
  if (contents.isDestroyed()) return;
  const script = `
(() => {
  const consolePrefix = ${JSON.stringify(BROWSER_IMAGE_PROMPT_CONSOLE_PREFIX)};
  const promptCategories = ${JSON.stringify(record.promptCategories)};
  const normalizePromptCategories = (input) => {
    const output = [];
    const seen = new Set();
    const push = (idValue, labelValue) => {
      const id = String(idValue || '').trim();
      const label = String(labelValue || '').trim();
      if (!id || !label || seen.has(id)) return;
      seen.add(id);
      output.push({ id, label });
    };
    push('image', '图片提示词');
    push('video', '视频提示词');
    if (Array.isArray(input)) {
      input.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        push(item.id, item.label);
      });
    }
    return output;
  };
  window.__nomiBrowserPromptCategories = normalizePromptCategories(promptCategories);
  if (window.__nomiBrowserPromptHoverBridgeInstalled) {
    if (typeof window.__nomiBrowserRenderPromptCategories === 'function') {
      window.__nomiBrowserRenderPromptCategories();
    }
    return true;
  }
  window.__nomiBrowserPromptHoverBridgeInstalled = true;

  const state = {
    image: null,
    visible: false,
    menuOpen: false,
  };
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', 'Nomi 获取提示词');
  button.innerHTML = '<span class="nomi-prompt-mark">N</span><span>获取提示词</span>';
  button.style.cssText = [
    'position:fixed',
    'z-index:2147483647',
    'display:none',
    'align-items:center',
    'gap:6px',
    'height:28px',
    'max-width:128px',
    'padding:0 9px 0 6px',
    'border:1px solid rgba(255,255,255,.72)',
    'border-radius:999px',
    'background:rgba(18,24,38,.88)',
    'color:white',
    'font:600 12px/1 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
    'box-shadow:0 8px 22px rgba(15,23,42,.24)',
    'backdrop-filter:blur(8px)',
    'cursor:pointer',
    'user-select:none',
    'white-space:nowrap'
  ].join(';');
  const style = document.createElement('style');
  style.textContent = '.nomi-prompt-mark{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:999px;background:#fff;color:#111827;font:800 11px/1 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}.nomi-prompt-mode-option{display:flex;width:100%;align-items:flex-start;gap:8px;border:0;background:transparent;color:#172033;padding:8px;border-radius:10px;text-align:left;cursor:pointer;font:500 12px/1.35 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}.nomi-prompt-mode-option:hover{background:rgba(35,43,64,.07)}.nomi-prompt-mode-icon{display:inline-grid;width:20px;height:20px;place-items:center;border-radius:999px;background:#172033;color:white;font:800 11px/1 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}.nomi-prompt-mode-title{display:block;font-weight:700;color:#172033}.nomi-prompt-mode-desc{display:block;margin-top:2px;color:rgba(23,32,51,.62)}';
  document.documentElement.appendChild(style);
  document.documentElement.appendChild(button);
  const menu = document.createElement('div');
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', '选择提示词提取方式');
  menu.style.cssText = [
    'position:fixed',
    'z-index:2147483647',
    'display:none',
    'width:188px',
    'padding:5px',
    'border:1px solid rgba(23,32,51,.14)',
    'border-radius:14px',
    'background:rgba(255,255,255,.96)',
    'box-shadow:0 16px 38px rgba(15,23,42,.20)',
    'backdrop-filter:blur(10px)',
    'user-select:none'
  ].join(';');
  const createModeOption = (mode, title, description) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'nomi-prompt-mode-option';
    option.setAttribute('role', 'menuitem');
    option.setAttribute('data-nomi-prompt-mode', mode);
    option.innerHTML = '<span class="nomi-prompt-mode-icon">' + (mode === 'style' ? 'S' : 'R') + '</span><span><span class="nomi-prompt-mode-title">' + title + '</span><span class="nomi-prompt-mode-desc">' + description + '</span></span>';
    return option;
  };
  menu.appendChild(createModeOption('replicate', '画面复刻', '还原主体、构图、光影与细节'));
  menu.appendChild(createModeOption('style', '画面风格', '提取配色、字体、构图与效果 JSON'));
  document.documentElement.appendChild(menu);

  const cleanTitle = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
  const absoluteUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, window.location.href).href;
      return /^(https?:\\/\\/|blob:|data:image\\/)/i.test(url) ? url : '';
    } catch {
      return '';
    }
  };
  const readImageUrl = (image) => {
    if (!image) return '';
    return absoluteUrl(
      image.currentSrc ||
        image.src ||
        image.getAttribute('data-src') ||
        image.getAttribute('data-original') ||
        image.getAttribute('data-lazy-src')
    );
  };
  const fileNameFromUrl = (url) => {
    try {
      const segment = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
      return segment ? decodeURIComponent(segment) : '';
    } catch {
      return '';
    }
  };
  const rectFromImage = (image) => {
    const rect = image.getBoundingClientRect();
    const viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    const left = Math.max(0, Math.min(viewportWidth, rect.left));
    const top = Math.max(0, Math.min(viewportHeight, rect.top));
    const right = Math.max(left, Math.min(viewportWidth, rect.right));
    const bottom = Math.max(top, Math.min(viewportHeight, rect.bottom));
    return { left, top, width: right - left, height: bottom - top };
  };
  const usableImage = (image) => {
    if (!(image instanceof HTMLImageElement)) return false;
    const rect = rectFromImage(image);
    if (rect.width < 64 || rect.height < 64) return false;
    return Boolean(readImageUrl(image));
  };
  const showForImage = (image) => {
    if (!usableImage(image)) return hide();
    state.image = image;
    const rect = rectFromImage(image);
    const buttonWidth = Math.min(128, Math.max(92, button.offsetWidth || 112));
    const left = Math.max(8, Math.min(window.innerWidth - buttonWidth - 8, rect.left + rect.width - buttonWidth - 8));
    const top = Math.max(8, Math.min(window.innerHeight - 36, rect.top + 8));
    button.style.left = left + 'px';
    button.style.top = top + 'px';
    button.style.display = 'inline-flex';
    if (state.menuOpen) positionMenu();
    state.visible = true;
  };
  const positionMenu = () => {
    const buttonRect = button.getBoundingClientRect();
    const menuWidth = 188;
    const menuHeight = 102;
    const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, buttonRect.right - menuWidth));
    const top = Math.max(8, Math.min(window.innerHeight - menuHeight - 8, buttonRect.bottom + 6));
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  };
  const closeMenu = () => {
    state.menuOpen = false;
    menu.style.display = 'none';
  };
  const openMenu = () => {
    if (!state.image || !readImageUrl(state.image)) return;
    state.menuOpen = true;
    positionMenu();
    menu.style.display = 'block';
  };
  const hide = () => {
    state.image = null;
    state.visible = false;
    button.style.display = 'none';
    closeMenu();
  };
  const imageFromEvent = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    if (target instanceof HTMLImageElement) return target;
    return target.closest ? target.closest('img') : null;
  };
  document.addEventListener('pointerover', (event) => {
    const image = imageFromEvent(event);
    if (image) showForImage(image);
  }, true);
  document.addEventListener('pointermove', (event) => {
    if (event.target === button || button.contains(event.target) || event.target === menu || menu.contains(event.target)) return;
    const image = imageFromEvent(event);
    if (image) showForImage(image);
    else if (state.visible) {
      const rect = button.getBoundingClientRect();
      const insideButton = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      const menuRect = menu.getBoundingClientRect();
      const insideMenu = state.menuOpen && event.clientX >= menuRect.left && event.clientX <= menuRect.right && event.clientY >= menuRect.top && event.clientY <= menuRect.bottom;
      const imageRect = state.image ? rectFromImage(state.image) : null;
      const insideImage = imageRect && event.clientX >= imageRect.left && event.clientX <= imageRect.left + imageRect.width && event.clientY >= imageRect.top && event.clientY <= imageRect.top + imageRect.height;
      if (!insideButton && !insideMenu && !insideImage) hide();
    }
  }, true);
  document.addEventListener('scroll', () => {
    if (state.image && document.documentElement.contains(state.image)) showForImage(state.image);
    else hide();
  }, true);
  window.addEventListener('resize', () => {
    if (state.image) showForImage(state.image);
  });
  const sendPromptRequest = (extractionMode) => {
    const image = state.image;
    const url = readImageUrl(image);
    if (!image || !url) return;
    const rect = rectFromImage(image);
    const payload = {
      url,
      title: cleanTitle(image.alt || image.title || image.getAttribute('aria-label') || document.title),
      fileName: fileNameFromUrl(url),
      pageUrl: window.location.href,
      pageTitle: document.title || '',
      extractionMode,
      sourceRect: rect,
    };
    try { console.info(consolePrefix + JSON.stringify(payload)); } catch {}
    hide();
  };
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (state.menuOpen) closeMenu();
    else openMenu();
  });
  menu.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const option = event.target instanceof Element ? event.target.closest('[data-nomi-prompt-mode]') : null;
    if (!option) return;
    sendPromptRequest(option.getAttribute('data-nomi-prompt-mode') === 'style' ? 'style' : 'replicate');
  });

  const textConsolePrefix = ${JSON.stringify(BROWSER_TEXT_PROMPT_CONSOLE_PREFIX)};
  const textState = { text: '', rect: null, cardOpen: false };
  const textButton = document.createElement('button');
  textButton.type = 'button';
  textButton.setAttribute('aria-label', 'Nomi 保存提示词');
  textButton.innerHTML = '<span class="nomi-prompt-mark">N</span><span>保存提示词</span>';
  textButton.style.cssText = [
    'position:fixed',
    'z-index:2147483647',
    'display:none',
    'align-items:center',
    'gap:6px',
    'height:30px',
    'padding:0 10px 0 6px',
    'border:1px solid rgba(255,255,255,.72)',
    'border-radius:999px',
    'background:rgba(18,24,38,.9)',
    'color:white',
    'font:650 12px/1 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
    'box-shadow:0 10px 26px rgba(15,23,42,.28)',
    'backdrop-filter:blur(8px)',
    'cursor:pointer',
    'user-select:none',
    'white-space:nowrap'
  ].join(';');
  document.documentElement.appendChild(textButton);

  const textCard = document.createElement('div');
  textCard.setAttribute('role', 'dialog');
  textCard.setAttribute('aria-label', '保存提示词');
  textCard.style.cssText = [
    'position:fixed',
    'z-index:2147483647',
    'display:none',
    'width:min(420px,calc(100vw - 32px))',
    'padding:12px',
    'border:1px solid rgba(23,32,51,.14)',
    'border-radius:16px',
    'background:rgba(255,255,255,.97)',
    'box-shadow:0 22px 58px rgba(15,23,42,.28)',
    'color:#172033',
    'font:500 13px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
    'backdrop-filter:blur(10px)'
  ].join(';');
  textCard.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px">' +
      '<strong style="font-size:14px">保存提示词</strong>' +
      '<button type="button" data-nomi-text-close style="border:0;background:transparent;color:rgba(23,32,51,.55);font-size:18px;line-height:1;cursor:pointer">×</button>' +
    '</div>' +
    '<div style="display:grid;gap:10px">' +
      '<div style="display:grid;place-items:center;min-height:72px;border-radius:12px;background:rgba(23,32,51,.06);color:rgba(23,32,51,.48);font-size:12px">无参考图</div>' +
      '<label style="display:grid;gap:5px"><span style="color:rgba(23,32,51,.62);font-size:12px">提示词类型</span><select data-nomi-text-type style="height:34px;border:1px solid rgba(23,32,51,.14);border-radius:10px;background:white;padding:0 8px;color:#172033"><option value="image">图片提示词</option><option value="video">视频提示词</option></select></label>' +
      '<label style="display:grid;gap:5px"><span style="color:rgba(23,32,51,.62);font-size:12px">选中文字</span><textarea data-nomi-text-value style="min-height:110px;resize:vertical;border:1px solid rgba(23,32,51,.14);border-radius:10px;background:white;padding:8px;color:#172033;font:500 13px/1.55 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"></textarea></label>' +
      '<div style="display:flex;justify-content:flex-end;gap:8px"><button type="button" data-nomi-text-cancel style="height:32px;border:1px solid rgba(23,32,51,.14);border-radius:10px;background:white;color:rgba(23,32,51,.72);padding:0 12px;cursor:pointer">取消</button><button type="button" data-nomi-text-save style="height:32px;border:0;border-radius:10px;background:#172033;color:white;padding:0 12px;font-weight:700;cursor:pointer">保存</button></div>' +
    '</div>';
  document.documentElement.appendChild(textCard);

  const getPromptCategories = () => {
    const categories = normalizePromptCategories(window.__nomiBrowserPromptCategories);
    return categories.length ? categories : normalizePromptCategories([]);
  };
  const renderPromptCategoryOptions = () => {
    const select = textCard.querySelector('[data-nomi-text-type]');
    if (!select) return;
    const categories = getPromptCategories();
    const currentValue = String(select.value || 'image');
    select.textContent = '';
    categories.forEach((category) => {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.label;
      select.appendChild(option);
    });
    select.value = categories.some((category) => category.id === currentValue)
      ? currentValue
      : (categories.find((category) => category.id === 'image')?.id || categories[0]?.id || 'image');
  };
  window.__nomiBrowserRenderPromptCategories = renderPromptCategoryOptions;
  renderPromptCategoryOptions();

  const hideTextButton = () => {
    if (textState.cardOpen) return;
    textButton.style.display = 'none';
  };
  const closeTextCard = () => {
    textState.cardOpen = false;
    textCard.style.display = 'none';
    hideTextButton();
  };
  const selectionRect = (selection) => {
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width || rect.height) return rect;
    const first = range.getClientRects()[0];
    return first || null;
  };
  const updateTextSelection = () => {
    if (textState.cardOpen) return;
    const selection = window.getSelection();
    const text = selection ? String(selection.toString() || '').trim() : '';
    if (!selection || !text) {
      hideTextButton();
      return;
    }
    const anchorElement = selection.anchorNode && (selection.anchorNode.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode.parentElement);
    if (anchorElement && anchorElement.closest && anchorElement.closest('button,input,textarea,select,[contenteditable="true"],.nomi-prompt-mode-option')) return;
    const rect = selectionRect(selection);
    if (!rect) {
      hideTextButton();
      return;
    }
    textState.text = text;
    textState.rect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    const buttonWidth = Math.min(132, Math.max(106, textButton.offsetWidth || 118));
    textButton.style.left = Math.max(8, Math.min(window.innerWidth - buttonWidth - 8, rect.left + rect.width / 2 - buttonWidth / 2)) + 'px';
    textButton.style.top = Math.max(8, rect.top - 38) + 'px';
    textButton.style.display = 'inline-flex';
  };
  const openTextCard = () => {
    if (!textState.text) return;
    textState.cardOpen = true;
    const textarea = textCard.querySelector('[data-nomi-text-value]');
    const select = textCard.querySelector('[data-nomi-text-type]');
    if (textarea) textarea.value = textState.text;
    renderPromptCategoryOptions();
    if (select) select.value = getPromptCategories().some((category) => category.id === 'image') ? 'image' : select.value;
    const rect = textState.rect || { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };
    const cardWidth = Math.min(420, window.innerWidth - 32);
    textCard.style.left = Math.max(16, Math.min(window.innerWidth - cardWidth - 16, rect.left + rect.width / 2 - cardWidth / 2)) + 'px';
    textCard.style.top = Math.max(16, Math.min(window.innerHeight - 360, rect.top + rect.height + 10)) + 'px';
    textCard.style.display = 'block';
  };
  const saveTextCard = () => {
    const textarea = textCard.querySelector('[data-nomi-text-value]');
    const select = textCard.querySelector('[data-nomi-text-type]');
    const prompt = textarea ? String(textarea.value || '').trim() : '';
    if (!prompt) return;
    const payload = {
      prompt,
      promptType: select ? String(select.value || 'image').trim() || 'image' : 'image',
      pageUrl: window.location.href,
      pageTitle: document.title || '',
    };
    try { console.info(textConsolePrefix + JSON.stringify(payload)); } catch {}
    closeTextCard();
    try { window.getSelection()?.removeAllRanges(); } catch {}
  };
  textButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openTextCard();
  });
  textCard.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-nomi-text-save]')) saveTextCard();
    if (target?.closest('[data-nomi-text-close],[data-nomi-text-cancel]')) closeTextCard();
  });
  document.addEventListener('pointerup', () => window.setTimeout(updateTextSelection, 0), true);
  document.addEventListener('keyup', () => window.setTimeout(updateTextSelection, 0), true);
  document.addEventListener('selectionchange', () => window.setTimeout(updateTextSelection, 0));
  document.addEventListener('scroll', hideTextButton, true);
  window.addEventListener('resize', hideTextButton);
  return true;
})()
`;
  try {
    await contents.executeJavaScript(script, true);
  } catch {
    // The next DOM-ready/load event retries.
  }
}

async function installBrowserResourceCaptureBridge(record: BrowserViewRecord, enabled: boolean): Promise<void> {
  const contents = record.view.webContents;
  if (contents.isDestroyed()) return;
  const script = `
(() => {
  const enabled = ${enabled ? "true" : "false"};
  const imagePattern = /\\.(?:png|jpe?g|gif|webp|avif|svg)(?:[?#]|$)/i;
  const videoPattern = /\\.(?:mp4|webm|mov|m4v|mkv|avi|m3u8)(?:[?#]|$)/i;
  const state = window.__nomiBrowserResourceCaptureBridge || {
    installed: false,
    enabled: false,
    current: null,
    target: null,
    lastPoint: null,
  };
  const absoluteUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, window.location.href).href;
      return /^(https?:\\/\\/|blob:)/i.test(url) ? url : '';
    } catch {
      return '';
    }
  };
  const mediaTypeFromUrl = (url) => {
    if (imagePattern.test(url)) return 'image';
    if (videoPattern.test(url)) return 'video';
    return '';
  };
  const cleanTitle = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
  const fileNameFromUrl = (url) => {
    try {
      const segment = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
      return segment ? decodeURIComponent(segment) : '';
    } catch {
      return '';
    }
  };
  const rectFromElement = (element) => {
    if (!element || typeof element.getBoundingClientRect !== 'function') return null;
    const rect = element.getBoundingClientRect();
    const viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    const left = Math.max(0, Math.min(viewportWidth, rect.left));
    const top = Math.max(0, Math.min(viewportHeight, rect.top));
    const right = Math.max(left, Math.min(viewportWidth, rect.right));
    const bottom = Math.max(top, Math.min(viewportHeight, rect.bottom));
    const width = right - left;
    const height = bottom - top;
    if (width <= 1 || height <= 1) return null;
    return { left, top, width, height };
  };
  const rectContainsPoint = (rect, clientX, clientY) => {
    if (!rect) return false;
    return clientX >= rect.left && clientX <= rect.left + rect.width && clientY >= rect.top && clientY <= rect.top + rect.height;
  };
  const candidateContainsPoint = (candidate, clientX, clientY) => {
    return !candidate?.payload?.sourceRect || rectContainsPoint(candidate.payload.sourceRect, clientX, clientY);
  };
  const pointedDescendant = (element, selector, clientX, clientY) => {
    const nodes = Array.from(element.querySelectorAll?.(selector) || []);
    let best = null;
    let bestArea = Number.POSITIVE_INFINITY;
    for (const node of nodes) {
      const rect = rectFromElement(node);
      if (!rectContainsPoint(rect, clientX, clientY)) continue;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        best = node;
        bestArea = area;
      }
    }
    return best;
  };
  const makeCandidate = (element, rawUrl, mediaType, title) => {
    const url = absoluteUrl(rawUrl);
    if (!url) return null;
    const resolvedMediaType = mediaType || mediaTypeFromUrl(url);
    if (resolvedMediaType !== 'image' && resolvedMediaType !== 'video') return null;
    return {
      element,
      payload: {
        url,
        mediaType: resolvedMediaType,
        title: cleanTitle(title) || cleanTitle(element?.getAttribute?.('alt')) || cleanTitle(element?.getAttribute?.('title')) || cleanTitle(document.title),
        fileName: fileNameFromUrl(url),
        pageUrl: window.location.href,
        pageTitle: document.title || '',
        sourceRect: rectFromElement(element),
      },
    };
  };
  const candidateFromMediaElement = (element) => {
    if (!element || !(element instanceof Element)) return null;
    if (element instanceof HTMLImageElement) {
      return makeCandidate(
        element,
        element.currentSrc || element.src || element.getAttribute('data-src') || element.getAttribute('data-original') || element.getAttribute('data-lazy-src'),
        'image',
        element.alt || element.title,
      );
    }
    if (element instanceof HTMLVideoElement) {
      const source = element.currentSrc || element.src || element.querySelector('source[src]')?.getAttribute('src');
      if (source) return makeCandidate(element, source, 'video', element.title || element.getAttribute('aria-label'));
      const poster = element.poster || element.getAttribute('poster');
      if (poster) return makeCandidate(element, poster, 'image', element.title || element.getAttribute('aria-label'));
    }
    if (element instanceof HTMLSourceElement) {
      const parent = element.parentElement;
      const mediaType = parent instanceof HTMLVideoElement || /^video\\//i.test(element.type || '') ? 'video' : 'image';
      return makeCandidate(parent || element, element.src || element.getAttribute('src'), mediaType, element.title);
    }
    return null;
  };
  const candidateFromLink = (element) => {
    if (!(element instanceof HTMLAnchorElement)) return null;
    const href = absoluteUrl(element.href || element.getAttribute('href'));
    const mediaType = mediaTypeFromUrl(href);
    if (!mediaType) return null;
    return makeCandidate(element, href, mediaType, element.textContent || element.title || element.getAttribute('aria-label'));
  };
  const candidateFromBackground = (element) => {
    if (!element || !(element instanceof Element)) return null;
    const background = window.getComputedStyle(element).backgroundImage || '';
    const match = background.match(/url\\((['"]?)(.*?)\\1\\)/);
    if (!match) return null;
    return makeCandidate(element, match[2], 'image', element.getAttribute('aria-label') || element.textContent);
  };
  const candidateFromElement = (element, clientX, clientY) => {
    if (!element || !(element instanceof Element)) return null;
    const direct = candidateFromMediaElement(element);
    if (direct && candidateContainsPoint(direct, clientX, clientY)) return direct;
    const closestMedia = element.closest?.('img,video,source');
    const fromClosestMedia = closestMedia ? candidateFromMediaElement(closestMedia) : null;
    if (fromClosestMedia && candidateContainsPoint(fromClosestMedia, clientX, clientY)) return fromClosestMedia;
    const pointedMedia = pointedDescendant(element, 'img,video', clientX, clientY);
    const fromPointedMedia = pointedMedia ? candidateFromMediaElement(pointedMedia) : null;
    if (fromPointedMedia) return fromPointedMedia;
    const closestLink = element.closest?.('a[href]');
    const fromClosestLink = closestLink ? candidateFromLink(closestLink) : null;
    if (fromClosestLink && candidateContainsPoint(fromClosestLink, clientX, clientY)) return fromClosestLink;
    const pointedLink = pointedDescendant(element, 'a[href]', clientX, clientY);
    const fromPointedLink = pointedLink ? candidateFromLink(pointedLink) : null;
    if (fromPointedLink) return fromPointedLink;
    const background = candidateFromBackground(element);
    if (background && candidateContainsPoint(background, clientX, clientY)) return background;
    return null;
  };
  const setTarget = (candidate) => {
    if (state.target && state.target !== candidate?.element) {
      try { state.target.removeAttribute('data-nomi-resource-capture-target'); } catch {}
    }
    state.target = candidate?.element || null;
    state.current = candidate?.payload || null;
  };
  const pickAt = (clientX, clientY) => {
    state.lastPoint = { clientX, clientY };
    const elements = document.elementsFromPoint(clientX, clientY);
    for (const element of elements) {
      const candidate = candidateFromElement(element, clientX, clientY);
      if (candidate) return candidate;
    }
    return null;
  };
  const handlePointerMove = (event) => {
    if (!state.enabled) return;
    setTarget(pickAt(event.clientX, event.clientY));
  };
  const handlePointerLeave = () => {
    if (!state.enabled) return;
    setTarget(null);
  };
  if (!state.installed) {
    state.installed = true;
    document.addEventListener('pointermove', handlePointerMove, true);
    document.addEventListener('pointerleave', handlePointerLeave, true);
  }
  if (state.style) {
    try { state.style.remove(); } catch {}
    state.style = null;
  }
  state.enabled = enabled;
  if (!enabled) setTarget(null);
  window.__nomiBrowserResourceCaptureBridge = state;
  window.__nomiReadBrowserResourceCapture = () => {
    if (state.enabled && state.lastPoint) setTarget(pickAt(state.lastPoint.clientX, state.lastPoint.clientY));
    return state.current ? { ...state.current } : null;
  };
  return true;
})()
`;
  try {
    await contents.executeJavaScript(script, true);
  } catch {
    // Pages can be between navigations; dom-ready and load events reinstall while the mode remains active.
  }
}

async function captureBrowserResource(record: BrowserViewRecord): Promise<void> {
  const win = BrowserWindow.fromId(record.ownerWindowId);
  if (!win || win.isDestroyed()) return;
  const contents = record.view.webContents;
  if (contents.isDestroyed()) return;
  try {
    const captured = (await contents.executeJavaScript(
      "(() => window.__nomiReadBrowserResourceCapture?.() || null)()",
      true,
    )) as BrowserResourceCapturePayload | null;
    const url = typeof captured?.url === "string" ? captured.url.trim() : "";
    const mediaType = normalizeBrowserMediaType(captured?.mediaType);
    if (!url || !mediaType) {
      win.webContents.send("browser:view:resource-capture", {
        ok: false,
        viewId: record.viewId,
        tabId: record.tabId,
        reason: "empty",
      });
      return;
    }
    const sourceRect = normalizeCaptureSourceRect(record, captured?.sourceRect);
    win.webContents.send("browser:view:resource-capture", {
      ok: true,
      viewId: record.viewId,
      tabId: record.tabId,
      url,
      mediaType,
      title: typeof captured?.title === "string" ? captured.title : "",
      fileName: typeof captured?.fileName === "string" ? captured.fileName : "",
      pageUrl: typeof captured?.pageUrl === "string" ? captured.pageUrl : "",
      pageTitle: typeof captured?.pageTitle === "string" ? captured.pageTitle : "",
      sourceRect: sourceRect || undefined,
    });
  } catch (error) {
    win.webContents.send("browser:view:resource-capture", {
      ok: false,
      viewId: record.viewId,
      tabId: record.tabId,
      reason: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function downloadBrowserMediaFromPageView(
  record: BrowserViewRecord,
  mediaUrl: string,
  fallbackName: unknown,
  requestedMediaType: "image" | "video" | null,
): Promise<BrowserDownloadResult> {
  const contents = record.view.webContents;
  if (contents.isDestroyed()) throw new Error("Browser view is unavailable");

  const referrer = safeHeaderUrl(contents.getURL());
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-browser-capture-"));
  let activeItem: DownloadItem | null = null;

  return new Promise<BrowserDownloadResult>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      activeItem?.cancel();
      finish(new Error("Media download timed out"));
    }, 120_000);

    const cleanup = (): void => {
      clearTimeout(timeout);
      contents.session.removeListener("will-download", handleWillDownload);
    };

    const finish = (error: Error | null, result?: BrowserDownloadResult): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        reject(error);
        return;
      }
      if (!result) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        reject(new Error("Media download failed"));
        return;
      }
      resolve(result);
    };

    const handleWillDownload = (_event: Electron.Event, item: DownloadItem, downloadContents: WebContents): void => {
      if (downloadContents !== contents) return;
      if (!downloadItemMatchesUrl(item, mediaUrl)) return;

      activeItem = item;
      const initialTotalBytes = item.getTotalBytes();
      if (initialTotalBytes > BROWSER_MEDIA_MAX_BYTES) {
        item.cancel();
        finish(new Error("Media is too large to import"));
        return;
      }

      const fallbackContentType = fallbackContentTypeForMediaType(requestedMediaType);
      const itemContentType = normalizeDownloadedContentType(item.getMimeType() || fallbackContentType, requestedMediaType);
      const tempFileName = safeTempFileName(
        fileNameFromMediaUrl(mediaUrl, item.getFilename() || fallbackName, itemContentType),
      );
      const savePath = path.join(tempDir, tempFileName);
      item.setSavePath(savePath);

      item.on("updated", () => {
        if (item.getReceivedBytes() > BROWSER_MEDIA_MAX_BYTES) item.cancel();
      });
      item.once("done", (_doneEvent, state) => {
        if (state !== "completed") {
          finish(new Error(`Media download ${state}`));
          return;
        }
        if (!fs.existsSync(savePath)) {
          finish(new Error("Downloaded media file is missing"));
          return;
        }
        const stat = fs.statSync(savePath);
        if (!stat.isFile() || stat.size <= 0) {
          finish(new Error("Downloaded media file is empty"));
          return;
        }
        if (stat.size > BROWSER_MEDIA_MAX_BYTES) {
          finish(new Error("Media is too large to import"));
          return;
        }
        const contentType = normalizeDownloadedContentType(
          item.getMimeType() || itemContentType || fallbackContentType,
          requestedMediaType,
        );
        const mediaType = contentType.startsWith("video/")
          ? "video"
          : contentType.startsWith("image/")
            ? "image"
            : requestedMediaType;
        if (mediaType !== "image" && mediaType !== "video" && contentType !== "application/octet-stream") {
          finish(new Error(`Downloaded resource is not supported media: ${contentType}`));
          return;
        }
        finish(null, {
          absolutePath: savePath,
          fileName: item.getFilename() || tempFileName,
          contentType,
          mediaType,
          cleanupDir: tempDir,
        });
      });
    };

    contents.session.on("will-download", handleWillDownload);
    try {
      contents.downloadURL(mediaUrl, {
        headers: {
          Accept: acceptHeaderForMediaType(requestedMediaType),
          ...(referrer ? { Referer: referrer } : null),
        },
      });
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

async function importBrowserMedia(record: BrowserViewRecord, payload: BrowserViewImportMediaPayload): Promise<unknown> {
  const projectId = String(payload.projectId || "").trim();
  if (!projectId) throw new Error("projectId is required");
  const contents = record.view.webContents;
  const pageUrl = contents.getURL();
  const mediaUrl = normalizeBrowserMediaUrl(payload.url, pageUrl);
  const requestedMediaType = normalizeBrowserMediaType(payload.mediaType);
  const download = await downloadBrowserMediaFromPageView(
    record,
    mediaUrl,
    payload.fileName || payload.title,
    requestedMediaType,
  );

  try {
    const { moveAssetFile } = await import("../runtime");
    return moveAssetFile(
      projectId,
      download.absolutePath,
      fileNameFromMediaUrl(mediaUrl, payload.fileName || payload.title || download.fileName, download.contentType),
      download.contentType,
      {
        kind: "browser-capture",
        originalUrl: mediaUrl,
        pageUrl: safeHeaderUrl(pageUrl) || null,
        title: payload.title || null,
        mediaType: download.mediaType || requestedMediaType || null,
      },
    );
  } finally {
    fs.rmSync(download.cleanupDir, { recursive: true, force: true });
  }
}

function dataUrlFromFile(filePath: string, contentType: string): string {
  const mime = normalizeDownloadedContentType(contentType, "image");
  return `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;
}

async function movePromptReferenceFile(input: {
  projectId: string;
  absolutePath: string;
  fileName: string;
  contentType: string;
  sourceUrl?: string;
  pageUrl?: string;
  title?: unknown;
}): Promise<unknown | null> {
  if (!input.projectId) return null;
  const { moveAssetFile } = await import("../runtime");
  return moveAssetFile(input.projectId, input.absolutePath, input.fileName, input.contentType, {
    kind: "browser-prompt-reference",
    originalUrl: input.sourceUrl || null,
    pageUrl: safeHeaderUrl(input.pageUrl || "") || null,
    title: input.title || null,
    mediaType: "image",
  });
}

async function captureBrowserPromptImage(
  record: BrowserViewRecord,
  payload: BrowserViewPromptImagePayload,
): Promise<unknown> {
  const contents = record.view.webContents;
  if (contents.isDestroyed()) throw new Error("Browser view is unavailable");
  const projectId = String(payload.projectId || "").trim();
  const pageUrl = contents.getURL();
  const mediaUrl = normalizeBrowserMediaUrl(payload.url, pageUrl);
  const download = await downloadBrowserMediaFromPageView(record, mediaUrl, payload.fileName || payload.title, "image");

  try {
    if (download.mediaType && download.mediaType !== "image") throw new Error("The selected resource is not an image");
    const contentType = normalizeDownloadedContentType(download.contentType, "image");
    const dataUrl = dataUrlFromFile(download.absolutePath, contentType);
    const fileName = fileNameFromMediaUrl(mediaUrl, payload.fileName || payload.title || download.fileName, contentType);
    const asset = await movePromptReferenceFile({
      projectId,
      absolutePath: download.absolutePath,
      fileName,
      contentType,
      sourceUrl: mediaUrl,
      pageUrl,
      title: payload.title,
    });
    const referenceUrl =
      asset && typeof asset === "object" && "data" in asset && typeof (asset as { data?: { url?: unknown } }).data?.url === "string"
        ? String((asset as { data: { url: string } }).data.url)
        : dataUrl;
    return {
      dataUrl,
      referenceUrl,
      fileName,
      title: typeof payload.title === "string" ? payload.title : "",
      sourceUrl: mediaUrl,
      pageUrl,
      pageTitle: contents.getTitle(),
      ...(asset ? { asset } : {}),
    };
  } finally {
    fs.rmSync(download.cleanupDir, { recursive: true, force: true });
  }
}

async function selectBrowserPromptScreenshotRect(record: BrowserViewRecord): Promise<BrowserPromptScreenshotSelectionResult> {
  const contents = record.view.webContents;
  if (contents.isDestroyed()) return { ok: false, reason: "error", message: "Browser view is unavailable" };
  const owner = BrowserWindow.fromId(record.ownerWindowId);
  if (!owner || owner.isDestroyed()) return { ok: false, reason: "error", message: "Browser window is unavailable" };
  if (record.lastBounds.width <= 0 || record.lastBounds.height <= 0) {
    return { ok: false, reason: "error", message: "Browser view bounds are unavailable" };
  }
  try {
    bringBrowserViewToFront(record);
    record.view.setBounds(record.lastBounds);
    record.view.setVisible(true);
    contents.focus();
  } catch {
    // Focusing can fail while the view is navigating; executeJavaScript below will surface real failures.
  }
  const script = `
(() => new Promise((resolve) => {
  const existing = document.getElementById('__nomi_prompt_screenshot_selection__');
  if (existing && existing.parentElement) existing.parentElement.removeChild(existing);
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const viewport = () => ({
    width: Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1),
    height: Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1),
  });
  const pointFromEvent = (event) => {
    const bounds = viewport();
    return {
      x: clamp(event.clientX, 0, bounds.width),
      y: clamp(event.clientY, 0, bounds.height),
    };
  };
  const rectFromPoints = (start, end) => {
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const right = Math.max(start.x, end.x);
    const bottom = Math.max(start.y, end.y);
    return { left, top, width: right - left, height: bottom - top };
  };

  const overlay = document.createElement('div');
  overlay.id = '__nomi_prompt_screenshot_selection__';
  overlay.tabIndex = -1;
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483647',
    'cursor:crosshair',
    'background:rgba(0,0,0,.42)',
    'outline:none',
    'user-select:none',
    'touch-action:none',
    'pointer-events:auto'
  ].join(';');

  const hint = document.createElement('div');
  hint.textContent = '拖拽选择截图区域，Esc 取消';
  hint.style.cssText = [
    'position:fixed',
    'left:50%',
    'top:18px',
    'transform:translateX(-50%)',
    'height:32px',
    'display:flex',
    'align-items:center',
    'padding:0 12px',
    'border-radius:999px',
    'background:rgba(17,24,39,.88)',
    'color:#fff',
    'font:600 12px/1 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
    'box-shadow:0 10px 24px rgba(15,23,42,.24)',
    'pointer-events:none'
  ].join(';');

  const box = document.createElement('div');
  box.style.cssText = [
    'position:fixed',
    'display:none',
    'border:2px solid #fff',
    'border-radius:10px',
    'background:rgba(255,255,255,.08)',
    'box-shadow:0 0 0 9999px rgba(0,0,0,.34),0 12px 32px rgba(0,0,0,.28)',
    'pointer-events:none'
  ].join(';');

  const sizeLabel = document.createElement('div');
  sizeLabel.style.cssText = [
    'position:absolute',
    'right:8px',
    'bottom:8px',
    'height:22px',
    'display:flex',
    'align-items:center',
    'padding:0 7px',
    'border-radius:999px',
    'background:rgba(17,24,39,.82)',
    'color:#fff',
    'font:600 11px/1 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif'
  ].join(';');
  box.appendChild(sizeLabel);
  (document.body || document.documentElement).appendChild(overlay);
  overlay.appendChild(hint);
  overlay.appendChild(box);

  let start = null;
  let settled = false;

  const render = (rect) => {
    box.style.display = 'block';
    box.style.left = Math.round(rect.left) + 'px';
    box.style.top = Math.round(rect.top) + 'px';
    box.style.width = Math.round(rect.width) + 'px';
    box.style.height = Math.round(rect.height) + 'px';
    sizeLabel.textContent = Math.round(rect.width) + ' x ' + Math.round(rect.height);
  };
  const cleanup = () => {
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('pointercancel', onCancel, true);
    window.removeEventListener('contextmenu', onContextMenu, true);
    window.removeEventListener('keydown', onKeyDown, true);
    if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
  };
  const finish = (rect) => {
    if (settled) return;
    settled = true;
    cleanup();
    resolve(rect);
  };
  function onPointerDown(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.button !== 0) {
      finish(null);
      return;
    }
    start = pointFromEvent(event);
    render({ left: start.x, top: start.y, width: 0, height: 0 });
  }
  function onPointerMove(event) {
    if (!start) return;
    event.preventDefault();
    event.stopPropagation();
    render(rectFromPoints(start, pointFromEvent(event)));
  }
  function onPointerUp(event) {
    if (!start) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = rectFromPoints(start, pointFromEvent(event));
    finish(rect.width >= 8 && rect.height >= 8 ? rect : null);
  }
  function onCancel(event) {
    event.preventDefault();
    event.stopPropagation();
    finish(null);
  }
  function onContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    finish(null);
  }
  function onKeyDown(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    finish(null);
  }

  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onCancel, true);
  window.addEventListener('contextmenu', onContextMenu, true);
  window.addEventListener('keydown', onKeyDown, true);
  try { overlay.focus({ preventScroll: true }); } catch {}
}))()
`;
  try {
    const selected = (await contents.executeJavaScript(script, true)) as BrowserResourceCaptureRectPayload | null;
    const rect = normalizeLocalCaptureRect(record, selected ?? undefined);
    if (!rect) return { ok: false, reason: "cancelled" };
    return {
      ok: true,
      rect: {
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (!owner.isDestroyed()) owner.focus();
  }
}

async function captureBrowserPromptScreenshot(
  record: BrowserViewRecord,
  payload: BrowserViewPromptScreenshotPayload,
): Promise<unknown> {
  const contents = record.view.webContents;
  if (contents.isDestroyed()) throw new Error("Browser view is unavailable");
  const projectId = String(payload.projectId || "").trim();
  const pageUrl = contents.getURL();
  const localCaptureRect = normalizeLocalCaptureRect(record, payload.sourceRect);
  const image = localCaptureRect ? await contents.capturePage(localCaptureRect) : await contents.capturePage();
  if (image.isEmpty()) throw new Error("Screenshot is empty");
  const contentType = "image/png";
  const dataUrl = image.toDataURL();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-browser-prompt-screenshot-"));
  const fileName = safeTempFileName(String(payload.fileName || payload.title || `browser-screenshot-${Date.now()}.png`));
  const absolutePath = path.join(tempDir, fileName.endsWith(".png") ? fileName : `${fileName}.png`);
  fs.writeFileSync(absolutePath, image.toPNG());
  try {
    const asset = await movePromptReferenceFile({
      projectId,
      absolutePath,
      fileName: path.basename(absolutePath),
      contentType,
      sourceUrl: pageUrl,
      pageUrl,
      title: payload.title || contents.getTitle(),
    });
    const referenceUrl =
      asset && typeof asset === "object" && "data" in asset && typeof (asset as { data?: { url?: unknown } }).data?.url === "string"
        ? String((asset as { data: { url: string } }).data.url)
        : dataUrl;
    const sourceRect = normalizeCaptureSourceRect(
      record,
      localCaptureRect
        ? {
            left: localCaptureRect.x,
            top: localCaptureRect.y,
            width: localCaptureRect.width,
            height: localCaptureRect.height,
          }
        : {
            left: 0,
            top: 0,
            width: record.lastBounds.width,
            height: record.lastBounds.height,
          },
    );
    return {
      dataUrl,
      referenceUrl,
      fileName: path.basename(absolutePath),
      title: typeof payload.title === "string" ? payload.title : contents.getTitle(),
      sourceUrl: pageUrl,
      pageUrl,
      pageTitle: contents.getTitle(),
      ...(sourceRect ? { sourceRect } : {}),
      ...(asset ? { asset } : {}),
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function trackBrowserView(win: BrowserWindow, record: BrowserViewRecord): void {
  let ids = browserViewsByWindow.get(win.id);
  if (!ids) {
    ids = new Set();
    browserViewsByWindow.set(win.id, ids);
    win.once("closed", () => {
      const owned = browserViewsByWindow.get(win.id);
      browserViewsByWindow.delete(win.id);
      owned?.forEach((viewId) => {
        const current = browserViews.get(viewId);
        if (current) destroyBrowserView(current);
      });
    });
  }
  ids.add(record.viewId);
}

function attachBrowserViewEvents(record: BrowserViewRecord): void {
  const contents = record.view.webContents;
  const notify = () => {
    sendBrowserViewState(record);
    void installBrowserImageDragBridge(record);
    void installBrowserPromptHoverBridge(record);
    if (record.resourceCaptureEnabled) void installBrowserResourceCaptureBridge(record, true);
  };
  contents.on("did-start-loading", notify);
  contents.on("did-stop-loading", notify);
  contents.on("did-navigate", notify);
  contents.on("did-navigate-in-page", notify);
  contents.on("dom-ready", () => {
    void installBrowserImageDragBridge(record);
    void installBrowserPromptHoverBridge(record);
    if (record.resourceCaptureEnabled) void installBrowserResourceCaptureBridge(record, true);
  });
  contents.on("before-input-event", (event, input) => {
    if (!record.resourceCaptureEnabled) return;
    if (input.type !== "keyDown") return;
    if (input.isAutoRepeat) return;
    if (String(input.key || "").toLowerCase() !== "c") return;
    if (!input.control && !input.meta) return;
    event.preventDefault();
    void captureBrowserResource(record);
  });
  contents.on("console-message", (_event, _level, message) => {
    if (message.startsWith(BROWSER_IMAGE_PROMPT_CONSOLE_PREFIX)) {
      const win = BrowserWindow.fromId(record.ownerWindowId);
      if (!win || win.isDestroyed()) return;
      try {
        const payload = JSON.parse(message.slice(BROWSER_IMAGE_PROMPT_CONSOLE_PREFIX.length)) as BrowserResourceCapturePayload;
        const url = typeof payload?.url === "string" ? payload.url.trim() : "";
        if (!url) {
          win.webContents.send("browser:view:prompt-capture", {
            ok: false,
            viewId: record.viewId,
            tabId: record.tabId,
            reason: "empty",
          });
          return;
        }
        win.webContents.send("browser:view:prompt-capture", {
          ok: true,
          viewId: record.viewId,
          tabId: record.tabId,
          url,
          title: typeof payload?.title === "string" ? payload.title : "",
          fileName: typeof payload?.fileName === "string" ? payload.fileName : "",
          pageUrl: typeof payload?.pageUrl === "string" ? payload.pageUrl : "",
          pageTitle: typeof payload?.pageTitle === "string" ? payload.pageTitle : "",
          extractionMode: normalizePromptExtractionMode(payload?.extractionMode),
          sourceRect: normalizeCaptureSourceRect(record, payload?.sourceRect) || undefined,
        });
      } catch (error) {
        win.webContents.send("browser:view:prompt-capture", {
          ok: false,
          viewId: record.viewId,
          tabId: record.tabId,
          reason: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (message.startsWith(BROWSER_TEXT_PROMPT_CONSOLE_PREFIX)) {
      const win = BrowserWindow.fromId(record.ownerWindowId);
      if (!win || win.isDestroyed()) return;
      try {
        const payload = JSON.parse(message.slice(BROWSER_TEXT_PROMPT_CONSOLE_PREFIX.length)) as {
          prompt?: unknown;
          promptType?: unknown;
          pageUrl?: unknown;
          pageTitle?: unknown;
        };
        const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
        if (!prompt) return;
        win.webContents.send("browser:view:text-prompt-save", {
          ok: true,
          viewId: record.viewId,
          tabId: record.tabId,
          prompt,
          promptType: typeof payload.promptType === "string" && payload.promptType.trim()
            ? payload.promptType.trim()
            : "image",
          pageUrl: typeof payload.pageUrl === "string" ? payload.pageUrl : "",
          pageTitle: typeof payload.pageTitle === "string" ? payload.pageTitle : "",
        });
      } catch (error) {
        win.webContents.send("browser:view:text-prompt-save", {
          ok: false,
          viewId: record.viewId,
          tabId: record.tabId,
          reason: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (message === BROWSER_IMAGE_DRAG_END_CONSOLE_MESSAGE) {
      const overlay = browserAssetOverlaysByWindow.get(record.ownerWindowId);
      if (overlay) setBrowserAssetOverlayDragInteractive(overlay, false);
      return;
    }
    if (!message.startsWith(BROWSER_IMAGE_DRAG_START_CONSOLE_PREFIX)) return;
    const overlay = browserAssetOverlaysByWindow.get(record.ownerWindowId);
    if (!overlay || overlay.viewId !== record.viewId || overlay.window.isDestroyed() || !overlay.window.isVisible()) {
      return;
    }
    setBrowserAssetOverlayDragInteractive(overlay, true);
  });
  contents.on("page-title-updated", notify);
  contents.on("page-favicon-updated", (_event, favicons) => {
    const win = BrowserWindow.fromId(record.ownerWindowId);
    if (!win || win.isDestroyed()) return;
    win.webContents.send("browser:view:state", {
      viewId: record.viewId,
      tabId: record.tabId,
      url: contents.getURL(),
      title: contents.getTitle(),
      favicon: favicons[0] || "",
      canGoBack: contents.canGoBack(),
      canGoForward: contents.canGoForward(),
      loading: contents.isLoading(),
    });
  });
  contents.setWindowOpenHandler(({ url }) => {
    try {
      const nextUrl = normalizeBrowserUrl(url);
      void contents.loadURL(nextUrl);
    } catch {
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    try {
      normalizeBrowserUrl(url);
    } catch {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });
}

export function registerBrowserViewIpc(rendererUrlResolver?: () => string): void {
  browserAssetOverlayRendererUrlResolver = rendererUrlResolver ?? browserAssetOverlayRendererUrlResolver;

  ipcMain.handle("browser:view:create", async (event, payload: BrowserViewCreatePayload = {}) => {
    const win = getSenderWindow(event.sender);
    const tabId = String(payload.tabId || "").trim();
    if (!tabId) throw new Error("tabId is required");
    const partition = String(payload.partition || BROWSER_PROFILE_PARTITION);
    const viewSession = session.fromPartition(partition);
    await configureBrowserSession(viewSession);
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: true,
        session: viewSession,
      },
    });
    view.webContents.setUserAgent(STANDARD_CHROME_UA);
    view.setVisible(false);
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    win.contentView.addChildView(view);

    const record: BrowserViewRecord = {
      viewId: nextBrowserViewId,
      tabId,
      ownerWindowId: win.id,
      view,
      lastBounds: { x: 0, y: 0, width: 0, height: 0 },
      resourceCaptureEnabled: false,
      promptCategories: normalizePromptCategories([]),
    };
    nextBrowserViewId += 1;
    browserViews.set(record.viewId, record);
    trackBrowserView(win, record);
    attachBrowserViewEvents(record);
    return { viewId: record.viewId };
  });

  ipcMain.on("browser:view:destroy", (event, payload: BrowserViewIdPayload) => {
    const record = getBrowserViewForSender(event.sender, payload);
    destroyBrowserView(record);
  });

  ipcMain.on("browser:view:navigate", (event, payload: BrowserViewNavigatePayload) => {
    const record = getBrowserViewForSender(event.sender, payload);
    const url = normalizeBrowserUrl(payload.url);
    void record.view.webContents.loadURL(url);
    sendBrowserViewState(record);
  });

  ipcMain.on("browser:view:back", (event, payload: BrowserViewIdPayload) => {
    const record = getBrowserViewForSender(event.sender, payload);
    if (record.view.webContents.canGoBack()) record.view.webContents.goBack();
  });

  ipcMain.on("browser:view:forward", (event, payload: BrowserViewIdPayload) => {
    const record = getBrowserViewForSender(event.sender, payload);
    if (record.view.webContents.canGoForward()) record.view.webContents.goForward();
  });

  ipcMain.on("browser:view:reload", (event, payload: BrowserViewIdPayload) => {
    getBrowserViewForSender(event.sender, payload).view.webContents.reload();
  });

  ipcMain.on("browser:view:resize", (event, payload: BrowserViewResizePayload) => {
    const record = getBrowserViewForSender(event.sender, payload);
    const bounds = normalizeBounds(payload.bounds);
    if (sameRectangle(record.lastBounds, bounds)) return;
    record.lastBounds = bounds;
    bringBrowserViewToFront(record);
    record.view.setBounds(bounds);
  });

  ipcMain.on("browser:view:show", (event, payload: BrowserViewIdPayload) => {
    const record = getBrowserViewForSender(event.sender, payload);
    bringBrowserViewToFront(record);
    record.view.setBounds(record.lastBounds);
    record.view.setVisible(true);
    sendBrowserViewState(record);
  });

  ipcMain.on("browser:view:hide", (event, payload: BrowserViewIdPayload) => {
    const record = getBrowserViewForSender(event.sender, payload);
    record.view.webContents.setBackgroundThrottling(true);
    record.view.setVisible(false);
    void record.view.webContents.session.cookies.flushStore().catch(() => undefined);
  });

  ipcMain.handle("browser:view:import-image", async (event, payload: BrowserViewImportImagePayload) => {
    const record = getBrowserViewForSender(event.sender, payload);
    return importBrowserMedia(record, { ...payload, mediaType: "image" });
  });

  ipcMain.handle("browser:view:import-media", async (event, payload: BrowserViewImportMediaPayload) => {
    const record = getBrowserViewForSender(event.sender, payload);
    return importBrowserMedia(record, payload);
  });

  ipcMain.handle("browser:view:capture-prompt-image", async (event, payload: BrowserViewPromptImagePayload) => {
    const record = getBrowserViewForSender(event.sender, payload);
    return captureBrowserPromptImage(record, payload);
  });

  ipcMain.handle("browser:view:select-prompt-screenshot", async (event, payload: BrowserViewIdPayload) => {
    const record = getBrowserViewForSender(event.sender, payload);
    return selectBrowserPromptScreenshotRect(record);
  });

  ipcMain.handle("browser:view:capture-prompt-screenshot", async (event, payload: BrowserViewPromptScreenshotPayload) => {
    const record = getBrowserViewForSender(event.sender, payload);
    return captureBrowserPromptScreenshot(record, payload);
  });

  ipcMain.on("browser:view:set-resource-capture", (event, payload: BrowserViewIdPayload & { enabled?: unknown }) => {
    const record = getBrowserViewForSender(event.sender, payload);
    record.resourceCaptureEnabled = Boolean(payload.enabled);
    void installBrowserResourceCaptureBridge(record, record.resourceCaptureEnabled);
  });

  ipcMain.on("browser:view:set-prompt-categories", (event, payload: BrowserPromptCategoriesPayload) => {
    const record = getBrowserViewForSender(event.sender, payload);
    record.promptCategories = normalizePromptCategories(payload.categories);
    void installBrowserPromptHoverBridge(record);
  });

  ipcMain.on("browser:view:capture-resource", (event, payload: BrowserViewIdPayload) => {
    const record = getBrowserViewForSender(event.sender, payload);
    if (!record.resourceCaptureEnabled) return;
    void captureBrowserResource(record);
  });

  ipcMain.handle("browser:chrome-menu:show", (event, payload: BrowserChromeMenuPayload) => {
    const owner = getOwnerWindowForSender(event.sender);
    return showBrowserChromeMenu(owner, normalizeBrowserChromeMenuPayload(payload));
  });

  ipcMain.on("browser:chrome-menu:select", (event, id: unknown) => {
    const record = browserChromeMenusByWebContents.get(event.sender.id);
    if (record) closeBrowserChromeMenu(record, String(id || "").trim() || null);
  });

  ipcMain.on("browser:chrome-menu:cancel", (event) => {
    const record = browserChromeMenusByWebContents.get(event.sender.id);
    if (record) closeBrowserChromeMenu(record, null);
  });

  ipcMain.on("browser:asset-overlay:open", (event, payload: BrowserAssetOverlayPayload) => {
    const owner = getOwnerWindowForSender(event.sender);
    openBrowserAssetOverlay(
      owner,
      payload,
      payload.captureRequest ?? null,
      payload.promptRequest ?? null,
    );
  });

  ipcMain.on("browser:asset-overlay:update-host", (event, payload: BrowserAssetOverlayPayload) => {
    const record = getOverlayForSender(event.sender);
    if (!record) return;
    if (payload.viewId !== undefined && payload.viewId !== null) {
      const viewId = readViewId(payload);
      const browserRecord = browserViews.get(viewId);
      if (browserRecord?.ownerWindowId === record.ownerWindowId) record.viewId = viewId;
    }
    setBrowserAssetOverlayHostBounds(record, normalizeOverlayBounds(payload.bounds));
    sendBrowserAssetOverlayConfig(record);
  });

  ipcMain.on("browser:asset-overlay:close", (event) => {
    const record = getOverlayForSender(event.sender);
    if (record) closeBrowserAssetOverlay(record);
  });

  ipcMain.on("browser:asset-overlay:capture-request", (event, payload: BrowserAssetOverlayCaptureRequest) => {
    const owner = getOwnerWindowForSender(event.sender);
    const record = browserAssetOverlaysByWindow.get(owner.id);
    if (!record) return;
    showBrowserAssetOverlay(record, payload);
  });

  ipcMain.on("browser:asset-overlay:prompt-request", (event, payload: BrowserAssetOverlayPromptRequest) => {
    const owner = getOwnerWindowForSender(event.sender);
    const record = browserAssetOverlaysByWindow.get(owner.id);
    if (!record) return;
    showBrowserAssetOverlay(record, null, payload);
  });

  ipcMain.on("browser:asset-overlay:ready", (event) => {
    const record = getOverlayForSender(event.sender);
    if (!record) return;
    record.rendererReady = true;
    if (record.pendingShow) {
      showBrowserAssetOverlay(record);
      return;
    }
    sendBrowserAssetOverlayConfig(record);
    sendBrowserAssetOverlayState(record, record.window.isVisible());
  });

  ipcMain.on("browser:asset-overlay:set-interactive", (event, payload: { interactive?: unknown }) => {
    const record = getOverlayForSender(event.sender);
    if (!record || record.window.isDestroyed()) return;
    record.pointerInteractive = payload.interactive === true;
    applyBrowserAssetOverlayMouseEvents(record);
  });

  ipcMain.on("browser:asset-overlay:set-state", (event, payload: BrowserAssetOverlayStatePayload) => {
    const record = getOverlayForSender(event.sender);
    if (!record) return;
    const nextDockMode = normalizeOverlayDockMode(payload.dockMode);
    const nextPopoverRect = normalizeOverlayRect(payload.popoverRect);
    const nextCaptureEnabled =
      payload.captureEnabled === undefined ? record.captureEnabled : Boolean(payload.captureEnabled);
    const stateChanged =
      record.dockMode !== nextDockMode ||
      !sameOverlayRect(record.popoverRect, nextPopoverRect) ||
      record.captureEnabled !== nextCaptureEnabled;
    if (!stateChanged) return;
    record.dockMode = nextDockMode;
    record.popoverRect = nextPopoverRect;
    applyBrowserAssetOverlayShape(record);
    updateBrowserAssetOverlayHoverInteractive(record);
    if (payload.captureEnabled !== undefined) {
      setBrowserAssetOverlayCaptureEnabled(record, nextCaptureEnabled);
    }
    sendBrowserAssetOverlayState(record, record.window.isVisible());
  });

  ipcMain.on("browser:asset-overlay:import-to-canvas", (event, payload: unknown) => {
    const owner = getOwnerWindowForSender(event.sender);
    if (owner.isDestroyed()) return;
    owner.webContents.send("browser:asset-overlay:import-to-canvas", payload);
  });
}
