import type { ModelParameterControl } from "../modelCatalogMeta";
import type { ModelArchetype } from "./types";

// Veo 3.1（apimart 独占）视频档案。模型默认 veo3.1-fast（catalog modelKey）；docs：duration 8（R6 对标
// Infinite-Canvas 显示实际接受 4-8，这里给 4/8）；aspect 16:9/9:16；resolution 720p/1080p/4k。

const opt = (values: string[]): ModelParameterControl["options"] => values.map((value) => ({ value, label: value }));

const PARAMS: ModelParameterControl[] = [
  { key: "aspect_ratio", label: "比例", type: "select", options: opt(["16:9", "9:16"]), defaultValue: "16:9" },
  { key: "resolution", label: "清晰度", type: "select", options: opt(["720p", "1080p", "4k"]), defaultValue: "720p" },
  { key: "duration", label: "时长(秒)", type: "number", options: [], min: 4, max: 8, defaultValue: 8 },
];

export const VEO_3_1_ARCHETYPE: ModelArchetype = {
  id: "veo-3.1",
  family: "veo",
  label: "Veo 3.1",
  kind: "video",
  defaultModeId: "t2v",
  transportTaskKind: "text_to_video",
  identifierPatterns: ["veo-3.1", "veo3.1", "veo3.1-fast", "veo3.1-quality", "veo3.1-lite"],
  modes: [
    { id: "t2v", intent: "text", vendorTerm: "文生视频", hint: "纯文字生成视频", promptRequired: true, transportTaskKind: "text_to_video", slots: [], params: PARAMS },
    {
      id: "i2v", intent: "single", vendorTerm: "图生视频", hint: "参考图驱动（最多 3 张）", promptRequired: true,
      transportTaskKind: "image_to_video",
      slots: [{ kind: "image_ref", label: "参考图", min: 1, max: 3, inputKey: "image_urls" }],
      params: PARAMS,
    },
  ],
};
