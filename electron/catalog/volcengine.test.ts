import { describe, expect, it } from "vitest";
import { VOLCENGINE_VENDOR_SEED } from "./volcengineVendor";
import { VOLCENGINE_IMAGE_MODELS } from "./volcengineImages";
import { taskStatusFromResponse } from "../tasks/responseParsing";

// 形状锁：来自 2026-06-19 真实 API 验证（用户 key，doubao-seedream-5-0-260128 出图）。
// 真实成功响应（同步，无 task_id）：
const SYNC_OK = { model: "doubao-seedream-5-0-260128", created: 1, data: [{ url: "https://tos/x.jpeg", size: "2048x2048" }], usage: {} };

describe("火山 Seedream 接入（真实 API 形状锁·同步）", () => {
  it("vendor 种子：裸 baseUrl + bearer", () => {
    expect(VOLCENGINE_VENDOR_SEED.key).toBe("volcengine");
    expect(VOLCENGINE_VENDOR_SEED.baseUrl).toBe("https://ark.cn-beijing.volces.com");
    expect(VOLCENGINE_VENDOR_SEED.authType).toBe("bearer");
  });

  it("Seedream 全 family（5.0/4.5/4.0）：同步 create（无 query），结果在 data.0.url", () => {
    expect(VOLCENGINE_IMAGE_MODELS).toHaveLength(3);
    expect(VOLCENGINE_IMAGE_MODELS.map((m) => m.modelKey)).toEqual([
      "doubao-seedream-5-0-260128",
      "doubao-seedream-4-5-251128",
      "doubao-seedream-4-0-250828",
    ]);
    for (const model of VOLCENGINE_IMAGE_MODELS) {
      expect(model.archetypeId).toBe("volcengine-seedream");
      const create = model.mappings[0].create;
      expect(model.mappings[0].taskKind).toBe("text_to_image");
      expect(create.path).toBe("/api/v3/images/generations");
      expect(create.response_mapping?.image_url).toBe("data.0.url");
      // 同步族：create 不声明 task_id（无轮询）。
      expect(create.response_mapping?.task_id).toBeUndefined();
      const body = create.body as Record<string, unknown>;
      expect(body.size).toBe("{{request.params.size}}");
      expect(body.watermark).toBe(false); // 默认去「AI生成」角标
    }
  });

  it("真实同步响应经 runtime 解析器：有图即 succeeded（无 status 字段也不卡 queued）", () => {
    const rm = VOLCENGINE_IMAGE_MODELS[0].mappings[0].create.response_mapping as Record<string, unknown>;
    // assetUrls 传入提取到的图 → taskStatusFromResponse 命中「有图即成」兜底（responseParsing line99）。
    expect(taskStatusFromResponse(SYNC_OK, rm, undefined, ["https://tos/x.jpeg"])).toBe("succeeded");
  });
});
