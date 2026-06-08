import { describe, it, expect } from "vitest";
import { selectTaskMapping, type Mapping } from "./types";

// 路由根因回归：同 (vendor, taskKind) 下两个模型请求形状不同时，靠 modelKey 精确路由，
// 不再「第一个 enabled 赢、另一个模型静默套错模板」（实测：HappyHorse 撞 Kling 的 text_to_video）。

function mp(id: string, over: Partial<Mapping> = {}): Mapping {
  return {
    id, vendorKey: "kie", taskKind: "text_to_video", name: id, enabled: true,
    create: { method: "POST", path: "/x", headers: {}, body: { tag: id } },
    createdAt: "t", updatedAt: "t", ...over,
  } as Mapping;
}

describe("selectTaskMapping — 优先级：精确 modelKey > generic > 任意", () => {
  const kling = mp("kling", {}); // generic（无 modelKey）
  const happy = mp("happy", { modelKey: "happyhorse" }); // 绑 HappyHorse
  const all = [kling, happy];

  it("传 happyhorse → 命中 HappyHorse 自己的 mapping（不被 Kling 抢）", () => {
    expect(selectTaskMapping(all, "kie", "text_to_video", "happyhorse")?.id).toBe("happy");
  });
  it("传别的/不传 modelKey → 落 generic（Kling）", () => {
    expect(selectTaskMapping(all, "kie", "text_to_video", "kling-2")?.id).toBe("kling");
    expect(selectTaskMapping(all, "kie", "text_to_video")?.id).toBe("kling");
  });
  it("只有 generic 时，任何 modelKey 都落它（向后兼容老数据：Seedance 无 modelKey 仍可用）", () => {
    expect(selectTaskMapping([kling], "kie", "text_to_video", "anything")?.id).toBe("kling");
  });
  it("没有 generic、只有别的模型绑定 → 兜底返回桶内任意 enabled（不至于 null）", () => {
    expect(selectTaskMapping([happy], "kie", "text_to_video", "other")?.id).toBe("happy");
  });
  it("禁用的不选；空桶返回 null", () => {
    expect(selectTaskMapping([mp("off", { enabled: false })], "kie", "text_to_video")).toBeNull();
    expect(selectTaskMapping([], "kie", "text_to_video")).toBeNull();
  });
});
