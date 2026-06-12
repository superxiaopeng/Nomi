import { readLocalProject, saveLocalProject, type LocalProjectSummary } from '../library/localProjectStore'
import { readWindowUrlParam } from '../windowUrlParam'
import { upgradeWorkbenchProjectMediaUrls, normalizeLegacyImageAssetKinds } from './projectMediaMigration'
import {
  clearActiveWorkbenchProjectSaveTarget,
  replayCanvasEventTailAndSealGenesis,
  restoreWorkbenchProjectPayload,
  subscribeWorkbenchProjectPersistence,
} from './workbenchProjectSession'
import type { WorkbenchProjectPayload, WorkbenchProjectRecordV1 } from './projectRecordSchema'
import { migrateProjectRecord, type CategoryMigrationDiagnostic } from './projectCategoryMigration'
import { migrateProjectV51ToV60 } from './projectV51ToV60Migration'
import { backfillShotIndexes } from '../generationCanvas/model/shotNumbering'

let lastCategoryMigrationDiagnostic: CategoryMigrationDiagnostic | null = null

/** Returns + clears the most recent Phase E4 migration diagnostic (for toast UI). */
export function consumeCategoryMigrationDiagnostic(): CategoryMigrationDiagnostic | null {
  const value = lastCategoryMigrationDiagnostic
  lastCategoryMigrationDiagnostic = null
  return value
}

const LAST_ACTIVE_PROJECT_KEY = 'nomi-workbench-last-active-project-v1'

type Dependencies = {
  setActiveProject: (project: LocalProjectSummary | null) => void
  setView: (view: 'library' | 'studio') => void
  onSaveError: (error: unknown) => void
}


function writeLastActiveProjectId(projectId: string): void {
  if (typeof window === 'undefined') return
  const id = projectId.trim()
  if (!id) return
  window.localStorage.setItem(LAST_ACTIVE_PROJECT_KEY, id)
}

export type WorkbenchProjectPersistenceService = {
  hydrateProject: (projectId: string) => Promise<WorkbenchProjectRecordV1 | null>
  hydrateInitialProject: (projects: readonly LocalProjectSummary[]) => Promise<WorkbenchProjectRecordV1 | null>
  persistProject: (project: LocalProjectSummary, payload: WorkbenchProjectPayload) => Promise<WorkbenchProjectRecordV1>
  bindProjectPersistence: (input: {
    project: LocalProjectSummary
    isHydrating: () => boolean
    canPersist: () => boolean
    onSaved: (record: WorkbenchProjectRecordV1) => void
    onSaveError: (error: unknown) => void
  }) => () => void
}

export function createWorkbenchProjectPersistenceService(deps: Dependencies): WorkbenchProjectPersistenceService {
  const persistProject = async (project: LocalProjectSummary, payload: WorkbenchProjectPayload): Promise<WorkbenchProjectRecordV1> => {
    const localSaved = saveLocalProject(project.id, payload, project.name)
    writeLastActiveProjectId(localSaved.id)
    deps.setActiveProject(localSaved)
    return localSaved
  }

  const bindProjectPersistence = (input: {
    project: LocalProjectSummary
    isHydrating: () => boolean
    canPersist: () => boolean
    onSaved: (record: WorkbenchProjectRecordV1) => void
    onSaveError: (error: unknown) => void
  }): (() => void) => {
    return subscribeWorkbenchProjectPersistence({
      projectId: input.project.id,
      projectName: input.project.name,
      isHydrating: input.isHydrating,
      canPersist: input.canPersist,
      saveProject: async (_projectId, payload, _projectName) => persistProject(input.project, payload),
      onSaved: input.onSaved,
      onSaveError: input.onSaveError,
    })
  }

  const hydrateProject = async (projectId: string): Promise<WorkbenchProjectRecordV1 | null> => {
    const project = readLocalProject(projectId)
    if (!project) return null
    clearActiveWorkbenchProjectSaveTarget()
    const mediaUpgraded = await upgradeWorkbenchProjectMediaUrls(project)
    const { record: catUpgraded, diagnostic } = migrateProjectRecord(mediaUpgraded)
    const { record: v60Upgraded } = migrateProjectV51ToV60(catUpgraded)
    // A1.5：历史导入/切图/裁剪/截图的 image 节点改判为 asset（素材卡）。
    const assetUpgraded = normalizeLegacyImageAssetKinds(v60Upgraded)
    // 镜头编号存储身份化（审计 A2）：存量项目缺 shotIndex 的镜头节点按
    // (y, x, id) 确定性回填一次；此后编号不再随布局/添加节点漂移。
    const shotBackfill = backfillShotIndexes(assetUpgraded.payload.generationCanvas.nodes)
    const upgraded = shotBackfill.changed
      ? {
          ...assetUpgraded,
          payload: {
            ...assetUpgraded.payload,
            generationCanvas: {
              ...assetUpgraded.payload.generationCanvas,
              nodes: shotBackfill.nodes,
            },
          },
        }
      : assetUpgraded
    const changed = upgraded !== project
    if (!diagnostic.alreadyMigrated && (diagnostic.migratedNodes > 0 || diagnostic.removedNodes > 0 || diagnostic.categoriesSeeded)) {
      lastCategoryMigrationDiagnostic = diagnostic
    }
    if (changed) {
      saveLocalProject(upgraded.id, upgraded.payload, upgraded.name)
    }
    restoreWorkbenchProjectPayload(upgraded.payload)
    // S5-b-1:重放快照没盖到的事件尾巴(崩溃恢复),完成后以含尾后态发 genesis。
    await replayCanvasEventTailAndSealGenesis(upgraded.id, upgraded.payload)
    writeLastActiveProjectId(upgraded.id)
    deps.setActiveProject(upgraded)
    deps.setView('studio')
    return upgraded
  }

  const hydrateInitialProject = async (_projects: readonly LocalProjectSummary[]): Promise<WorkbenchProjectRecordV1 | null> => {
    const explicitProjectId = readWindowUrlParam('projectId')
    if (!explicitProjectId) return null
    return hydrateProject(explicitProjectId)
  }

  return {
    hydrateProject,
    hydrateInitialProject,
    persistProject,
    bindProjectPersistence,
  }
}
