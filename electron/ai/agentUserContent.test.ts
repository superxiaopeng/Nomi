import { describe, expect, it } from "vitest";
import { buildAgentUserContent, modelSupportsImageInput, type ResolvedImage } from "./agentUserContent";

const img = (): ResolvedImage => ({ data: new Uint8Array([1, 2, 3]), mimeType: "image/png" });

describe("modelSupportsImageInput", () => {
  it("honors explicit meta.supportsImageInput", () => {
    expect(modelSupportsImageInput("whatever", null, { supportsImageInput: true })).toBe(true);
    expect(modelSupportsImageInput("gpt-4o", null, { supportsImageInput: false })).toBe(false);
  });
  it("detects known vision families by name", () => {
    expect(modelSupportsImageInput("gpt-4o", null, undefined)).toBe(true);
    expect(modelSupportsImageInput("claude-3-5-sonnet", null, undefined)).toBe(true);
    expect(modelSupportsImageInput("gemini-2.0-flash", null, undefined)).toBe(true);
  });
  it("returns false for plain text models", () => {
    expect(modelSupportsImageInput("deepseek-chat", null, undefined)).toBe(false);
    expect(modelSupportsImageInput("moonshot-v1-8k", null, undefined)).toBe(false);
  });
});

describe("buildAgentUserContent", () => {
  it("returns plain string when no attachments", () => {
    expect(buildAgentUserContent({ prompt: "hi", supportsImageInput: true, resolveImage: img })).toBe("hi");
  });

  it("builds text + image parts when model supports image", () => {
    const content = buildAgentUserContent({
      prompt: "看这张图",
      attachments: [{ url: "nomi-local://asset/p/a.png", contentType: "image/png", fileName: "a.png", kind: "image" }],
      supportsImageInput: true,
      resolveImage: img,
    });
    expect(Array.isArray(content)).toBe(true);
    const parts = content as Array<{ type: string }>;
    expect(parts[0]).toMatchObject({ type: "text", text: "看这张图" });
    expect(parts[1]).toMatchObject({ type: "image", mimeType: "image/png" });
  });

  it("drops images + notes when model lacks image support", () => {
    const content = buildAgentUserContent({
      prompt: "看这张图",
      attachments: [{ url: "u", contentType: "image/png", fileName: "a.png", kind: "image" }],
      supportsImageInput: false,
      resolveImage: img,
    });
    expect(typeof content).toBe("string");
    expect(content as string).toContain("不支持图片输入");
  });

  it("drops images when resolveImage returns null", () => {
    const content = buildAgentUserContent({
      prompt: "p",
      attachments: [{ url: "missing", contentType: "image/png", fileName: "a.png", kind: "image" }],
      supportsImageInput: true,
      resolveImage: () => null,
    });
    expect(typeof content).toBe("string");
    expect(content as string).toContain("读取失败");
  });

  it("notes non-image files (not yet inlined)", () => {
    const content = buildAgentUserContent({
      prompt: "读这个",
      attachments: [{ url: "u", contentType: "application/pdf", fileName: "a.pdf", kind: "file" }],
      supportsImageInput: true,
      resolveImage: img,
    });
    expect(typeof content).toBe("string");
    expect(content as string).toContain("尚未读取");
  });
});
