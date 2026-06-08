// nomi-local 素材的文件侧读取 + 上传通道(从 runtime.ts 抽出 —— 规则 12 巨壳净减)。
// R1 用:把本地素材(nomi-local://)读成字节,或 POST 到 vendor 上传端点。
import fs from "node:fs";
import { resolveProjectRelativePath } from "../projects/repository";
import { contentTypeFromPath } from "./assetPaths";
import type { LocalAsset } from "../catalog/assetLocalization";

/** nomi-local URL → 项目内文件绝对路径(校验 projectId 一致 + 是真实文件);否则 null。 */
export function absolutePathFromLocalAssetUrl(url: unknown, projectId: string): string | null {
  if (typeof url !== "string") return null;
  const prefix = "nomi-local://asset/";
  if (!url.startsWith(prefix)) return null;
  const rest = url.slice(prefix.length);
  const slashIndex = rest.indexOf("/");
  if (slashIndex < 0) return null;
  let urlProjectId: string;
  let relativePath: string;
  try {
    urlProjectId = decodeURIComponent(rest.slice(0, slashIndex));
    relativePath = rest.slice(slashIndex + 1).split("/").map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
  if (urlProjectId !== projectId || !relativePath) return null;
  try {
    const absolutePath = resolveProjectRelativePath(projectId, relativePath);
    return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile() ? absolutePath : null;
  } catch {
    return null;
  }
}

/** R1：把 nomi-local URL(自带 projectId)读成字节 + contentType + 文件名,供 assetLocalization 上传/内联。 */
export function readNomiLocalAsset(url: string): LocalAsset | null {
  const prefix = "nomi-local://asset/";
  if (typeof url !== "string" || !url.startsWith(prefix)) return null;
  const rest = url.slice(prefix.length);
  const slashIndex = rest.indexOf("/");
  if (slashIndex < 0) return null;
  let projectId: string;
  let relativePath: string;
  try {
    projectId = decodeURIComponent(rest.slice(0, slashIndex));
    relativePath = rest.slice(slashIndex + 1).split("/").map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
  const absolutePath = absolutePathFromLocalAssetUrl(url, projectId);
  if (!absolutePath) return null;
  try {
    return {
      bytes: fs.readFileSync(absolutePath),
      contentType: contentTypeFromPath(absolutePath),
      fileName: relativePath.split("/").pop() || "asset",
    };
  } catch {
    return null;
  }
}

/** R1 上传通道:固定可信端点(vendor 声明里),用普通 fetch(与 requestJson 一致)。 */
export async function postJsonForAssetUpload(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!response.ok) {
    const record = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
    const detail = [record.msg, record.message, record.error].find((value) => typeof value === "string" && value) || "";
    throw new Error(`素材上传失败(HTTP ${response.status})：${detail || "(无详情)"}`);
  }
  return json;
}
