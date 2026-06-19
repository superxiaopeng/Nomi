import type { HttpOperation, ProfileKind } from "./types";
import { MODELSCOPE_IMAGE_QUERY_OP, MODELSCOPE_STATUS_MAPPING } from "./modelscopeVendor";

// 魔搭图片模型的 curated 传输配方（单源）。形状 100% 来自真实 API 验证（见 modelscopeVendor.ts 注释）。
// 提交 op 只取 task_id（顶层）→ 进 poll 循环；poll/status 共用 modelscopeVendor 的 QUERY_OP + STATUS_MAPPING。

const CREATE_HEADERS = {
  Authorization: "Bearer {{user_api_key}}",
  "Content-Type": "application/json",
  "X-ModelScope-Async-Mode": "true",
};

/** 异步提交 op：model + prompt 固定，extraBody 补 size 等（undefined 键模板引擎丢弃）。 */
function imageCreateOp(extraBody: Record<string, unknown> = {}): HttpOperation {
  return {
    method: "POST",
    path: "/v1/images/generations",
    headers: CREATE_HEADERS,
    body: { model: "{{model.modelKey}}", prompt: "{{request.prompt}}", ...extraBody },
    response_mapping: { task_id: "task_id" },
    provider_meta_mapping: { task_id: "task_id" },
  };
}

const SIZE = "{{request.params.size}}"; // 像素 WxH，由档案 size 枚举给

/** 一个魔搭图片模型的 curated 定义（catalog 行 + 档案指针 + mapping）。 */
export type ModelscopeImageModel = {
  modelKey: string;
  labelZh: string;
  archetypeId: string;
  mappings: { id: string; taskKind: ProfileKind; name: string; create: HttpOperation }[];
};

// v1 只接两条**已真实出图验证**的文生图链路。
// Qwen-Image-Edit（需参考图 data URL 入参，另一条 ingestion 验证面）与 FLUX.2-klein 留下一批。
export const MODELSCOPE_IMAGE_MODELS: ModelscopeImageModel[] = [
  {
    modelKey: "Tongyi-MAI/Z-Image-Turbo",
    labelZh: "Z-Image Turbo",
    archetypeId: "modelscope-image",
    mappings: [
      {
        id: "seed-modelscope-z-image-turbo-text_to_image",
        taskKind: "text_to_image",
        name: "Z-Image Turbo · 文生图",
        create: imageCreateOp({ size: SIZE }),
      },
    ],
  },
  {
    modelKey: "Qwen/Qwen-Image-2512",
    labelZh: "Qwen-Image",
    archetypeId: "modelscope-image",
    mappings: [
      {
        id: "seed-modelscope-qwen-image-text_to_image",
        taskKind: "text_to_image",
        name: "Qwen-Image · 文生图",
        create: imageCreateOp({ size: SIZE }),
      },
    ],
  },
];

export const MODELSCOPE_IMAGE_QUERY = MODELSCOPE_IMAGE_QUERY_OP;
export const MODELSCOPE_IMAGE_STATUS = MODELSCOPE_STATUS_MAPPING;
