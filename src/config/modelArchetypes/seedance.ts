import type { ModelParameterControl } from "../modelCatalogMeta";
import type { ModelArchetype } from "./types";

// Seedance 2.0 档案。本轮（C1 薄垂直片）只先放「首帧」一个模式验证打通；
// 「首尾帧 / 全能参考」在 C2/C3 增量加（数据加在这里、UI 随之）。
// resolution/aspect_ratio/duration 取自 kie.ai 文档（docs.kie.ai/market/bytedance/seedance-2）。
// 标量参数用现有的 ModelParameterControl 形状（规则 1，不另造）。

const toOptions = (values: string[]): ModelParameterControl["options"] =>
  values.map((value) => ({ value, label: value }));

const FIRST_MODE_PARAMS: ModelParameterControl[] = [
  { key: "resolution", label: "清晰度", type: "select", options: toOptions(["480p", "720p", "1080p"]), defaultValue: "720p" },
  {
    key: "aspect_ratio",
    label: "比例",
    type: "select",
    options: toOptions(["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "adaptive"]),
    defaultValue: "16:9",
  },
  { key: "duration", label: "时长", type: "number", options: [], min: 4, max: 15, defaultValue: 5 },
  // key 对齐 kie input 键 generate_audio，让控件值直接流到请求体（avoid 键名漂移）。
  { key: "generate_audio", label: "生成音频", type: "boolean", options: [], defaultValue: true },
];

export const SEEDANCE_2_ARCHETYPE: ModelArchetype = {
  id: "seedance-2",
  family: "seedance",
  label: "Seedance 2.0",
  kind: "video",
  defaultModeId: "first",
  identifierPatterns: ["bytedance/seedance-2", "seedance-2", "seedance2"],
  modes: [
    {
      id: "first",
      intent: "single",
      vendorTerm: "首帧",
      hint: "单张首帧图驱动生成",
      promptRequired: true,
      slots: [{ kind: "first_frame", label: "首帧", min: 1, max: 1 }],
      params: FIRST_MODE_PARAMS,
    },
  ],
};
