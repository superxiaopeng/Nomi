import type { ModelParameterControl } from "../modelCatalogMeta";
import type { ModelArchetype } from "./types";

// Whisper-1（音频转文字）档案。契约见 docs.apimart.ai/en/api-reference/audios/whisper-1.md（R5）：
// multipart 上传 file（mp3/m4a/wav/webm…≤25MB），language 选填（ISO-639-1，指定可提速提准），
// response_format 取 verbose_json（带 segments → 供「生成字幕」转 SRT）。
// 输入 = 单个音频参考（intent single，audio_ref 槽 min1 max1），无 prompt 必填。

const LANGUAGE_OPTIONS: ModelParameterControl["options"] = [
  { value: "", label: "自动检测" },
  { value: "zh", label: "中文" },
  { value: "en", label: "英文" },
  { value: "ja", label: "日文" },
  { value: "ko", label: "韩文" },
];

const WHISPER_PARAMS: ModelParameterControl[] = [
  { key: "language", label: "语言", type: "select", options: LANGUAGE_OPTIONS, defaultValue: "" },
];

export const WHISPER_ARCHETYPE: ModelArchetype = {
  id: "whisper-1",
  family: "whisper",
  label: "Whisper",
  kind: "audio",
  defaultModeId: "transcribe",
  transportTaskKind: "transcribe",
  identifierPatterns: ["whisper-1", "whisper"],
  modes: [
    {
      id: "transcribe",
      intent: "single",
      vendorTerm: "转写音频",
      hint: "音频转文字（≤25MB）",
      promptRequired: false,
      transportTaskKind: "transcribe",
      slots: [{ kind: "audio_ref", label: "音频", min: 1, max: 1, inputKey: "file", asArray: false }],
      params: WHISPER_PARAMS,
    },
  ],
};
