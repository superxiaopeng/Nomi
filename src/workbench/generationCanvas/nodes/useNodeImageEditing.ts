import React from 'react'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { dataUrlToFile, persistNodeImageFile } from '../adapters/persistNodeImage'
import type { CropRect } from './render/ImageCropOverlay'

// 裁切 / 旋转 / 网格切分都用 canvas.toDataURL 产出 PNG base64。先用 base64 给即时预览，
// 紧接着把它落盘换成 nomi-local:// 替换掉 —— 避免 PNG base64 永久挂在 store（图多即卡）。
// 落盘失败则保留 base64 兜底（可持久化、不丢图）。
function persistEditedNodeImageToLocal(nodeId: string, dataUrl: string, createdAt: number): void {
  const file = dataUrlToFile(dataUrl, `edit-${nodeId}-${createdAt}.png`)
  if (!file) return
  void persistNodeImageFile(file, nodeId).then((localUrl) => {
    if (!localUrl) return
    const store = useGenerationCanvasStore.getState()
    const node = store.nodes.find((candidate) => candidate.id === nodeId)
    if (!node) return
    const hosted = { id: `asset-${nodeId}-${createdAt}`, type: 'image' as const, url: localUrl, createdAt }
    store.updateNode(nodeId, {
      result: hosted,
      history: [hosted],
      meta: { ...(node.meta || {}), localOnly: false, uploadStatus: 'uploaded' },
    })
  })
}

// 图片本地编辑（切图 / 裁剪 / 旋转翻转）从 BaseGenerationNode 抽出（A1.5 接缝）。
// 图片类与素材类节点都复用这一处；以后新增图片编辑功能只动这里 + NodeImageEditToolbar，
// 不碰壳、不碰生成逻辑。所有操作都遵循「跳出新节点」原则——原图零改动，衍生物是新节点。

export type ImageGridSize = 2 | 3
export type ImageTransformOp = 'rotate-left' | 'rotate-right' | 'flip-h' | 'flip-v'

export const IMAGE_TRANSFORM_LABEL: Record<ImageTransformOp, string> = {
  'rotate-left': '向左旋转 90°',
  'rotate-right': '向右旋转 90°',
  'flip-h': '水平翻转',
  'flip-v': '垂直翻转',
}

// 这几个布局上下界与壳里 resize 用的同名常量保持一致（壳负责 resize，这里负责衍生新节点尺寸）。
const MIN_NODE_WIDTH = 240
const MAX_NODE_WIDTH = 680

type ImageGridTile = {
  dataUrl: string
  width: number
  height: number
  row: number
  column: number
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function imageGridTileNodeSize(width: number, height: number, preferredWidth: number): { width: number; height: number; previewHeight: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  const aspectRatio = width / height
  const nodeWidth = clampNumber(preferredWidth, MIN_NODE_WIDTH, MAX_NODE_WIDTH)
  const previewHeight = Math.max(1, Math.round(nodeWidth / aspectRatio))
  return { width: nodeWidth, height: previewHeight, previewHeight }
}

function loadImageForCanvas(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load image.'))
    if (!url.startsWith('data:') && !url.startsWith('blob:')) {
      image.crossOrigin = 'anonymous'
    }
    image.src = url
  })
}

async function splitImageIntoGrid(url: string, gridSize: ImageGridSize): Promise<ImageGridTile[]> {
  if (typeof document === 'undefined') return []
  const image = await loadImageForCanvas(url)
  const imageWidth = image.naturalWidth || image.width
  const imageHeight = image.naturalHeight || image.height
  if (!imageWidth || !imageHeight) return []

  const sourceTileWidth = imageWidth / gridSize
  const sourceTileHeight = imageHeight / gridSize
  const outputTileWidth = Math.max(1, Math.round(sourceTileWidth))
  const outputTileHeight = Math.max(1, Math.round(sourceTileHeight))
  const tiles: ImageGridTile[] = []
  for (let row = 0; row < gridSize; row += 1) {
    const sourceY = row * sourceTileHeight
    for (let column = 0; column < gridSize; column += 1) {
      const sourceX = column * sourceTileWidth
      const canvas = document.createElement('canvas')
      canvas.width = outputTileWidth
      canvas.height = outputTileHeight
      const context = canvas.getContext('2d')
      if (!context) continue
      context.drawImage(image, sourceX, sourceY, sourceTileWidth, sourceTileHeight, 0, 0, outputTileWidth, outputTileHeight)
      tiles.push({
        dataUrl: canvas.toDataURL('image/png'),
        width: outputTileWidth,
        height: outputTileHeight,
        row,
        column,
      })
    }
  }
  return tiles
}

async function cropImageRegion(
  url: string,
  rect: { x: number; y: number; w: number; h: number },
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (typeof document === 'undefined') return null
  const image = await loadImageForCanvas(url)
  const imageWidth = image.naturalWidth || image.width
  const imageHeight = image.naturalHeight || image.height
  if (!imageWidth || !imageHeight) return null
  const sx = clampNumber(Math.round(rect.x * imageWidth), 0, imageWidth - 1)
  const sy = clampNumber(Math.round(rect.y * imageHeight), 0, imageHeight - 1)
  const sw = clampNumber(Math.round(rect.w * imageWidth), 1, imageWidth - sx)
  const sh = clampNumber(Math.round(rect.h * imageHeight), 1, imageHeight - sy)
  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh)
  return { dataUrl: canvas.toDataURL('image/png'), width: sw, height: sh }
}

async function transformImage(
  url: string,
  op: ImageTransformOp,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (typeof document === 'undefined') return null
  const image = await loadImageForCanvas(url)
  const imageWidth = image.naturalWidth || image.width
  const imageHeight = image.naturalHeight || image.height
  if (!imageWidth || !imageHeight) return null
  const rotated = op === 'rotate-left' || op === 'rotate-right'
  const canvas = document.createElement('canvas')
  canvas.width = rotated ? imageHeight : imageWidth
  canvas.height = rotated ? imageWidth : imageHeight
  const context = canvas.getContext('2d')
  if (!context) return null
  if (op === 'rotate-left' || op === 'rotate-right') {
    context.translate(canvas.width / 2, canvas.height / 2)
    context.rotate(op === 'rotate-right' ? Math.PI / 2 : -Math.PI / 2)
    context.drawImage(image, -imageWidth / 2, -imageHeight / 2)
  } else if (op === 'flip-h') {
    context.translate(imageWidth, 0)
    context.scale(-1, 1)
    context.drawImage(image, 0, 0)
  } else {
    context.translate(0, imageHeight)
    context.scale(1, -1)
    context.drawImage(image, 0, 0)
  }
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
}

export type NodeImageEditing = {
  splittingGridSize: ImageGridSize | null
  cropMode: boolean
  setCropMode: (value: boolean) => void
  imageOpBusy: boolean
  handleImageGridSplit: (gridSize: ImageGridSize) => Promise<void>
  handleCropConfirm: (rect: CropRect) => Promise<void>
  handleImageTransform: (op: ImageTransformOp) => Promise<void>
}

export function useNodeImageEditing(
  node: GenerationCanvasNode,
  visualSize: { width: number; height: number },
): NodeImageEditing {
  const addNode = useGenerationCanvasStore((state) => state.addNode)
  const updateNode = useGenerationCanvasStore((state) => state.updateNode)
  const storeConnectNodes = useGenerationCanvasStore((state) => state.connectNodes)
  const [splittingGridSize, setSplittingGridSize] = React.useState<ImageGridSize | null>(null)
  const [cropMode, setCropMode] = React.useState(false)
  const [imageOpBusy, setImageOpBusy] = React.useState(false)

  const visualWidth = visualSize.width
  const nodeId = node.id
  const nodeTitle = node.title
  const nodePositionX = node.position.x
  const nodePositionY = node.position.y
  const nodeResult = node.result

  const handleImageGridSplit = React.useCallback(async (gridSize: ImageGridSize) => {
    const imageUrl = nodeResult?.type === 'image' ? nodeResult.url : undefined
    if (!imageUrl || splittingGridSize !== null) return

    setSplittingGridSize(gridSize)
    try {
      const tiles = await splitImageIntoGrid(imageUrl, gridSize)
      if (tiles.length !== gridSize * gridSize) return
      const createdAt = Date.now()
      const gap = 42
      const preferredTileWidth = Math.max(MIN_NODE_WIDTH, Math.round(visualWidth / gridSize))
      const firstTileSize = imageGridTileNodeSize(tiles[0]?.width || 1, tiles[0]?.height || 1, preferredTileWidth)
      const layoutWidth = firstTileSize?.width || 240
      const layoutHeight = firstTileSize?.previewHeight || 180
      const baseX = Math.round(nodePositionX + visualWidth + 80)
      const baseY = Math.round(nodePositionY)

      tiles.forEach((tile, index) => {
        const tileSize = imageGridTileNodeSize(tile.width, tile.height, layoutWidth)
        const tileNode = addNode({
          kind: 'asset',
          title: `${nodeTitle || '图片'} ${gridSize}x${gridSize} 切片 ${index + 1}`,
          prompt: `${gridSize}x${gridSize} 图片切片 ${tile.row + 1}-${tile.column + 1}`,
          position: {
            x: baseX + tile.column * (layoutWidth + gap),
            y: baseY + tile.row * (layoutHeight + gap),
          },
          select: false,
        })
        const result = {
          id: `image-split-${tileNode.id}-${createdAt}-${index}`,
          type: 'image' as const,
          url: tile.dataUrl,
          createdAt,
        }
        updateNode(tileNode.id, {
          result,
          history: [result],
          status: 'success',
          ...(tileSize ? { size: { width: tileSize.width, height: tileSize.height } } : {}),
          meta: {
            ...(tileNode.meta || {}),
            source: `image-grid-split-${gridSize}x${gridSize}`,
            sourceNodeId: nodeId,
            localOnly: true,
            gridSize,
            gridRow: tile.row,
            gridColumn: tile.column,
            imageWidth: tile.width,
            imageHeight: tile.height,
            imageAspectRatio: tile.width / Math.max(1, tile.height),
            previewHeight: tileSize?.previewHeight,
          },
        })
        storeConnectNodes(nodeId, tileNode.id, 'reference')
        persistEditedNodeImageToLocal(tileNode.id, tile.dataUrl, createdAt)
      })
    } catch {
      // Image splitting can fail if the source image cannot be loaded into a canvas due to CORS.
    } finally {
      setSplittingGridSize(null)
    }
  }, [addNode, nodeId, nodePositionX, nodePositionY, nodeResult, nodeTitle, splittingGridSize, storeConnectNodes, updateNode, visualWidth])

  // 裁剪：不在原图上做破坏式操作，而是从原图「跳出」一个新素材节点。
  // 原节点零改动；新裁剪节点可再缩放/再裁剪/拖时间线/当参考。
  const handleCropConfirm = React.useCallback(async (rect: CropRect) => {
    const imageUrl = nodeResult?.type === 'image' ? nodeResult.url : undefined
    setCropMode(false)
    if (!imageUrl) return
    try {
      const cropped = await cropImageRegion(imageUrl, rect)
      if (!cropped) return
      const createdAt = Date.now()
      const preferredWidth = clampNumber(visualWidth, MIN_NODE_WIDTH, MAX_NODE_WIDTH)
      const newSize = imageGridTileNodeSize(cropped.width, cropped.height, preferredWidth)
      const cropNode = addNode({
        kind: 'asset',
        title: `${nodeTitle || '图片'} 裁剪`,
        prompt: '图片裁剪',
        position: {
          x: Math.round(nodePositionX + visualWidth + 80),
          y: Math.round(nodePositionY),
        },
        select: true,
      })
      const result = {
        id: `image-crop-${cropNode.id}-${createdAt}`,
        type: 'image' as const,
        url: cropped.dataUrl,
        createdAt,
      }
      updateNode(cropNode.id, {
        result,
        history: [result],
        status: 'success',
        ...(newSize ? { size: { width: newSize.width, height: newSize.height } } : {}),
        meta: {
          ...(cropNode.meta || {}),
          source: 'image-crop',
          sourceNodeId: nodeId,
          localOnly: true,
          imageWidth: cropped.width,
          imageHeight: cropped.height,
          imageAspectRatio: cropped.width / Math.max(1, cropped.height),
          previewHeight: newSize?.previewHeight,
        },
      })
      storeConnectNodes(nodeId, cropNode.id, 'reference')
      persistEditedNodeImageToLocal(cropNode.id, cropped.dataUrl, createdAt)
    } catch {
      // Crop can fail if the source image cannot be loaded into a canvas due to CORS.
    }
  }, [addNode, nodeId, nodePositionX, nodePositionY, nodeResult, nodeTitle, storeConnectNodes, updateNode, visualWidth])

  // 旋转 / 翻转：同款「跳出新素材节点」原则 —— canvas 处理后派生新节点，原图保留。
  const handleImageTransform = React.useCallback(async (op: ImageTransformOp) => {
    const imageUrl = nodeResult?.type === 'image' ? nodeResult.url : undefined
    if (!imageUrl || imageOpBusy) return
    setImageOpBusy(true)
    try {
      const out = await transformImage(imageUrl, op)
      if (!out) return
      const createdAt = Date.now()
      const preferredWidth = clampNumber(visualWidth, MIN_NODE_WIDTH, MAX_NODE_WIDTH)
      const newSize = imageGridTileNodeSize(out.width, out.height, preferredWidth)
      const opNode = addNode({
        kind: 'asset',
        title: `${nodeTitle || '图片'} ${IMAGE_TRANSFORM_LABEL[op]}`,
        prompt: IMAGE_TRANSFORM_LABEL[op],
        position: {
          x: Math.round(nodePositionX + visualWidth + 80),
          y: Math.round(nodePositionY),
        },
        select: true,
      })
      const result = {
        id: `image-${op}-${opNode.id}-${createdAt}`,
        type: 'image' as const,
        url: out.dataUrl,
        createdAt,
      }
      updateNode(opNode.id, {
        result,
        history: [result],
        status: 'success',
        ...(newSize ? { size: { width: newSize.width, height: newSize.height } } : {}),
        meta: {
          ...(opNode.meta || {}),
          source: `image-${op}`,
          sourceNodeId: nodeId,
          localOnly: true,
          imageWidth: out.width,
          imageHeight: out.height,
          imageAspectRatio: out.width / Math.max(1, out.height),
          previewHeight: newSize?.previewHeight,
        },
      })
      storeConnectNodes(nodeId, opNode.id, 'reference')
      persistEditedNodeImageToLocal(opNode.id, out.dataUrl, createdAt)
    } catch {
      // Transform can fail if the source image cannot be loaded into a canvas due to CORS.
    } finally {
      setImageOpBusy(false)
    }
  }, [addNode, imageOpBusy, nodeId, nodePositionX, nodePositionY, nodeResult, nodeTitle, storeConnectNodes, updateNode, visualWidth])

  return {
    splittingGridSize,
    cropMode,
    setCropMode,
    imageOpBusy,
    handleImageGridSplit,
    handleCropConfirm,
    handleImageTransform,
  }
}
