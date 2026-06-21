import { beforeEach, describe, expect, it, vi } from 'vitest'
import { importImageFilesToGenerationCanvas } from './assetImportAdapter'
import { useGenerationCanvasStore, __resetGenerationCanvasHistoryForTests } from '../store/generationCanvasStore'

function makeImageFile(name = 'image.png', size = 1024): File {
  return new File([new Uint8Array(size)], name, {
    type: 'image/png',
    lastModified: 1,
  })
}

describe('importImageFilesToGenerationCanvas', () => {
  beforeEach(() => {
    __resetGenerationCanvasHistoryForTests()
    useGenerationCanvasStore.getState().restoreSnapshot({
      nodes: [],
      edges: [],
      selectedNodeIds: [],
      groups: [],
    })
  })

  it('does not persist a data URL before the local asset import finishes', async () => {
    let resolveUpload: ((asset: any) => void) | null = null
    const uploadFile = vi.fn(() => new Promise<any>((resolve) => {
      resolveUpload = resolve
    }))
    const promise = importImageFilesToGenerationCanvas([makeImageFile()], {
      basePosition: { x: 10, y: 20 },
      createObjectUrl: () => 'blob:preview',
      revokeObjectUrl: vi.fn(),
      readImageDimensions: async () => ({ width: 100, height: 100 }),
      uploadFile,
      recoverFile: async () => null,
    })

    await vi.waitFor(() => {
      expect(useGenerationCanvasStore.getState().nodes).toHaveLength(1)
      expect(uploadFile).toHaveBeenCalledTimes(1)
    })

    const uploadingNode = useGenerationCanvasStore.getState().nodes[0]
    expect(uploadingNode.result?.url).toBeUndefined()
    expect(uploadingNode.history).toEqual([])
    expect(uploadingNode.meta?.uploadStatus).toBe('uploading')

    resolveUpload?.({
      id: 'asset-1',
      name: 'image',
      userId: 'local',
      createdAt: '',
      updatedAt: '',
      data: { url: 'nomi-local://asset/project-1/image.png' },
    })
    await promise

    const uploadedNode = useGenerationCanvasStore.getState().nodes[0]
    expect(uploadedNode.result?.url).toBe('nomi-local://asset/project-1/image.png')
    expect(uploadedNode.result?.url?.startsWith('data:')).toBe(false)
  })
})
