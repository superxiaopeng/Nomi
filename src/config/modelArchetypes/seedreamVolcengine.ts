import type { ModelParameterControl } from "../modelCatalogMeta";
import type { ModelArchetype } from "./types";

// 火山方舟 Seedream 5.0 图像档案。真实 API 验证（2026-06-19，用户 key，doubao-seedream-5-0-260128 出图）：
// **同步**出图（data[0].url，无轮询），size 必须像素 WxH 且像素数 ≥ ~370 万
// （实测 1024x1024 → HTTP 400「image size must be at least N pixels」；2048x2048 / 2304x1728 / 2560x1440 → 200）。
// 与 apimart/kie 的 seedream 档案（比例串 size）是不同 vendor 不同契约，故独立档案（P4）。

const opt = (values: string[]): ModelParameterControl["options"] => values.map((value) => ({ value, label: value }));

const SIZE_PARAM: ModelParameterControl = {
  key: "size",
  label: "尺寸",
  type: "select",
  // 全部 ≥370 万像素（火山 Seedream 5.0 最低分辨率约束）。1:1 / 4:3 / 3:4 / 16:9 / 9:16。
  options: opt(["2048x2048", "2304x1728", "1728x2304", "2560x1440", "1440x2560"]),
  defaultValue: "2048x2048",
};

export const SEEDREAM_VOLCENGINE_ARCHETYPE: ModelArchetype = {
  id: "volcengine-seedream",
  family: "seedream",
  label: "Seedream 5.0",
  kind: "image",
  defaultModeId: "t2i",
  transportTaskKind: "text_to_image",
  // 显式 archetypeId 优先（seed 模型已带），patterns 仅给用户自接火山同名模型兜底。
  identifierPatterns: ["doubao-seedream-5", "doubao-seedream-4"],
  modes: [
    {
      id: "t2i",
      intent: "text",
      vendorTerm: "文生图",
      hint: "火山 Seedream 高清文生图",
      promptRequired: true,
      transportTaskKind: "text_to_image",
      slots: [],
      params: [SIZE_PARAM],
    },
  ],
};
