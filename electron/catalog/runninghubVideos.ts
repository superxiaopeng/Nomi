// RunningHub 视频模型（apimart 兼容集首个代表：Seedance 2.0 标准版 global，文生+图生视频）。
// 证明「视频经 RunningHub」端到端跑通；Veo/Kling/Wan/Hailuo/Sora 等同 vendor 视频模型照此增量加
// （各取官方注册表精确 body 参数 + 各自 RunningHub 专属档案）。轮询/状态映射复用 runninghub3d 单源。
import type { HttpOperation, ProfileKind } from "./types";
import { RUNNINGHUB_VENDOR_SEED, RUNNINGHUB_QUERY_OP, RUNNINGHUB_STATUS_MAPPING, RUNNINGHUB_HDR } from "./runninghub3d";

const SEEDANCE_GLOBAL_T2V_CREATE: HttpOperation = {
  method: "POST", path: "/bytedance/seedance-2.0-global/text-to-video", headers: RUNNINGHUB_HDR,
  body: {
    prompt: "{{request.prompt}}", resolution: "{{request.params.resolution}}", duration: "{{request.params.duration}}",
    ratio: "{{request.params.ratio}}", generateAudio: "{{request.params.generateAudio}}",
  },
};
const SEEDANCE_GLOBAL_I2V_CREATE: HttpOperation = {
  method: "POST", path: "/bytedance/seedance-2.0-global/image-to-video", headers: RUNNINGHUB_HDR,
  body: {
    prompt: "{{request.prompt}}", resolution: "{{request.params.resolution}}", duration: "{{request.params.duration}}",
    ratio: "{{request.params.ratio}}", generateAudio: "{{request.params.generateAudio}}",
    firstFrameUrl: "{{request.params.firstFrameUrl}}", lastFrameUrl: "{{request.params.lastFrameUrl}}",
  },
};

export const RUNNINGHUB_VIDEO_CURATED_MODELS = [
  { modelKey: "bytedance/seedance-2.0-global", labelZh: "Seedance 2.0 (RunningHub)", kind: "video" as const, archetypeId: "runninghub-seedance" },
];

const mk = (id: string, taskKind: ProfileKind, modelKey: string, name: string, create: HttpOperation) => ({
  id, vendorKey: RUNNINGHUB_VENDOR_SEED.key, taskKind, modelKey, name, create,
  query: RUNNINGHUB_QUERY_OP, statusMapping: RUNNINGHUB_STATUS_MAPPING,
});

export const RUNNINGHUB_VIDEO_CURATED_MAPPINGS = [
  mk("seed-runninghub-seedance-global-text_to_video", "text_to_video", "bytedance/seedance-2.0-global", "Seedance 2.0 · 文生视频", SEEDANCE_GLOBAL_T2V_CREATE),
  mk("seed-runninghub-seedance-global-image_to_video", "image_to_video", "bytedance/seedance-2.0-global", "Seedance 2.0 · 图生视频", SEEDANCE_GLOBAL_I2V_CREATE),
];
