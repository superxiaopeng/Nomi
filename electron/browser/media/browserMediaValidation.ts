import fs from "node:fs";

export const BROWSER_MEDIA_MAX_BYTES = 200 * 1024 * 1024;

export function mediaTypeFromContentType(contentType: string): "image" | "video" | null {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  return null;
}

function sniffBrowserMediaContentType(bytes: Uint8Array): string | null {
  const startsWith = (...values: number[]): boolean => values.every((value, index) => bytes[index] === value);
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (Buffer.from(bytes.subarray(0, 6)).toString("ascii") === "GIF87a" || Buffer.from(bytes.subarray(0, 6)).toString("ascii") === "GIF89a") {
    return "image/gif";
  }
  if (Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  if (Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "AVI ") {
    return "video/x-msvideo";
  }
  if (startsWith(0x42, 0x4d)) return "image/bmp";
  if (startsWith(0x00, 0x00, 0x01, 0x00)) return "image/x-icon";
  if (startsWith(0x49, 0x49, 0x2a, 0x00) || startsWith(0x4d, 0x4d, 0x00, 0x2a)) return "image/tiff";
  if (startsWith(0x1a, 0x45, 0xdf, 0xa3)) return "video/webm";
  if (Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "OggS") return "video/ogg";
  if (startsWith(0x00, 0x00, 0x01, 0xba) || startsWith(0x00, 0x00, 0x01, 0xb3)) return "video/mpeg";
  const fileTypeBrand = Buffer.from(bytes.subarray(4, 12)).toString("ascii");
  if (/^ftyp(?:avif|avis)/.test(fileTypeBrand)) return "image/avif";
  if (/^ftyp(?:heic|heix|hevc|hevx|mif1|msf1)/.test(fileTypeBrand)) return "image/heic";
  if (/^ftypqt\s*/i.test(fileTypeBrand)) return "video/quicktime";
  if (/^ftypm4v/i.test(fileTypeBrand)) return "video/x-m4v";
  if (fileTypeBrand.startsWith("ftyp")) return "video/mp4";
  const textPrefix = Buffer.from(bytes).toString("utf8").replace(/^\uFEFF/, "").trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(textPrefix)) return "image/svg+xml";
  return null;
}

export function resolveBrowserMediaContentType(
  reportedContentType: string,
  requestedMediaType: "image" | "video" | null,
  bytes: Uint8Array,
): { contentType: string; mediaType: "image" | "video" } {
  const reported = String(reportedContentType || "").split(";")[0]?.trim().toLowerCase() || "";
  const reportedMediaType = mediaTypeFromContentType(reported);
  const sniffed = sniffBrowserMediaContentType(bytes);
  const sniffedMediaType = sniffed ? mediaTypeFromContentType(sniffed) : null;
  if (reportedMediaType) {
    if (requestedMediaType && reportedMediaType !== requestedMediaType) {
      throw new Error(`网页返回的媒体类型不匹配（${reported}）`);
    }
    if (!sniffed || !sniffedMediaType || sniffedMediaType !== reportedMediaType) {
      throw new Error(`网页响应头声称是媒体，但内容无法识别（${reported}）`);
    }
    // 同属图片/视频时以魔数为准，避免 `image/jpeg` + PNG 正文被落成错误扩展。
    return { contentType: sniffed, mediaType: sniffedMediaType };
  }
  if (reported && reported !== "application/octet-stream") {
    throw new Error(`网页返回的不是图片或视频（${reported}）`);
  }
  if (!sniffed || !sniffedMediaType || (requestedMediaType && sniffedMediaType !== requestedMediaType)) {
    throw new Error("网页返回的不是可识别的图片或视频");
  }
  return { contentType: sniffed, mediaType: sniffedMediaType };
}

export async function streamBrowserMediaResponseToFile(
  response: Response,
  savePath: string,
  maxBytes = BROWSER_MEDIA_MAX_BYTES,
): Promise<Buffer> {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error("Media is too large to import");
  }
  if (!response.body) throw new Error("Downloaded media file is empty");
  const reader = response.body.getReader();
  const file = await fs.promises.open(savePath, "wx");
  const header = Buffer.alloc(4096);
  let headerBytes = 0;
  let totalBytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = Buffer.from(next.value);
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("media too large").catch(() => undefined);
        throw new Error("Media is too large to import");
      }
      if (headerBytes < header.byteLength) {
        const copyBytes = Math.min(chunk.byteLength, header.byteLength - headerBytes);
        chunk.copy(header, headerBytes, 0, copyBytes);
        headerBytes += copyBytes;
      }
      let offset = 0;
      while (offset < chunk.byteLength) {
        const result = await file.write(chunk, offset, chunk.byteLength - offset, null);
        if (result.bytesWritten <= 0) throw new Error("Media download could not be written");
        offset += result.bytesWritten;
      }
    }
  } finally {
    await file.close();
  }
  if (totalBytes <= 0) throw new Error("Downloaded media file is empty");
  return header.subarray(0, headerBytes);
}
