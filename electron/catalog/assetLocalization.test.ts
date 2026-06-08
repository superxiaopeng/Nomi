import { describe, it, expect, vi } from "vitest";
import {
  collectLocalAssetUrls,
  replaceLocalAssetUrls,
  resolveLocalAsset,
  localizeAssetsForVendor,
  resolveAssetIngestion,
  isLocalAssetUrl,
  type LocalAsset,
} from "./assetLocalization";
import type { AssetIngestion } from "./types";

const localUrl = (p: string) => `nomi-local://asset/proj/${p}`;
const fakeAsset = (name: string): LocalAsset => ({ bytes: Buffer.from("hello-" + name), contentType: "image/png", fileName: name });
const read = (url: string): LocalAsset | null => fakeAsset(url.split("/").pop() || "x");

describe("isLocalAssetUrl / collect / replace", () => {
  it("detects nomi-local urls only", () => {
    expect(isLocalAssetUrl(localUrl("a.png"))).toBe(true);
    expect(isLocalAssetUrl("https://x/a.png")).toBe(false);
    expect(isLocalAssetUrl(42)).toBe(false);
  });

  it("collects nested + array, deduped", () => {
    const extras = {
      firstFrameUrl: localUrl("a.png"),
      referenceImageUrls: [localUrl("b.png"), "https://pub/c.png", localUrl("a.png")],
      prompt: "no url here",
    };
    expect(Array.from(collectLocalAssetUrls(extras)).sort()).toEqual([localUrl("a.png"), localUrl("b.png")].sort());
  });

  it("replaces recursively, leaving non-local untouched", () => {
    const map = new Map([[localUrl("a.png"), "https://pub/a.png"]]);
    const out = replaceLocalAssetUrls({ x: localUrl("a.png"), y: ["https://pub/c.png", localUrl("a.png")] }, map);
    expect(out).toEqual({ x: "https://pub/a.png", y: ["https://pub/c.png", "https://pub/a.png"] });
  });
});

describe("resolveLocalAsset (per strategy)", () => {
  const noPost = vi.fn();

  it("inline-base64 returns a data URI without uploading", async () => {
    const out = await resolveLocalAsset(localUrl("a.png"), { strategy: "inline-base64" }, "k", read, noPost);
    expect(out.startsWith("data:image/png;base64,")).toBe(true);
    expect(noPost).not.toHaveBeenCalled();
  });

  it("none throws a clear error", async () => {
    await expect(resolveLocalAsset(localUrl("a.png"), { strategy: "none" }, "k", read, noPost)).rejects.toThrow(/不支持本地素材/);
  });

  it("upload-url posts base64 and reads the declared url path", async () => {
    const ingestion: AssetIngestion = {
      strategy: "upload-url",
      endpoint: "https://up/x",
      base64Field: "base64Data",
      uploadPathField: "uploadPath",
      uploadPath: "images/nomi",
      fileNameField: "fileName",
      urlPath: "data.downloadUrl",
    };
    const post = vi.fn().mockResolvedValue({ code: 200, data: { downloadUrl: "https://pub/a.png" } });
    const out = await resolveLocalAsset(localUrl("a.png"), ingestion, "key123", read, post);
    expect(out).toBe("https://pub/a.png");
    const [url, headers, body] = post.mock.calls[0];
    expect(url).toBe("https://up/x");
    expect(headers.Authorization).toBe("Bearer key123");
    expect((body as Record<string, unknown>).base64Field === undefined).toBe(true);
    expect(String((body as Record<string, string>).base64Data).startsWith("data:image/png;base64,")).toBe(true);
    expect((body as Record<string, string>).uploadPath).toBe("images/nomi");
    expect((body as Record<string, string>).fileName).toBe("a.png");
  });

  it("upload-url with dataUrlPrefix:false sends pure base64", async () => {
    const ingestion: AssetIngestion = { strategy: "upload-url", endpoint: "https://up/x", base64Field: "b64", dataUrlPrefix: false, urlPath: "url" };
    const post = vi.fn().mockResolvedValue({ url: "https://pub/a.png" });
    await resolveLocalAsset(localUrl("a.png"), ingestion, "k", read, post);
    expect(String((post.mock.calls[0][2] as Record<string, string>).b64).startsWith("data:")).toBe(false);
  });

  it("upload-url throws when response lacks the url path", async () => {
    const ingestion: AssetIngestion = { strategy: "upload-url", endpoint: "https://up/x", base64Field: "b", urlPath: "data.downloadUrl" };
    const post = vi.fn().mockResolvedValue({ code: 500, msg: "boom" });
    await expect(resolveLocalAsset(localUrl("a.png"), ingestion, "k", read, post)).rejects.toThrow(/缺少可达 URL/);
  });
});

describe("localizeAssetsForVendor", () => {
  const ingestion: AssetIngestion = { strategy: "upload-url", endpoint: "https://up/x", base64Field: "b", urlPath: "url" };

  it("uploads each unique url once and replaces all occurrences", async () => {
    const post = vi.fn().mockImplementation((_u, _h, body: Record<string, string>) => {
      // echo a stable url derived from the base64 so dupes map identically
      return Promise.resolve({ url: "https://pub/" + body.b.slice(-6) });
    });
    const extras = {
      firstFrameUrl: localUrl("a.png"),
      referenceImageUrls: [localUrl("b.png"), localUrl("a.png")],
    };
    const out = await localizeAssetsForVendor(extras, ingestion, "k", read, post);
    expect(out.uploaded).toBe(2); // a.png + b.png, a.png not uploaded twice
    expect(post).toHaveBeenCalledTimes(2);
    const value = out.value as typeof extras;
    expect(value.firstFrameUrl).toBe(value.referenceImageUrls[1]); // same source → same resolved url
    expect(value.referenceImageUrls[0].startsWith("https://pub/")).toBe(true);
  });

  it("is a zero-cost passthrough when there are no local assets", async () => {
    const post = vi.fn();
    const extras = { firstFrameUrl: "https://pub/a.png", prompt: "hi" };
    const out = await localizeAssetsForVendor(extras, ingestion, "k", read, post);
    expect(out.uploaded).toBe(0);
    expect(out.value).toBe(extras);
    expect(post).not.toHaveBeenCalled();
  });
});

describe("resolveAssetIngestion", () => {
  it("prefers the vendor's own declaration", () => {
    const own: AssetIngestion = { strategy: "inline-base64" };
    expect(resolveAssetIngestion({ key: "kie", assetIngestion: own })).toBe(own);
  });

  it("falls back to the curated registry for kie", () => {
    expect(resolveAssetIngestion({ key: "kie" })?.strategy).toBe("upload-url");
  });

  it("returns null for unknown vendors with no declaration", () => {
    expect(resolveAssetIngestion({ key: "mystery" })).toBeNull();
    expect(resolveAssetIngestion(null)).toBeNull();
  });
});
