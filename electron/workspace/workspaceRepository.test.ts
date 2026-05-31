import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWorkspaceProject,
  listWorkspaceProjects,
  readWorkspaceProject,
  removeWorkspaceProjectReference,
  resolveWorkspaceProjectDir,
  saveWorkspaceProject,
  type WorkspaceRepositoryDeps,
} from "./workspaceRepository";
import { workspaceProjectFile } from "./workspacePaths";
import { recentWorkspacesPath } from "./workspaceRegistry";

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

function makeTempDir(name = "nomi-workspace-repository-test-"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), name));
  tempRoots.push(dir);
  return dir;
}

function deps(): WorkspaceRepositoryDeps {
  return {
    settingsRoot: makeTempDir("nomi-workspace-repository-settings-"),
    defaultProjectsRoot: makeTempDir("nomi-workspace-repository-default-projects-"),
  };
}

describe("workspace repository", () => {
  it("creates a project in the selected root path", () => {
    const selectedRoot = makeTempDir();
    const repoDeps = deps();

    const created = createWorkspaceProject(
      { rootPath: selectedRoot, record: { name: "Selected Folder Project", payload: { scenes: [] } } },
      repoDeps,
    );

    expect(created).toMatchObject({
      name: "Selected Folder Project",
      version: 2,
      payload: { scenes: [] },
      lastKnownRootPath: path.resolve(selectedRoot),
    });
    expect(fs.existsSync(workspaceProjectFile(selectedRoot))).toBe(true);
    expect(fs.existsSync(path.join(repoDeps.defaultProjectsRoot, created.id))).toBe(false);
    expect(listWorkspaceProjects(repoDeps)[0]).toMatchObject({
      id: created.id,
      rootPath: path.resolve(selectedRoot),
      missing: false,
    });
  });

  it("reads a project by id through the recent registry", () => {
    const selectedRoot = makeTempDir();
    const repoDeps = deps();
    const created = createWorkspaceProject(
      { rootPath: selectedRoot, record: { name: "Read Me", payload: { script: "hello" } } },
      repoDeps,
    );

    const read = readWorkspaceProject(created.id, repoDeps);

    expect(read).toEqual(created);
  });

  it("saves payload into .nomi/project.json", () => {
    const selectedRoot = makeTempDir();
    const repoDeps = deps();
    const created = createWorkspaceProject(
      { rootPath: selectedRoot, record: { name: "Save Me", payload: { draft: 1 } } },
      repoDeps,
    );
    vi.setSystemTime(new Date("2026-05-31T12:30:00Z"));

    const saved = saveWorkspaceProject(created.id, { name: "Saved Name", payload: { draft: 2 } }, repoDeps);
    const raw = JSON.parse(fs.readFileSync(workspaceProjectFile(selectedRoot), "utf8"));

    expect(saved).toMatchObject({
      id: created.id,
      name: "Saved Name",
      createdAt: created.createdAt,
      updatedAt: Date.parse("2026-05-31T12:30:00Z"),
      savedAt: Date.parse("2026-05-31T12:30:00Z"),
      revision: created.revision + 1,
      payload: { draft: 2 },
    });
    expect(raw.payload).toEqual({ draft: 2 });
  });

  it("removes a project reference without deleting rootPath", () => {
    const selectedRoot = makeTempDir();
    const repoDeps = deps();
    const created = createWorkspaceProject(
      { rootPath: selectedRoot, record: { name: "Remove Reference", payload: {} } },
      repoDeps,
    );

    const result = removeWorkspaceProjectReference(created.id, repoDeps);

    expect(result).toEqual({ id: created.id, deleted: false });
    expect(readWorkspaceProject(created.id, repoDeps)).toBeNull();
    expect(fs.existsSync(workspaceProjectFile(selectedRoot))).toBe(true);
  });

  it("returns missing=true when the folder no longer exists", () => {
    const selectedRoot = makeTempDir();
    const repoDeps = deps();
    const created = createWorkspaceProject(
      { rootPath: selectedRoot, record: { name: "Missing Folder", payload: {} } },
      repoDeps,
    );
    fs.rmSync(selectedRoot, { recursive: true, force: true });

    expect(listWorkspaceProjects(repoDeps)).toEqual([
      expect.objectContaining({ id: created.id, name: "Missing Folder", missing: true, rootPath: path.resolve(selectedRoot) }),
    ]);
    expect(readWorkspaceProject(created.id, repoDeps)).toBeNull();
    expect(resolveWorkspaceProjectDir(created.id, repoDeps)).toBeNull();
  });

  it("returns null for stale registry entries whose manifest id does not match", () => {
    const staleRoot = makeTempDir();
    const actualRoot = makeTempDir();
    const repoDeps = deps();
    const stale = createWorkspaceProject(
      { rootPath: staleRoot, record: { name: "Stale", payload: {} } },
      repoDeps,
    );
    const actual = createWorkspaceProject(
      { rootPath: actualRoot, record: { name: "Actual", payload: {} } },
      repoDeps,
    );
    const registry = JSON.parse(fs.readFileSync(recentWorkspacesPath(repoDeps.settingsRoot), "utf8"));
    fs.writeFileSync(
      recentWorkspacesPath(repoDeps.settingsRoot),
      JSON.stringify(
        registry.map((entry: { id: string; rootPath: string }) =>
          entry.id === stale.id ? { ...entry, rootPath: path.resolve(actualRoot) } : entry,
        ),
        null,
        2,
      ),
    );

    expect(readWorkspaceProject(stale.id, repoDeps)).toBeNull();
    expect(resolveWorkspaceProjectDir(stale.id, repoDeps)).toBeNull();
    expect(resolveWorkspaceProjectDir(actual.id, repoDeps)).toBe(path.resolve(actualRoot));
  });
});
