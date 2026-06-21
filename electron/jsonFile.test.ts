import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readJsonFile, writeJsonFileAtomic } from "./jsonFile";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-json-file-test-"));
  tempRoots.push(dir);
  return dir;
}

describe("writeJsonFileAtomic", () => {
  it("writes pretty JSON with a trailing newline that reads back equal", () => {
    const dir = makeTempDir();
    const file = path.join(dir, "project.json");
    const value = { id: "p1", name: "My Film", revision: 4 };

    writeJsonFileAtomic(file, value);

    expect(readJsonFile(file)).toEqual(value);
    expect(fs.readFileSync(file, "utf8")).toBe(`${JSON.stringify(value, null, 2)}\n`);
  });

  it("creates missing parent directories", () => {
    const dir = makeTempDir();
    const file = path.join(dir, "nested", "deep", "project.json");

    writeJsonFileAtomic(file, { ok: true });

    expect(readJsonFile(file)).toEqual({ ok: true });
  });

  it("overwrites an existing file in place", () => {
    const dir = makeTempDir();
    const file = path.join(dir, "project.json");

    writeJsonFileAtomic(file, { revision: 1 });
    writeJsonFileAtomic(file, { revision: 2 });

    expect(readJsonFile(file)).toEqual({ revision: 2 });
  });

  it("leaves no temp files behind after a successful write", () => {
    const dir = makeTempDir();
    const file = path.join(dir, "project.json");

    writeJsonFileAtomic(file, { a: 1 });
    writeJsonFileAtomic(file, { a: 2 });

    const leftovers = fs.readdirSync(dir).filter((name) => name.endsWith(".tmp"));
    expect(leftovers).toEqual([]);
    expect(fs.readdirSync(dir)).toEqual(["project.json"]);
  });
});
