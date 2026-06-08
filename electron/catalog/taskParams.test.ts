import { describe, it, expect } from "vitest";
import { taskTemplateParams, firstReferenceImage } from "./taskParams";

// 「接入即验证」的零额度一环：在不真跑、不花额度的前提下，核对"摊平给模板的参数"是否完整、类型对。
// 这些坑都只在真实参数构建里暴露（实测）：① duration 是数字被 firstString 吞成 ""；
// ② omni 参考数组该不该进 params；③ generate_audio 布尔值该原样保留。

describe("taskTemplateParams — 时长类型", () => {
  it("数字时长原样保留（修复点：number 5 不再被吞成空串）", () => {
    expect(taskTemplateParams({ extras: { duration: 5 } }).duration).toBe(5);
  });
  it("字符串时长 trim 后保留；缺省为空串", () => {
    expect(taskTemplateParams({ extras: { duration: " 8 " } }).duration).toBe("8");
    expect(taskTemplateParams({ extras: {} }).duration).toBe("");
  });
  it("durationSeconds / videoDuration 兜底", () => {
    expect(taskTemplateParams({ extras: { durationSeconds: 10 } }).duration).toBe(10);
  });
});

describe("taskTemplateParams — 档案参考输入（omni）", () => {
  it("archetypeInput 的 reference_image_urls 透传进 params（数组），generate_audio 布尔原样", () => {
    const params = taskTemplateParams({
      extras: {
        archetypeInput: { reference_image_urls: ["a.png", "b.png"] },
        generate_audio: true,
        resolution: "720p",
      },
    });
    expect(params.reference_image_urls).toEqual(["a.png", "b.png"]);
    expect(params.generate_audio).toBe(true);
    expect(params.resolution).toBe("720p");
  });
  it("无 archetypeInput → 不凭空造参考键", () => {
    const params = taskTemplateParams({ extras: { resolution: "1080p" } });
    expect(params).not.toHaveProperty("reference_image_urls");
  });
});

describe("firstReferenceImage — 单图首选", () => {
  it("按 image_url → imageUrl → firstFrameUrl → lastFrameUrl → referenceImages[0] 顺序取第一个非空", () => {
    expect(firstReferenceImage({ extras: { firstFrameUrl: "f.png" } })).toBe("f.png");
    expect(firstReferenceImage({ extras: { referenceImages: ["r.png"] } })).toBe("r.png");
    expect(firstReferenceImage({ extras: {} })).toBe("");
  });
});
