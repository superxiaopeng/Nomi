import { describe, it, expect } from "vitest";
import { buildAgentModelEntries, formatAvailableModelsForPrompt } from "./availableModels";
import type { ModelOption } from "../../../config/models";

// 用 meta.archetypeId 显式命中内置档案（resolveArchetypeForModel 优先看 archetypeId）。
function opt(over: Partial<ModelOption>): ModelOption {
  return { value: "v", label: "L", ...over };
}

describe("buildAgentModelEntries", () => {
  it("命中档案的模型 join 出 modes + params", () => {
    const entries = buildAgentModelEntries([
      opt({ value: "seedance-2", label: "即梦 Seedance", vendor: "kie", meta: { archetypeId: "seedance-2" } }),
    ]);
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.modelKey).toBe("seedance-2");
    expect(e.kind).toBe("video");
    expect(e.archetypeId).toBe("seedance-2");
    expect(e.modes.length).toBeGreaterThan(0);
    // 每个 mode 带 vendorTerm（真名）+ params schema
    expect(e.modes[0].vendorTerm).toBeTruthy();
    expect(Array.isArray(e.modes[0].params)).toBe(true);
    // seedance 默认模式有 aspect_ratio 参数（计划卡比例 chip 的来源）
    const allParamKeys = e.modes.flatMap((m) => m.params.map((p) => p.key));
    expect(allParamKeys).toContain("aspect_ratio");
  });

  it("无档案的模型被跳过", () => {
    const entries = buildAgentModelEntries([
      opt({ value: "some-unknown-model-xyz", label: "未知", vendor: "x" }),
    ]);
    expect(entries).toHaveLength(0);
  });

  it("同一 modelKey 去重（image/video 两边重复）", () => {
    const entries = buildAgentModelEntries([
      opt({ value: "seedance-2", modelKey: "seedance-2", meta: { archetypeId: "seedance-2" } }),
      opt({ value: "seedance-2", modelKey: "seedance-2", meta: { archetypeId: "seedance-2" } }),
    ]);
    expect(entries).toHaveLength(1);
  });

  it("空输入返回空", () => {
    expect(buildAgentModelEntries([])).toEqual([]);
  });
});

describe("formatAvailableModelsForPrompt", () => {
  it("空清单返回空串（不注入）", () => {
    expect(formatAvailableModelsForPrompt([])).toBe("");
  });

  it("列出 modelKey + 模式 + 参数选项", () => {
    const entries = buildAgentModelEntries([
      opt({ value: "seedance-2", label: "即梦 Seedance", meta: { archetypeId: "seedance-2" } }),
    ]);
    const text = formatAvailableModelsForPrompt(entries);
    expect(text).toContain("modelKey=seedance-2");
    expect(text).toContain("aspect_ratio[");
    expect(text).toContain("9:16");
  });
});
