// apimart 音频模型的 curated 传输配方（TTS 文字转语音 + Whisper 音频转写）。
// 官方文档（R5 抓，.md 原文）：
//   TTS:     https://docs.apimart.ai/en/api-reference/audios/tts.md
//   Whisper: https://docs.apimart.ai/en/api-reference/audios/whisper-1.md
//
// 与图像/视频族**根本不同**：这两个端点是 **OpenAI 兼容同步**调用（响应即结果，无 task_id 轮询）：
//   TTS      POST /v1/audio/speech         JSON body  → **二进制音频字节**（response_format=wav）
//   Whisper  POST /v1/audio/transcriptions multipart  → 同步 JSON { text, ... }
// 故无 query op、无 statusMapping。runtime 识别 audio 类 → 走第四路 audio 同步收口
// （electron/audioTaskRunner.ts）：TTS 读 arrayBuffer 存盘；Whisper 建 multipart 取文本。
// 这里的 HttpOperation 提供**端点路径 + 鉴权头 + body 字段映射**（vendor 无关意图），
// 由 audioTaskRunner 据此发送（而非走 requestJson —— 它只会解析 JSON，吞不下二进制 / 不会建 multipart）。

import type { HttpOperation, ProfileKind } from "./types";

const CREATE_HEADERS = { Authorization: "Bearer {{user_api_key}}", "Content-Type": "application/json" };

export type ApimartAudioModel = {
  modelKey: string;
  labelZh: string;
  archetypeId: string;
  kind: "audio";
  mappings: { id: string; taskKind: ProfileKind; name: string; create: HttpOperation }[];
};

// TTS：input=台词/旁白（取自 prompt），voice/speed 取自档案参数，response_format 固定 wav
// （未压缩、Chromium <audio> 必能播；doc 默认值亦为 wav）。
const TTS_CREATE: HttpOperation = {
  method: "POST",
  path: "/v1/audio/speech",
  headers: CREATE_HEADERS,
  body: {
    model: "{{model.modelKey}}",
    input: "{{request.prompt}}",
    voice: "{{request.params.voice}}",
    response_format: "wav",
    speed: "{{request.params.speed}}",
  },
};

// Whisper：multipart（file + model + language + response_format）由 audioTaskRunner 组装；
// 这里 create.body 仅作字段意图说明，runner 不当 JSON 发。response_format=verbose_json 以拿 segments
// （供「生成字幕」转 SRT）。
const WHISPER_CREATE: HttpOperation = {
  method: "POST",
  path: "/v1/audio/transcriptions",
  headers: { Authorization: "Bearer {{user_api_key}}" },
  body: {
    model: "{{model.modelKey}}",
    language: "{{request.params.language}}",
    response_format: "verbose_json",
  },
};

/** apimart 的 2 个音频模型（单源）。 */
export const APIMART_AUDIO_MODELS: ApimartAudioModel[] = [
  {
    modelKey: "gpt-4o-mini-tts",
    labelZh: "GPT-4o mini TTS",
    archetypeId: "gpt-4o-mini-tts",
    kind: "audio",
    mappings: [
      { id: "seed-apimart-gpt-4o-mini-tts-text_to_audio", taskKind: "text_to_audio", name: "GPT-4o mini TTS · 配音生成", create: TTS_CREATE },
    ],
  },
  {
    modelKey: "whisper-1",
    labelZh: "Whisper",
    archetypeId: "whisper-1",
    kind: "audio",
    mappings: [
      { id: "seed-apimart-whisper-1-transcribe", taskKind: "transcribe", name: "Whisper · 音频转写", create: WHISPER_CREATE },
    ],
  },
];
