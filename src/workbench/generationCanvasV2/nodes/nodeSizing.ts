// BaseGenerationNode 的纯工具/常量：状态文案、尺寸边界、媒体尺寸推算、时间轴落点命中。
// 从 BaseGenerationNode.tsx 抽出（纯函数 + 常量，无 React 依赖）。
import type { GenerationCanvasNode } from "../model/generationCanvasTypes";

export const STATUS_LABEL: Record<string, string> = {
    queued: "排队中",
    running: "生成中",
    error: "生成失败",
};

export type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const RESIZE_DIRECTIONS: ResizeDirection[] = [
    "n",
    "s",
    "e",
    "w",
    "ne",
    "nw",
    "se",
    "sw",
];
export const MIN_NODE_WIDTH = 240;
export const MAX_NODE_WIDTH = 680;
export const MIN_NODE_HEIGHT = 120;
export const MAX_NODE_HEIGHT = 520;
// 文本节点（C5）自由缩放边界——文档卡片要更宽更高才好写。
export const TEXT_MIN_WIDTH = 280;
export const TEXT_MAX_WIDTH = 680;
export const TEXT_MIN_HEIGHT = 200;
export const TEXT_MAX_HEIGHT = 800;
export type NodeSizeBounds = {
    minWidth: number;
    maxWidth: number;
    minHeight: number;
    maxHeight: number;
};
// 非媒体节点（含 text）自由缩放时的 min/max。媒体（图/视频）走比例锁定分支，
// 仍用上面的 MIN/MAX_NODE_*，故此处只为「自由拉伸」路径按 kind 取边界。
export function getNodeSizeBounds(kind: GenerationCanvasNode["kind"]): NodeSizeBounds {
    if (kind === "text") {
        return {
            minWidth: TEXT_MIN_WIDTH,
            maxWidth: TEXT_MAX_WIDTH,
            minHeight: TEXT_MIN_HEIGHT,
            maxHeight: TEXT_MAX_HEIGHT,
        };
    }
    return {
        minWidth: MIN_NODE_WIDTH,
        maxWidth: MAX_NODE_WIDTH,
        minHeight: MIN_NODE_HEIGHT,
        maxHeight: MAX_NODE_HEIGHT,
    };
}
export const TIMELINE_TRACK_CLIPS_SELECTOR = ".workbench-timeline-track__clips";

export const FOCUS_GENERATION_NODE_EVENT = "nomi-focus-generation-node";

export function clampNumber(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function readFiniteNumber(value: unknown): number | null {
    const parsed =
        typeof value === "number"
            ? value
            : typeof value === "string"
              ? Number(value)
              : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function nodeWidthForAspectRatio(aspectRatio: number): number {
    if (aspectRatio >= 1.75) return 420;
    if (aspectRatio <= 0.72) return 260;
    return 340;
}

export function mediaNodeSize(
    width: number,
    height: number,
    preferredWidth?: number,
): { width: number; height: number; previewHeight: number } | null {
    if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
    )
        return null;
    const aspectRatio = width / height;
    const nodeWidth = clampNumber(
        preferredWidth || nodeWidthForAspectRatio(aspectRatio),
        240,
        680,
    );
    const previewHeight = clampNumber(
        Math.round(nodeWidth / aspectRatio),
        120,
        520,
    );
    return {
        width: nodeWidth,
        height: previewHeight,
        previewHeight,
    };
}

export function findTimelineDropTarget(
    clientX: number,
    clientY: number,
): HTMLElement | null {
    // v0.7.3 fix: elementsFromPoint (plural) 返回所有重叠元素，
    // 跳过被拖动的卡片本身（topmost）找下方的时间轴。
    // 单数版 elementFromPoint 只返回最顶层，拖动时永远是被拖卡片，永远找不到 timeline。
    if (typeof document.elementsFromPoint === "function") {
        const elements = document.elementsFromPoint(clientX, clientY);
        for (const el of elements) {
            const target = el.closest(TIMELINE_TRACK_CLIPS_SELECTOR);
            if (target instanceof HTMLElement) return target;
        }
        return null;
    }
    // 兜底：老浏览器
    const element = document.elementFromPoint(clientX, clientY);
    if (!element) return null;
    return element.closest(TIMELINE_TRACK_CLIPS_SELECTOR) as HTMLElement | null;
}
