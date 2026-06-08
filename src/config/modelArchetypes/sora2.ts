import type { ModelParameterControl } from "../modelCatalogMeta";
import type { ModelArchetype } from "./types";

// Sora 2（apimart 独占）视频档案。契约见 docs/plan/2026-06-07-apimart-curated-onboarding.md 附录 A
// （已真 mp4 验证）。文生视频 / 图生视频（image_urls ≤1）。param 键 = apimart 字段名。

const opt = (values: string[]): ModelParameterControl["options"] => values.map((value) => ({ value, label: value }));

const PARAMS: ModelParameterControl[] = [
  { key: "aspect_ratio", label: "比例", type: "select", options: opt(["16:9", "9:16"]), defaultValue: "16:9" },
  { key: "resolution", label: "清晰度", type: "select", options: opt(["720p", "1080p"]), defaultValue: "720p" },
  { key: "duration", label: "时长(秒)", type: "number", options: [], min: 4, max: 20, defaultValue: 4 },
];

export const SORA_2_ARCHETYPE: ModelArchetype = {
  id: "sora-2",
  family: "sora",
  label: "Sora 2",
  kind: "video",
  defaultModeId: "t2v",
  transportTaskKind: "text_to_video",
  identifierPatterns: ["sora-2", "sora-2-pro", "sora2"],
  modes: [
    { id: "t2v", intent: "text", vendorTerm: "文生视频", hint: "纯文字生成视频", promptRequired: true, transportTaskKind: "text_to_video", slots: [], params: PARAMS },
    {
      id: "i2v", intent: "single", vendorTerm: "图生视频", hint: "单张参考图驱动（比例随图自动决定）", promptRequired: true,
      transportTaskKind: "image_to_video",
      slots: [{ kind: "image_ref", label: "参考图", min: 1, max: 1, inputKey: "image_urls" }],
      params: PARAMS,
    },
  ],
};
