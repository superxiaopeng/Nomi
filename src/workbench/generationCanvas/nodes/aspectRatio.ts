// 画面比例（aspect ratio）的单一真相源解析。
// 三处复用同一份逻辑（P4 通用第一）：
//   ① 画布节点图像区（BaseGenerationNode）未生成态按比例显示形状
//   ② 计划清单卡的比例下拉预览（AspectBox 组件）
//   ③ 参数面板的比例预览
// 比例值是 vendor 档案里的字符串（"16:9" / "9:16" / "1:1" …），存在 node.meta。
// 不同档案的 key 命名不一：多数是 `aspect_ratio`，imagen4/qwen 用 `size`，
// Seedream 改图模式用 `image_size`（named bucket 格式，见下方映射表）。
import type { GenerationCanvasNode } from "../model/generationCanvasTypes";

// 比例参数可能用到的 meta key，按常见度排序。
export const ASPECT_RATIO_KEYS = ["aspect_ratio", "size", "ratio", "image_size"] as const;

/**
 * Named bucket → W:H 标准字符串映射。
 * 覆盖 Seedream edit mode 的 image_size 枚举值（portrait_4_3 等）。
 * 值是 W:H 字符串，可直接被 parseAspectRatioValue 解析，也可直接写入 meta.aspect_ratio。
 */
const NAMED_RATIO_TO_WH: Readonly<Record<string, string>> = {
  square:         "1:1",
  square_hd:      "1:1",
  portrait_4_3:   "3:4",
  portrait_3_2:   "2:3",
  portrait_16_9:  "9:16",
  landscape_4_3:  "4:3",
  landscape_3_2:  "3:2",
  landscape_16_9: "16:9",
  landscape_21_9: "21:9",
};

/**
 * 把 "W:H" 比例字符串（或 named bucket）解析成数值宽高比（width / height）。
 * - "16:9" → 1.777…，"9:16" → 0.5625，"1:1" → 1
 * - named bucket（"square_hd" / "portrait_4_3" …）→ 对应 W:H 再解析
 * - 不认识的值（"adaptive" / "auto" / "2K" / "basic" / 空）→ null
 * 支持中文冒号「：」。
 */
export function parseAspectRatioValue(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)$/);
  if (match) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!(width > 0) || !(height > 0)) return null;
    return width / height;
  }
  // named bucket（Seedream edit mode 等）
  const mapped = NAMED_RATIO_TO_WH[trimmed];
  return mapped ? parseAspectRatioValue(mapped) : null;
}

/**
 * 把任意比例值规范化为 "W:H" 字符串。
 * - 已是 W:H → 原样返回
 * - named bucket → 映射到 W:H
 * - 不认识（"auto" / "2K" / …）→ null
 * 用于写参数时同步更新 meta.aspect_ratio（最高优先级读取键），避免跨模式 key 遮蔽。
 */
export function normalizeAspectRatioToWH(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)$/.test(trimmed)) return trimmed;
  return NAMED_RATIO_TO_WH[trimmed] ?? null;
}

/**
 * 从节点 meta 读出当前选定的画面比例（数值）。读不到（未选模型 / 该模型无比例参数）返回 null。
 * 按 ASPECT_RATIO_KEYS 顺序找第一个能解析成 W:H 的值——非比例的 size 值（如 "2K"）会被自动跳过。
 */
export function readNodeAspectRatio(node: GenerationCanvasNode): number | null {
  const meta = node.meta;
  if (!meta || typeof meta !== "object") return null;
  const bag = meta as Record<string, unknown>;
  for (const key of ASPECT_RATIO_KEYS) {
    const ratio = parseAspectRatioValue(bag[key]);
    if (ratio) return ratio;
  }
  return null;
}
