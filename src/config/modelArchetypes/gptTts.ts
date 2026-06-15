import type { ModelParameterControl } from "../modelCatalogMeta";
import type { ModelArchetype } from "./types";

// GPT-4o mini TTS（文字转语音）档案。供应商无关：任何中转接入 gpt-4o-mini-tts 都吃这套。
// 契约见 docs.apimart.ai/en/api-reference/audios/tts.md（R5）：input≤4096 字、voice 6 选、speed 0.25–4.0、
// response_format=wav（runtime 固定，未压缩必能播）。配音 = 纯文字输入（intent text，无参考槽）。

// 音色用 vendor 真名为主（P4：用模型自己的叫法），括注音色特征助选。
const VOICE_OPTIONS: ModelParameterControl["options"] = [
  { value: "alloy", label: "alloy · 中性" },
  { value: "echo", label: "echo · 男声·沉稳" },
  { value: "fable", label: "fable · 英伦·叙事" },
  { value: "onyx", label: "onyx · 男声·浑厚" },
  { value: "nova", label: "nova · 女声·活力" },
  { value: "shimmer", label: "shimmer · 女声·轻柔" },
];

const TTS_PARAMS: ModelParameterControl[] = [
  { key: "voice", label: "音色", type: "select", options: VOICE_OPTIONS, defaultValue: "alloy" },
  { key: "speed", label: "语速", type: "number", options: [], min: 0.25, max: 4, defaultValue: 1 },
];

export const GPT_TTS_ARCHETYPE: ModelArchetype = {
  id: "gpt-4o-mini-tts",
  family: "gpt-tts",
  label: "GPT-4o mini TTS",
  kind: "audio",
  defaultModeId: "speech",
  transportTaskKind: "text_to_audio",
  identifierPatterns: ["gpt-4o-mini-tts"],
  modes: [
    {
      id: "speech",
      intent: "text",
      vendorTerm: "配音生成",
      hint: "文字转语音（最多 4096 字）",
      promptRequired: true,
      transportTaskKind: "text_to_audio",
      slots: [],
      params: TTS_PARAMS,
    },
  ],
};
