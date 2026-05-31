import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { logCostEntry, summarizeProjectCost } from "./costLog";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeTempDir(name = "nomi-cost-log-test-"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), name));
  tempRoots.push(dir);
  return dir;
}

describe("workspace project cost logs", () => {
  it("writes and summarizes cost logs using an explicit projectDir outside projectsRoot", () => {
    const projectsRoot = makeTempDir("nomi-cost-default-root-");
    const workspaceRoot = makeTempDir("nomi-cost-workspace-root-");

    const entry = logCostEntry({
      projectsRoot,
      projectDir: workspaceRoot,
      projectId: "workspace-id",
      provider: "local",
      model: "flux-pro",
      kind: "image",
    });
    const summary = summarizeProjectCost(projectsRoot, "workspace-id", workspaceRoot);

    expect(entry?.cost).toBe(0.055);
    expect(fs.existsSync(path.join(workspaceRoot, "logs", "cost-log.jsonl"))).toBe(true);
    expect(summary).toMatchObject({ total: 0.055, count: 1, byProvider: { local: 0.055 }, byKind: { image: 0.055 } });
  });
});
