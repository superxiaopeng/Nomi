import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverLegacyProjects, migrateLegacyProjectFolder } from "./legacyProjectMigration";
import { workspaceProjectFile } from "./workspacePaths";

const tempRoots: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-31T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeTempDir(name = "nomi-legacy-migration-test-"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), name));
  tempRoots.push(dir);
  return dir;
}

function writeLegacyProject(projectRoot: string, overrides: Record<string, unknown> = {}): void {
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, "project.json"),
    JSON.stringify(
      {
        id: "legacy-id",
        name: "Legacy Project",
        version: 1,
        createdAt: 100,
        updatedAt: 200,
        savedAt: 300,
        revision: 2,
        payload: { old: true },
        ...overrides,
      },
      null,
      2,
    ),
  );
}

describe("migrateLegacyProjectFolder", () => {
  it("migrates legacy project.json into .nomi/project.json", () => {
    const projectRoot = makeTempDir();
    writeLegacyProject(projectRoot);

    const migrated = migrateLegacyProjectFolder(projectRoot);
    const raw = JSON.parse(fs.readFileSync(workspaceProjectFile(projectRoot), "utf8"));

    expect(migrated).toMatchObject({
      id: "legacy-id",
      name: "Legacy Project",
      version: 2,
      createdAt: 100,
      updatedAt: 200,
      savedAt: 300,
      revision: 2,
      payload: { old: true },
      lastKnownRootPath: path.resolve(projectRoot),
    });
    expect(raw.rootPath).toBeUndefined();
    expect(fs.existsSync(path.join(projectRoot, "project.json"))).toBe(true);
  });

  it("does not duplicate already migrated projects", () => {
    const projectRoot = makeTempDir();
    writeLegacyProject(projectRoot, { id: "legacy-id" });
    const first = migrateLegacyProjectFolder(projectRoot);
    fs.writeFileSync(path.join(projectRoot, "project.json"), JSON.stringify({ id: "changed", name: "Changed", version: 1 }));

    const second = migrateLegacyProjectFolder(projectRoot);

    expect(second).toEqual(first);
    expect(JSON.parse(fs.readFileSync(workspaceProjectFile(projectRoot), "utf8")).id).toBe("legacy-id");
  });

  it("keeps existing assets and exports directories", () => {
    const projectRoot = makeTempDir();
    writeLegacyProject(projectRoot);
    fs.mkdirSync(path.join(projectRoot, "assets", "custom"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "assets", "custom", "ref.png"), "png");
    fs.mkdirSync(path.join(projectRoot, "exports"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "exports", "old.mp4"), "mp4");

    migrateLegacyProjectFolder(projectRoot);

    expect(fs.existsSync(path.join(projectRoot, "assets", "custom", "ref.png"))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, "exports", "old.mp4"))).toBe(true);
  });
});

describe("discoverLegacyProjects", () => {
  it("migrates direct child legacy projects and skips non-project folders", () => {
    const defaultRoot = makeTempDir();
    writeLegacyProject(path.join(defaultRoot, "Old Project"), { id: "old-project" });
    fs.mkdirSync(path.join(defaultRoot, "Not Project"));

    const projects = discoverLegacyProjects(defaultRoot);

    expect(projects.map((project) => project.id)).toEqual(["old-project"]);
    expect(fs.existsSync(workspaceProjectFile(path.join(defaultRoot, "Old Project")))).toBe(true);
  });

  it("skips malformed legacy project files instead of failing the whole discovery", () => {
    const defaultRoot = makeTempDir();
    writeLegacyProject(path.join(defaultRoot, "Good Project"), { id: "good-project" });
    fs.mkdirSync(path.join(defaultRoot, "Broken Project"), { recursive: true });
    fs.writeFileSync(path.join(defaultRoot, "Broken Project", "project.json"), "{bad json");

    const projects = discoverLegacyProjects(defaultRoot);

    expect(projects.map((project) => project.id)).toEqual(["good-project"]);
  });
});
