import type { ModelParameterControl } from "../modelCatalogMeta";
import type { ModelArchetype } from "./types";

// Seedance 2.0 经 apimart 的视频档案。**独立于 kie 的 seedance-2 档案**：apimart 图生视频用 image_urls
// 数组（≤9），与 kie 的 first/last/omni 多槽分离键结构不同——这是 B/A 混用的合理边界（枚举差异用
// vendorParams=B，能力结构差异用独立档案=A）。比例字段是 size；音频字段 generate_audio。

const opt = (values: string[]): ModelParameterControl["options"] => values.map((value) => ({ value, label: value }));

const PARAMS: ModelParameterControl[] = [
  { key: "size", label: "比例", type: "select", options: opt(["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"]), defaultValue: "16:9" },
  { key: "resolution", label: "清晰度", type: "select", options: opt(["480p", "720p", "1080p"]), defaultValue: "720p" },
  { key: "duration", label: "时长(秒)", type: "number", options: [], min: 4, max: 15, defaultValue: 5 },
  { key: "generate_audio", label: "生成音频", type: "boolean", options: [], defaultValue: true },
];

export const SEEDANCE_2_APIMART_ARCHETYPE: ModelArchetype = {
  id: "seedance-2-apimart",
  family: "seedance",
  label: "Seedance 2.0",
  kind: "video",
  defaultModeId: "t2v",
  transportTaskKind: "text_to_video",
  identifierPatterns: ["doubao-seedance-2.0", "doubao-seedance-2-0"],
  modes: [
    { id: "t2v", intent: "text", vendorTerm: "文生视频", hint: "纯文字生成视频", promptRequired: true, transportTaskKind: "text_to_video", slots: [], params: PARAMS },
    {
      id: "i2v", intent: "single", vendorTerm: "图生视频", hint: "参考图驱动（最多 9 张）", promptRequired: true,
      transportTaskKind: "image_to_video",
      slots: [{ kind: "image_ref", label: "参考图", min: 1, max: 9, inputKey: "image_urls" }],
      params: PARAMS,
    },
  ],
};
