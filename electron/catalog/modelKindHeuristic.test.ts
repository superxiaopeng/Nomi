import { describe, it, expect } from "vitest";
import { guessModelKind } from "./modelKindHeuristic";

describe("guessModelKind", () => {
  it("视频族 id → video", () => {
    for (const id of ["kling-v1", "sora-2", "veo3.1-fast", "cogvideox", "MiniMax-Hailuo-2.3", "wan2.2", "runway-gen3", "luma-ray-2", "pika-2.0", "vidu-q1"]) {
      expect(guessModelKind(id)).toBe("video");
    }
  });

  it("图片族 id → image", () => {
    for (const id of ["dall-e-3", "gpt-image-1", "flux-1.1-pro", "midjourney", "sdxl", "seedream-3", "nano-banana", "qwen-image-2.0", "imagen-4", "ideogram-v2", "z-image-turbo"]) {
      expect(guessModelKind(id)).toBe("image");
    }
  });

  it("对话/未知 id → text（最安全默认）", () => {
    for (const id of ["gpt-4o", "deepseek-chat", "claude-opus-4-8", "moonshot-v1-128k", "qwen-max", "some-unknown-model"]) {
      expect(guessModelKind(id)).toBe("text");
    }
  });

  it("大小写无关 + 空串兜底", () => {
    expect(guessModelKind("FLUX-1-PRO")).toBe("image");
    expect(guessModelKind("Kling-V1")).toBe("video");
    expect(guessModelKind("")).toBe("text");
    expect(guessModelKind("   ")).toBe("text");
  });

  it("视频优先于图片（id 同时含两类词根时不误判成图片）", () => {
    // jimeng 既有图片(jimeng)又有视频(jimeng-video)；带 video 词根的判 video。
    expect(guessModelKind("jimeng-video-3.0")).toBe("video");
    expect(guessModelKind("jimeng-3.0")).toBe("image");
  });
});
