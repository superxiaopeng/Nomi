import fs from "node:fs";
import path from "node:path";
import { initializeWorkspace, readWorkspaceManifest, writeWorkspaceManifest } from "./workspaceManifest";
import { listRecentWorkspaces, rememberWorkspace, removeWorkspaceReference } from "./workspaceRegistry";
import { normalizeWorkspaceProjectRecord, type WorkspaceProjectRecordV2 } from "./workspaceTypes";

export type WorkspaceRepositoryDeps = {
  settingsRoot: string;
  defaultProjectsRoot: string;
};

export type WorkspaceProjectSummary = Omit<WorkspaceProjectRecordV2, "payload"> & {
  rootPath: string;
  missing: boolean;
};

type RecordInput = {
  id?: unknown;
  name?: unknown;
  payload?: unknown;
};

function asRecordInput(input: unknown): RecordInput {
  return input && typeof input === "object" ? (input as RecordInput) : { payload: input };
}

function inputName(input: unknown, fallback?: string): string | undefined {
  const value = asRecordInput(input).name;
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function inputPayload(input: unknown): unknown {
  const objectInput = asRecordInput(input);
  return Object.prototype.hasOwnProperty.call(objectInput, "payload") ? objectInput.payload : input;
}

function withoutPayload(record: WorkspaceProjectRecordV2, rootPath: string, missing: boolean): WorkspaceProjectSummary {
  const { payload: _payload, ...summary } = record;
  return {
    ...summary,
    rootPath,
    missing,
  };
}

function findRecentEntry(projectId: string, deps: WorkspaceRepositoryDeps) {
  return listRecentWorkspaces(deps.settingsRoot).find((entry) => entry.id === projectId) ?? null;
}

export function createWorkspaceProject(
  input: { rootPath: string; record: unknown },
  deps: WorkspaceRepositoryDeps,
): WorkspaceProjectRecordV2 {
  void deps.defaultProjectsRoot;
  const rootPath = path.resolve(input.rootPath);
  const raw = asRecordInput(input.record);
  const initialized = initializeWorkspace(rootPath, {
    name: inputName(raw),
    payload: inputPayload(input.record),
  });
  const record = normalizeWorkspaceProjectRecord({
    ...initialized,
    lastKnownRootPath: rootPath,
  });
  writeWorkspaceManifest(rootPath, record);
  rememberWorkspace(deps.settingsRoot, record);
  return record;
}

export function listWorkspaceProjects(deps: WorkspaceRepositoryDeps): WorkspaceProjectSummary[] {
  return listRecentWorkspaces(deps.settingsRoot).map((entry) => {
    if (entry.missing) {
      return withoutPayload(
        normalizeWorkspaceProjectRecord({
          id: entry.id,
          name: entry.name,
          version: 2,
          createdAt: entry.lastOpenedAt,
          updatedAt: entry.lastOpenedAt,
          savedAt: entry.lastOpenedAt,
          revision: 0,
          lastKnownRootPath: entry.rootPath,
        }),
        entry.rootPath,
        true,
      );
    }
    const manifest = readWorkspaceManifest(entry.rootPath);
    if (!manifest || manifest.id !== entry.id) {
      return withoutPayload(
        normalizeWorkspaceProjectRecord({
          id: entry.id,
          name: entry.name,
          version: 2,
          createdAt: entry.lastOpenedAt,
          updatedAt: entry.lastOpenedAt,
          savedAt: entry.lastOpenedAt,
          revision: 0,
          lastKnownRootPath: entry.rootPath,
        }),
        entry.rootPath,
        true,
      );
    }
    return withoutPayload({ ...manifest, lastKnownRootPath: entry.rootPath }, entry.rootPath, false);
  });
}

export function readWorkspaceProject(projectId: string, deps: WorkspaceRepositoryDeps): WorkspaceProjectRecordV2 | null {
  const entry = findRecentEntry(projectId, deps);
  if (!entry || entry.missing) {
    return null;
  }
  const manifest = readWorkspaceManifest(entry.rootPath);
  if (!manifest || manifest.id !== projectId) {
    return null;
  }
  return normalizeWorkspaceProjectRecord({ ...manifest, lastKnownRootPath: entry.rootPath });
}

export function saveWorkspaceProject(
  projectId: string,
  record: unknown,
  deps: WorkspaceRepositoryDeps,
): WorkspaceProjectRecordV2 {
  const entry = findRecentEntry(projectId, deps);
  if (!entry || entry.missing) {
    throw new Error(`Workspace project not found: ${projectId}`);
  }
  const existing = readWorkspaceProject(projectId, deps);
  if (!existing) {
    throw new Error(`Workspace project not found: ${projectId}`);
  }
  const now = Date.now();
  const next = normalizeWorkspaceProjectRecord({
    ...existing,
    name: inputName(record, existing.name),
    updatedAt: now,
    savedAt: now,
    revision: existing.revision + 1,
    payload: inputPayload(record),
    lastKnownRootPath: entry.rootPath,
  });
  const written = writeWorkspaceManifest(entry.rootPath, next);
  rememberWorkspace(deps.settingsRoot, written);
  return written;
}

export function removeWorkspaceProjectReference(
  projectId: string,
  deps: WorkspaceRepositoryDeps,
): { id: string; deleted: boolean } {
  removeWorkspaceReference(deps.settingsRoot, projectId);
  return { id: projectId, deleted: false };
}

export function resolveWorkspaceProjectDir(projectId: string, deps: WorkspaceRepositoryDeps): string | null {
  const entry = findRecentEntry(projectId, deps);
  if (!entry || entry.missing || !fs.existsSync(entry.rootPath)) {
    return null;
  }
  const manifest = readWorkspaceManifest(entry.rootPath);
  if (!manifest || manifest.id !== projectId) {
    return null;
  }
  return entry.rootPath;
}
