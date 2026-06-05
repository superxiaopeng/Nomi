import { describe, it, expect } from "vitest";
import { appendQueryParams, buildHttpRequest, buildTemplateContext } from "../ai/requestPipeline";
import {
  KIE_VENDOR_SEED,
  SEEDANCE_2_CREATE_OP,
  SEEDANCE_2_MODEL_SEED,
  SEEDANCE_2_QUERY_OP,
} from "./kieSeedance";

// C1 薄垂直片：离线锁定 Seedance「首帧」经 kie.ai 的传输契约 —— 在不花额度、不打真实
// API 的前提下，证明我们 curated 的 mapping 渲染出的请求是对的。真实生成那一步另走（需用户 key）。
//
// 这份测试同时是 M4（轮询端点 + joinUrl 双前缀坑）的回归网兜：断言最终 URL 不出现
// ".../api/v1/api/v1/..."。

// 模拟 taskTemplateParams 对一个「首帧」请求产出的 params（first_frame_url + 标量）。
const FIRST_FRAME_URL = "https://example.com/first-frame.png";
const context = buildTemplateContext({
  request: { prompt: "一只猫在草地上奔跑" },
  params: {
    first_frame_url: FIRST_FRAME_URL,
    resolution: "720p",
    aspect_ratio: "16:9",
    duration: "5",
  },
  model: { modelKey: SEEDANCE_2_MODEL_SEED.modelKey },
  modelKey: SEEDANCE_2_MODEL_SEED.modelKey,
  apiKey: "SECRET",
  providerMeta: { task_id: "task_bytedance_123" },
});

describe("Seedance 2.0 · 首帧 — createTask 请求", () => {
  const built = buildHttpRequest({
    baseUrl: KIE_VENDOR_SEED.baseUrl,
    authType: KIE_VENDOR_SEED.authType,
    apiKey: "SECRET",
    context,
    operation: SEEDANCE_2_CREATE_OP,
  });

  it("URL 拼接正确，无双 /api/v1 前缀（M4）", () => {
    expect(built.url).toBe("https://api.kie.ai/api/v1/jobs/createTask");
    expect(built.url).not.toContain("/api/v1/api/v1");
  });

  it("body 用 model enum + 嵌套 input，首帧/标量都到位", () => {
    expect(built.body).toEqual({
      model: "bytedance/seedance-2",
      input: {
        prompt: "一只猫在草地上奔跑",
        first_frame_url: FIRST_FRAME_URL,
        resolution: "720p",
        aspect_ratio: "16:9",
        duration: "5",
      },
    });
  });

  it("鉴权头解析正确（不出现空 Bearer），预览里脱敏", () => {
    expect(built.headers.Authorization).toBe("Bearer SECRET");
    expect(built.preview.headers.Authorization).toBe("[redacted]");
  });
});

describe("Seedance 2.0 · 首帧 — recordInfo 轮询请求", () => {
  const built = buildHttpRequest({
    baseUrl: KIE_VENDOR_SEED.baseUrl,
    authType: KIE_VENDOR_SEED.authType,
    apiKey: "SECRET",
    context,
    operation: SEEDANCE_2_QUERY_OP,
  });

  it("轮询 URL 无双前缀，taskId 用真实 providerMeta（不是本地伪造）", () => {
    expect(appendQueryParams(built.url, built.query)).toBe(
      "https://api.kie.ai/api/v1/jobs/recordInfo?taskId=task_bytedance_123",
    );
    expect(built.url).not.toContain("/api/v1/api/v1");
  });

  it("GET 无 body 时不应附加 Content-Type", () => {
    expect(Object.keys(built.headers).some((k) => k.toLowerCase() === "content-type")).toBe(false);
  });
});
