import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Atomically (over)write a JSON file.
 *
 * Serialize to a temp file in the SAME directory (so the final rename stays on
 * one filesystem and is atomic on POSIX), fsync it for durability, then rename
 * over the target. On a crash / power loss the target is always either the
 * previous complete file or the new complete file — never a truncated, corrupt
 * one. This protects the user's most valuable data (`project.json`) from the
 * "saved while crashing → lost the whole project" failure mode.
 *
 * Mirrors the temp+rename pattern already used by the model catalog writer in
 * runtime.ts; that copy lives inside a 3150-line module and is left to the
 * planned runtime.ts split — new call sites should use this shared util.
 */
export function writeJsonFileAtomic(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${crypto.randomUUID()}.tmp`);
  const fd = fs.openSync(tempPath, "w");
  try {
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      // best-effort cleanup; surface the original rename error below
    }
    throw error;
  }
}

export function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
