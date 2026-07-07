import React from 'react'
import { createPortal } from 'react-dom'
import { ScrollArea } from '@mantine/core'
import { motion } from 'framer-motion'
import { PanelLeftOpen, PanelRightClose, PanelRightOpen, ScanSearch, Settings2 } from 'lucide-react'
import {
  IconArrowForwardUp,
  IconArrowLeft,
  IconCards,
  IconChevronRight,
  IconCheck,
  IconCopy,
  IconDotsVertical,
  IconFilter,
  IconFileText,
  IconFolderOpen,
  IconFolderPlus,
  IconLayoutGrid,
  IconList,
  IconMinus,
  IconPhoto,
  IconSortAscending2,
  IconTrash,
  IconUpload,
  IconX,
} from '../../vendor/tablerIcons'
import { DesignEmptyState, DesignSearchInput } from '../../design'
import { getDesktopActiveProjectId } from '../../desktop/activeProject'
import { getDesktopBridge, type DesktopAssetDto } from '../../desktop/bridge'
import { cn } from '../../utils/cn'
import { getTextBrain } from '../../workbench/api/promptLibraryApi'
import { runWorkbenchTaskByVendor } from '../../workbench/api/taskApi'
import {
  filterNomiBrowserAssets,
  NOMI_BROWSER_ASSETS,
  NOMI_BROWSER_ASSET_SOURCES,
  NOMI_BROWSER_ASSET_TABS,
  type NomiBrowserAsset,
  type NomiBrowserAssetSource,
  type NomiBrowserAssetSourceDefinition,
  type NomiBrowserAssetTab,
  type NomiBrowserAssetTabDefinition,
} from './browserAssetData'
import {
  BROWSER_ASSET_LIBRARY_UPDATED_EVENT,
  DEFAULT_BROWSER_PROMPT_CATEGORIES,
  EMPTY_BROWSER_ASSET_LIBRARY_STATE,
  createBrowserPromptCategory,
  promptTypeLabel as getBrowserPromptTypeLabel,
  readBrowserAssetLibraryState,
  writeBrowserAssetLibraryState,
  type BrowserAssetLibraryState,
} from './browserAssetLibraryStorage'
import { dispatchBrowserAssetsImportToCanvas, type BrowserAssetCanvasImportItem } from './globalAssetPopoverEvents'
import {
  createInitialFloatingWindowRect,
  FLOATING_WINDOW_MIN_WIDTH,
  FLOATING_WINDOW_RESIZE_EDGES,
  type FloatingWindowAnchorRect,
  type FloatingWindowBoundsRect,
  type FloatingWindowInteractionEndEvent,
  type FloatingWindowResizeEdge,
  type FloatingWindowRect,
  useResizableFloatingWindow,
} from './useResizableFloatingWindow'
import { BrowserAssetFilterPopover, BrowserAssetTile, BrowserPromptCategoryFilterPopover } from './BrowserAssetPopoverParts'
import {
  BROWSER_IMAGE_REPLICATE_PROMPT_EXTRACTION_PROMPT,
  BROWSER_IMAGE_STYLE_PROMPT_EXTRACTION_PROMPT,
  BROWSER_PROMPT_EXTRACTION_MODE_LABELS,
  browserPromptExtractionPromptForMode,
  extractTextFromTaskResult,
  parseBrowserPromptExtraction,
  type BrowserPromptExtractionMode,
} from './browserPromptExtraction'

type BrowserPromptExtractionTemplate = {
  id: string
  title: string
  prompt: string
  builtin?: boolean
  createdAt?: string
  updatedAt?: string
}

type BrowserPromptExtractionTemplateSettings = {
  version: 1
  selectedTemplateIds: Record<BrowserPromptExtractionMode, string>
  defaultOverrides: Partial<Record<BrowserPromptExtractionMode, { title?: string; prompt?: string; updatedAt?: string }>>
  customTemplates: Partial<Record<BrowserPromptExtractionMode, BrowserPromptExtractionTemplate[]>>
}

const BROWSER_PROMPT_EXTRACTION_SETTINGS_VERSION = 1
const BROWSER_PROMPT_TEMPLATE_DEFAULT_IDS: Record<BrowserPromptExtractionMode, string> = {
  replicate: 'default:replicate',
  style: 'default:style',
}
const BROWSER_PROMPT_TEMPLATE_DEFAULT_TITLES: Record<BrowserPromptExtractionMode, string> = {
  replicate: BROWSER_PROMPT_EXTRACTION_MODE_LABELS.replicate,
  style: BROWSER_PROMPT_EXTRACTION_MODE_LABELS.style,
}
const BROWSER_PROMPT_TEMPLATE_DEFAULT_PROMPTS: Record<BrowserPromptExtractionMode, string> = {
  replicate: BROWSER_IMAGE_REPLICATE_PROMPT_EXTRACTION_PROMPT,
  style: BROWSER_IMAGE_STYLE_PROMPT_EXTRACTION_PROMPT,
}
const CANVAS_IMPORT_TARGET_SELECTOR = '[data-nomi-generation-canvas-import-target="true"]'
const BROWSER_DIALOG_ROOT_SELECTOR = '.nomi-browser-dialog-root'
const PROMPT_EXTRACTION_SETTINGS_DIALOG_SELECTOR = '[data-nomi-prompt-extraction-settings-dialog="true"]'

function createDefaultBrowserPromptExtractionTemplateSettings(): BrowserPromptExtractionTemplateSettings {
  return {
    version: BROWSER_PROMPT_EXTRACTION_SETTINGS_VERSION,
    selectedTemplateIds: {
      replicate: BROWSER_PROMPT_TEMPLATE_DEFAULT_IDS.replicate,
      style: BROWSER_PROMPT_TEMPLATE_DEFAULT_IDS.style,
    },
    defaultOverrides: {},
    customTemplates: {},
  }
}

function normalizeBrowserPromptExtractionTemplate(input: unknown): BrowserPromptExtractionTemplate | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const record = input as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const title = typeof record.title === 'string' ? record.title.trim() : ''
  const prompt = typeof record.prompt === 'string' ? record.prompt : ''
  if (!id || id.startsWith('default:')) return null
  return {
    id,
    title: title || '未命名模板',
    prompt,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : undefined,
  }
}

function normalizeBrowserPromptExtractionTemplateSettings(input: unknown): BrowserPromptExtractionTemplateSettings {
  const defaults = createDefaultBrowserPromptExtractionTemplateSettings()
  if (!input || typeof input !== 'object' || Array.isArray(input)) return defaults
  const record = input as Record<string, unknown>
  const selected = record.selectedTemplateIds && typeof record.selectedTemplateIds === 'object'
    ? record.selectedTemplateIds as Partial<Record<BrowserPromptExtractionMode, unknown>>
    : {}
  const rawOverrides = record.defaultOverrides && typeof record.defaultOverrides === 'object'
    ? record.defaultOverrides as Partial<Record<BrowserPromptExtractionMode, unknown>>
    : {}
  const rawCustom = record.customTemplates && typeof record.customTemplates === 'object'
    ? record.customTemplates as Partial<Record<BrowserPromptExtractionMode, unknown>>
    : {}
  const defaultOverrides: BrowserPromptExtractionTemplateSettings['defaultOverrides'] = {}
  const customTemplates: BrowserPromptExtractionTemplateSettings['customTemplates'] = {}
  for (const mode of ['replicate', 'style'] as const) {
    const override = rawOverrides[mode]
    if (override && typeof override === 'object' && !Array.isArray(override)) {
      const item = override as Record<string, unknown>
      const title = typeof item.title === 'string' ? item.title.trim() : ''
      const prompt = typeof item.prompt === 'string' ? item.prompt : ''
      if (title || prompt.trim()) {
        defaultOverrides[mode] = {
          ...(title ? { title } : {}),
          ...(prompt.trim() ? { prompt } : {}),
          ...(typeof item.updatedAt === 'string' ? { updatedAt: item.updatedAt } : {}),
        }
      }
    }
    customTemplates[mode] = Array.isArray(rawCustom[mode])
      ? rawCustom[mode].map(normalizeBrowserPromptExtractionTemplate).filter((item): item is BrowserPromptExtractionTemplate => Boolean(item))
      : []
    const selectedId = typeof selected[mode] === 'string' ? selected[mode]!.trim() : ''
    const validIds = new Set([BROWSER_PROMPT_TEMPLATE_DEFAULT_IDS[mode], ...customTemplates[mode]!.map((template) => template.id)])
    defaults.selectedTemplateIds[mode] = validIds.has(selectedId) ? selectedId : BROWSER_PROMPT_TEMPLATE_DEFAULT_IDS[mode]
  }
  return {
    ...defaults,
    defaultOverrides,
    customTemplates,
  }
}

function browserPromptExtractionTemplatesForMode(
  settings: BrowserPromptExtractionTemplateSettings,
  mode: BrowserPromptExtractionMode,
): BrowserPromptExtractionTemplate[] {
  const override = settings.defaultOverrides[mode]
  return [
    {
      id: BROWSER_PROMPT_TEMPLATE_DEFAULT_IDS[mode],
      title: override?.title || BROWSER_PROMPT_TEMPLATE_DEFAULT_TITLES[mode],
      prompt: override?.prompt || BROWSER_PROMPT_TEMPLATE_DEFAULT_PROMPTS[mode],
      builtin: true,
      updatedAt: override?.updatedAt,
    },
    ...(settings.customTemplates[mode] ?? []),
  ]
}

function selectedBrowserPromptExtractionTemplate(
  settings: BrowserPromptExtractionTemplateSettings,
  mode: BrowserPromptExtractionMode,
): BrowserPromptExtractionTemplate {
  const templates = browserPromptExtractionTemplatesForMode(settings, mode)
  return templates.find((template) => template.id === settings.selectedTemplateIds[mode]) ?? templates[0]
}

function browserPromptExtractionPromptFromSettings(
  settings: BrowserPromptExtractionTemplateSettings,
  mode: BrowserPromptExtractionMode,
): string {
  return selectedBrowserPromptExtractionTemplate(settings, mode).prompt || browserPromptExtractionPromptForMode(mode)
}

type NomiBrowserAssetPopoverProps = {
  className?: string
  placement?: 'absolute' | 'fixed'
  surface?: 'floating' | 'contained'
  opened?: boolean
  anchorRect?: FloatingWindowAnchorRect | null
  boundsRect?: FloatingWindowBoundsRect | null
  dockable?: boolean
  dockPresentation?: 'overlay' | 'edge' | 'split'
  defaultOpened?: boolean
  defaultSource?: NomiBrowserAssetSource
  defaultTab?: NomiBrowserAssetTab
  showTrigger?: boolean
  assets?: readonly NomiBrowserAsset[]
  tabs?: readonly NomiBrowserAssetTabDefinition[]
  sourceTabs?: readonly NomiBrowserAssetSourceDefinition[]
  onOpenChange?: (opened: boolean) => void
  onWindowRectChange?: (rect: FloatingWindowBoundsRect | null) => void
  onDockModeChange?: (dockMode: BrowserAssetPopoverDockMode) => void
  onAssetSelect?: (asset: NomiBrowserAsset) => void
  onCreateFolder?: (folder: NomiBrowserAsset) => void
  onImportRemoteAsset?: (input: BrowserAssetRemoteImportInput) => Promise<NomiBrowserAsset>
  browserCaptureEnabled?: boolean
  browserCaptureDisabled?: boolean
  browserCaptureRequest?: BrowserAssetCaptureRequest | null
  browserPromptCaptureRequest?: BrowserAssetPromptCaptureRequest | null
  onBrowserCaptureToggle?: () => void
}

type MarqueeState = {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

type MarqueePointerState = {
  clientX: number
  clientY: number
}

export type BrowserAssetPopoverDockMode = 'left' | 'right' | null

export type BrowserAssetRemoteImportInput = {
  url: string
  title?: string
  fileName?: string
  mediaType?: 'image' | 'video'
}

export type BrowserAssetCaptureRequest = BrowserAssetRemoteImportInput & {
  requestId: string
}

export type BrowserAssetPromptReference = {
  url: string
  title?: string
  sourceUrl?: string
}

export type BrowserAssetPromptCaptureRect = {
  left: number
  top: number
  width: number
  height: number
}

export type BrowserAssetPromptCaptureRequest = {
  requestId: string
  sourceType: 'image' | 'screenshot'
  extractionMode?: BrowserPromptExtractionMode
  viewId?: number
  title?: string
  fileName?: string
  pageUrl?: string
  pageTitle?: string
  sourceUrl?: string
  modelImageUrl?: string
  sourceRect?: BrowserAssetPromptCaptureRect
  referenceImages?: readonly BrowserAssetPromptReference[]
}

type AssetPopoverDockMode = BrowserAssetPopoverDockMode
type AssetPopoverViewMode = 'grid' | 'list'
type AssetContextMenuState = {
  assetId: string
  x: number
  y: number
}

type BlankContextMenuState = {
  x: number
  y: number
}

const NOMI_ASSET_DRAG_MIME = 'application/x-nomi-assets'
const LEGACY_BROWSER_ASSET_DRAG_MIME = 'application/x-nomi-browser-assets'
const BROWSER_IMAGE_DRAG_MIME = 'application/x-nomi-browser-image'
const DOCK_EDGE_THRESHOLD = 32
const DOCK_GAP = 10
const DOCK_DEFAULT_WIDTH = 500
const DOCK_MAX_WIDTH_RATIO = 0.54
const PERSISTED_ASSET_PAGE_LIMIT = 200
const ASSET_GRID_HORIZONTAL_PADDING = 32
const ASSET_GRID_COLUMN_GAP = 12
const ASSET_GRID_MIN_COLUMN_WIDTH = 112
const ASSET_GRID_COMPACT_MIN_COLUMN_WIDTH = 128
const ASSET_GRID_COMPACT_MAX_COLUMNS = 3
const ASSET_CONTEXT_MENU_WIDTH = 168
const ASSET_CONTEXT_MENU_ESTIMATED_HEIGHT = 78
const ASSET_CONTEXT_MENU_MARGIN = 8
const BLANK_CONTEXT_MENU_WIDTH = 168
const BLANK_CONTEXT_MENU_ESTIMATED_HEIGHT = 42
const PROMPT_MASONRY_COLUMN_GAP = 10
const PROMPT_MASONRY_MIN_COLUMN_WIDTH = 136
const PROMPT_MASONRY_MAX_COLUMNS = 5
const MARQUEE_AUTO_SCROLL_EDGE_SIZE = 44
const MARQUEE_AUTO_SCROLL_MAX_SPEED = 22

const TOOL_BUTTON_CLASS = cn(
  'inline-grid size-8 place-items-center rounded-nomi-sm border-0 bg-transparent',
  'cursor-pointer text-nomi-ink-60 transition-[background,color] duration-[var(--nomi-transition-fast)]',
  'hover:bg-nomi-ink-05 hover:text-nomi-ink',
)

const TOOL_BUTTON_COMPACT_CLASS = cn(
  'inline-grid size-8 place-items-center rounded-nomi-sm border-0 bg-transparent',
  'cursor-pointer text-nomi-ink-60 transition-[background,color] duration-[var(--nomi-transition-fast)]',
  'hover:bg-nomi-ink-05 hover:text-nomi-ink',
)

const RESIZE_HANDLE_CLASS: Record<FloatingWindowResizeEdge, string> = {
  n: '-top-2 left-5 right-5 h-4 cursor-ns-resize',
  s: '-bottom-2 left-5 right-5 h-4 cursor-ns-resize',
  e: '-right-2 bottom-5 top-5 w-4 cursor-ew-resize',
  w: '-left-2 bottom-5 top-5 w-4 cursor-ew-resize',
  ne: '-right-2 -top-2 size-5 cursor-nesw-resize',
  nw: '-left-2 -top-2 size-5 cursor-nwse-resize',
  se: '-bottom-2 -right-2 size-5 cursor-nwse-resize',
  sw: '-bottom-2 -left-2 size-5 cursor-nesw-resize',
}

function clampNumber(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

function getAssetGridColumnCount(windowWidth: number, compact: boolean): number {
  const availableWidth = Math.max(0, windowWidth - ASSET_GRID_HORIZONTAL_PADDING)
  const minColumnWidth = compact ? ASSET_GRID_COMPACT_MIN_COLUMN_WIDTH : ASSET_GRID_MIN_COLUMN_WIDTH
  const rawCount = Math.floor((availableWidth + ASSET_GRID_COLUMN_GAP) / (minColumnWidth + ASSET_GRID_COLUMN_GAP))
  const maxColumns = compact ? ASSET_GRID_COMPACT_MAX_COLUMNS : Number.POSITIVE_INFINITY
  return clampNumber(rawCount, 1, maxColumns)
}

function getPromptMasonryColumnCount(windowWidth: number): number {
  const availableWidth = Math.max(0, windowWidth - ASSET_GRID_HORIZONTAL_PADDING)
  const rawCount = Math.floor(
    (availableWidth + PROMPT_MASONRY_COLUMN_GAP) / (PROMPT_MASONRY_MIN_COLUMN_WIDTH + PROMPT_MASONRY_COLUMN_GAP),
  )
  return clampNumber(rawCount, 1, PROMPT_MASONRY_MAX_COLUMNS)
}

function createDockedWindowRect(
  bounds: FloatingWindowBoundsRect,
  dockMode: Exclude<AssetPopoverDockMode, null>,
  preferredWidth = DOCK_DEFAULT_WIDTH,
  gap = DOCK_GAP,
): FloatingWindowRect {
  const maxWidth = Math.max(
    FLOATING_WINDOW_MIN_WIDTH,
    Math.min(bounds.width - gap * 2, Math.floor(bounds.width * DOCK_MAX_WIDTH_RATIO)),
  )
  const width = clampNumber(Math.round(preferredWidth), FLOATING_WINDOW_MIN_WIDTH, maxWidth)
  return {
    left: dockMode === 'left' ? bounds.left + gap : bounds.right - gap - width,
    top: bounds.top + gap,
    width,
    height: Math.max(0, bounds.height - gap * 2),
  }
}

function normalizeMarqueeRect(rect: MarqueeState): React.CSSProperties {
  const left = Math.min(rect.startX, rect.currentX)
  const top = Math.min(rect.startY, rect.currentY)
  return {
    left,
    top,
    width: Math.abs(rect.currentX - rect.startX),
    height: Math.abs(rect.currentY - rect.startY),
  }
}

function rectsIntersect(left: DOMRect, right: DOMRect): boolean {
  return left.left <= right.right && left.right >= right.left && left.top <= right.bottom && left.bottom >= right.top
}

function assetTypeFromFile(file: File): NomiBrowserAsset['type'] {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return 'prompt'
}

function contentTypeFromFile(file: File): string {
  if (file.type) return file.type
  const name = file.name.toLowerCase()
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'text/markdown'
  if (name.endsWith('.txt')) return 'text/plain'
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.webp')) return 'image/webp'
  if (name.endsWith('.gif')) return 'image/gif'
  if (name.endsWith('.mp4')) return 'video/mp4'
  if (name.endsWith('.webm')) return 'video/webm'
  if (name.endsWith('.mov')) return 'video/quicktime'
  return 'application/octet-stream'
}

function isPromptAssetFileName(fileName: string): boolean {
  return /\.(md|markdown|txt)$/i.test(fileName)
}

function assetTypeFromDesktopAsset(asset: DesktopAssetDto): NomiBrowserAsset['type'] | null {
  const mediaType = typeof asset.data.mediaType === 'string' ? asset.data.mediaType.toLowerCase() : ''
  if (mediaType === 'image') return 'image'
  if (mediaType === 'video') return 'video'
  const contentType = typeof asset.data.contentType === 'string' ? asset.data.contentType.toLowerCase() : ''
  if (contentType.startsWith('image/')) return 'image'
  if (contentType.startsWith('video/')) return 'video'
  if (/\.(mp4|webm|mov|m4v)$/i.test(asset.name)) return 'video'
  if (/\.(png|jpe?g|webp|gif|avif)$/i.test(asset.name)) return 'image'
  if (contentType.startsWith('text/') || isPromptAssetFileName(asset.name)) return 'prompt'
  return null
}

function browserAssetStorageKeyFromDesktopAsset(asset: DesktopAssetDto): string {
  const url = typeof asset.data.url === 'string' ? asset.data.url : ''
  return url ? `url:${url}` : `id:${asset.id}`
}

function browserAssetLibraryHasDesktopAsset(asset: DesktopAssetDto, libraryState?: BrowserAssetLibraryState): boolean {
  if (!libraryState) return false
  return Object.prototype.hasOwnProperty.call(
    libraryState.folderAssignments,
    browserAssetStorageKeyFromDesktopAsset(asset),
  )
}

function shouldShowDesktopAssetInBrowserPopover(
  asset: DesktopAssetDto,
  libraryState?: BrowserAssetLibraryState,
): boolean {
  const kind = typeof asset.data.kind === 'string' ? asset.data.kind : ''
  if (asset.data.ownerNodeId) return false
  if (kind === 'browser-capture') return true
  if (kind === 'browser-upload') return true
  return browserAssetLibraryHasDesktopAsset(asset, libraryState)
}

function browserAssetSubtitleFromDesktopAsset(asset: DesktopAssetDto): string {
  const kind = typeof asset.data.kind === 'string' ? asset.data.kind : ''
  if (kind === 'browser-capture') return '网页素材'
  if (kind === 'browser-upload') return '本地导入'
  if (kind === 'upload') return '本地导入'
  return '项目素材'
}

function browserAssetFromDesktopAsset(asset: DesktopAssetDto): NomiBrowserAsset | null {
  if (asset.name.endsWith('.meta')) return null
  const type = assetTypeFromDesktopAsset(asset)
  if (!type) return null
  const url = typeof asset.data.url === 'string' ? asset.data.url : ''
  const subtitle = browserAssetSubtitleFromDesktopAsset(asset)
  return {
    id: asset.id,
    type,
    source: 'my',
    title: asset.name || (type === 'video' ? '项目视频' : type === 'image' ? '项目图片' : '本地文本'),
    subtitle,
    previewUrl: type === 'prompt' ? undefined : url || undefined,
    tags: [subtitle],
  }
}

function browserAssetUrlKey(asset: NomiBrowserAsset): string {
  if (asset.promptCard) return ''
  return asset.previewUrl || ''
}

function browserAssetStorageKey(asset: NomiBrowserAsset): string {
  if (asset.promptCard) return `prompt:${asset.id}`
  return asset.previewUrl ? `url:${asset.previewUrl}` : `id:${asset.id}`
}

function promptTextFromBrowserAsset(asset: NomiBrowserAsset): string {
  const promptCardPrompt = asset.promptCard?.prompt.trim()
  if (promptCardPrompt) return promptCardPrompt
  const subtitle = asset.subtitle?.trim() ?? ''
  if (subtitle && !['本地文本', '本地导入', '网页素材', '项目素材'].includes(subtitle)) return subtitle
  return asset.title
}

function browserAssetToCanvasImportItem(asset: NomiBrowserAsset): BrowserAssetCanvasImportItem | null {
  if (asset.type === 'folder') return null
  if (asset.status === 'loading' || asset.status === 'error') return null
  if (asset.type === 'prompt') {
    return {
      id: asset.id,
      type: 'prompt',
      title: asset.title,
      subtitle: asset.subtitle,
      prompt: promptTextFromBrowserAsset(asset),
    }
  }
  const previewUrl = asset.previewUrl?.trim()
  if (!previewUrl) return null
  return {
    id: asset.id,
    type: asset.type,
    title: asset.title,
    subtitle: asset.subtitle,
    previewUrl,
  }
}

function isBrowserAssetCanvasImportItem(
  asset: BrowserAssetCanvasImportItem | null,
): asset is BrowserAssetCanvasImportItem {
  return Boolean(asset)
}

function mergeBrowserAssetGroups(...groups: readonly (readonly NomiBrowserAsset[])[]): NomiBrowserAsset[] {
  const merged: NomiBrowserAsset[] = []
  const seenIds = new Set<string>()
  const seenUrls = new Set<string>()
  for (const group of groups) {
    for (const asset of group) {
      const urlKey = browserAssetUrlKey(asset)
      if (seenIds.has(asset.id) || (urlKey && seenUrls.has(urlKey))) continue
      merged.push(asset)
      seenIds.add(asset.id)
      if (urlKey) seenUrls.add(urlKey)
    }
  }
  return merged
}

function upsertBrowserAsset(current: readonly NomiBrowserAsset[], asset: NomiBrowserAsset): NomiBrowserAsset[] {
  const urlKey = browserAssetUrlKey(asset)
  return [asset, ...current.filter((item) => item.id !== asset.id && (!urlKey || browserAssetUrlKey(item) !== urlKey))]
}

function firstUsableImageUrlFromText(text: string): string {
  const candidates = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
  for (const candidate of candidates) {
    if (/^(https?:\/\/|data:image\/)/i.test(candidate)) return candidate
  }
  return ''
}

function imageUrlFromHtml(html: string): { url: string; title?: string } | null {
  if (!html.trim()) return null
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const image = doc.querySelector('img')
    const url = image?.getAttribute('src') || image?.getAttribute('data-src') || ''
    if (!url) return null
    return {
      url,
      title: image?.getAttribute('alt') || image?.getAttribute('title') || undefined,
    }
  } catch {
    return null
  }
}

function fileNameFromRemoteAssetUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const segment = parsed.pathname.split('/').filter(Boolean).pop()
    return segment ? decodeURIComponent(segment) : `browser-resource-${Date.now()}`
  } catch {
    return `browser-resource-${Date.now()}`
  }
}

function readBrowserImageDragPayload(dataTransfer: DataTransfer): BrowserAssetRemoteImportInput | null {
  const customPayload = dataTransfer.getData(BROWSER_IMAGE_DRAG_MIME)
  if (customPayload) {
    try {
      const parsed = JSON.parse(customPayload) as { url?: unknown; title?: unknown }
      const url = typeof parsed.url === 'string' ? parsed.url.trim() : ''
      if (url) {
        return {
          url,
          title: typeof parsed.title === 'string' ? parsed.title.trim() || undefined : undefined,
          fileName: fileNameFromRemoteAssetUrl(url),
          mediaType: 'image',
        }
      }
    } catch {
      // Fall through to standard browser drag formats.
    }
  }

  const uriListUrl = firstUsableImageUrlFromText(dataTransfer.getData('text/uri-list'))
  if (uriListUrl) {
    return {
      url: uriListUrl,
      fileName: fileNameFromRemoteAssetUrl(uriListUrl),
      mediaType: 'image',
    }
  }

  const htmlImage = imageUrlFromHtml(dataTransfer.getData('text/html'))
  if (htmlImage) {
    return {
      ...htmlImage,
      fileName: fileNameFromRemoteAssetUrl(htmlImage.url),
      mediaType: 'image',
    }
  }

  const plainUrl = firstUsableImageUrlFromText(dataTransfer.getData('text/plain'))
  if (plainUrl) {
    return {
      url: plainUrl,
      fileName: fileNameFromRemoteAssetUrl(plainUrl),
      mediaType: 'image',
    }
  }

  return null
}

function promptReferenceImagesFromRequest(request: BrowserAssetPromptCaptureRequest): BrowserAssetPromptReference[] {
  const fromRequest = Array.isArray(request.referenceImages)
    ? request.referenceImages.reduce<BrowserAssetPromptReference[]>((items, reference) => {
          const url = reference.url.trim()
          if (!url) return items
          items.push({
            url,
            ...(reference.title ? { title: reference.title } : {}),
            ...(reference.sourceUrl ? { sourceUrl: reference.sourceUrl } : {}),
          })
          return items
        }, [])
    : []
  if (fromRequest.length > 0) return fromRequest
  const sourceUrl = request.sourceUrl?.trim()
  return sourceUrl
    ? [
        {
          url: sourceUrl,
          title: request.title,
          sourceUrl,
        },
      ]
    : []
}

function promptExtractionModeFromRequest(request: BrowserAssetPromptCaptureRequest): BrowserPromptExtractionMode {
  return request.extractionMode === 'style' ? 'style' : 'replicate'
}

function promptExtractionModeFromAsset(asset: NomiBrowserAsset): BrowserPromptExtractionMode {
  return asset.promptCard?.extractionMode === 'style' ? 'style' : 'replicate'
}

function promptExtractionModeLabel(mode: BrowserPromptExtractionMode): string {
  return BROWSER_PROMPT_EXTRACTION_MODE_LABELS[mode]
}

function promptAssetTitle(request: BrowserAssetPromptCaptureRequest, promptTitle?: string): string {
  const title = (promptTitle || request.title || request.pageTitle || '').trim()
  if (title) return title.slice(0, 48)
  if (promptExtractionModeFromRequest(request) === 'style') {
    return request.sourceType === 'screenshot' ? '网页截图风格' : '画面风格'
  }
  return request.sourceType === 'screenshot' ? '网页截图提示词' : '图片提示词'
}

function promptAssetSubtitle(asset: NomiBrowserAsset): string {
  const label = promptExtractionModeLabel(promptExtractionModeFromAsset(asset))
  if (asset.status === 'loading') return `正在提取${label}...`
  if (asset.status === 'error') return `${label}提取失败`
  return label
}

function referenceResultUrl(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return ''
  const record = raw as Record<string, unknown>
  return typeof record.referenceUrl === 'string' ? record.referenceUrl.trim() : ''
}

function referenceResultDataUrl(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return ''
  const record = raw as Record<string, unknown>
  return typeof record.dataUrl === 'string' ? record.dataUrl.trim() : ''
}

function createPromptCardAsset(input: {
  id: string
  request: BrowserAssetPromptCaptureRequest
  references: readonly BrowserAssetPromptReference[]
  prompt: string
  status: NomiBrowserAsset['status']
  title?: string
  savedAt?: string
}): NomiBrowserAsset {
  const savedAt = input.savedAt || new Date().toISOString()
  const previewUrl = input.references[0]?.url
  const extractionMode = promptExtractionModeFromRequest(input.request)
  const modeLabel = promptExtractionModeLabel(extractionMode)
  const asset: NomiBrowserAsset = {
    id: input.id,
    type: 'prompt',
    source: 'transcript',
    title: promptAssetTitle(input.request, input.title),
    tags: ['图片提示词', modeLabel],
    previewUrl,
    previewMediaType: previewUrl ? 'image' : undefined,
    status: input.status,
    promptCard: {
      referenceImages: input.references,
      prompt: input.prompt,
      promptType: 'image',
      extractionMode,
      savedAt,
    },
  }
  return {
    ...asset,
    subtitle: promptAssetSubtitle(asset),
  }
}

type BrowserPromptAssetTileProps = {
  asset: NomiBrowserAsset
  selected: boolean
  setNodeRef: (node: HTMLDivElement | null) => void
  onClick: (event: React.MouseEvent<HTMLDivElement>) => void
  onDoubleClick: (event: React.MouseEvent<HTMLDivElement>) => void
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void
}

type BrowserPromptDetailModalProps = {
  asset: NomiBrowserAsset
  promptCategories: readonly { id: string; label: string }[]
  onClose: () => void
}

function promptPreviewUrl(asset: NomiBrowserAsset): string {
  return asset.promptCard?.referenceImages[0]?.url || asset.previewUrl || ''
}

function promptTypeLabel(
  asset: NomiBrowserAsset,
  categories: readonly { id: string; label: string }[],
): string {
  const promptType = asset.promptCard?.promptType || 'image'
  return `${promptExtractionModeLabel(promptExtractionModeFromAsset(asset))} · ${getBrowserPromptTypeLabel(promptType, categories)}`
}

function promptCardText(asset: NomiBrowserAsset): string {
  const prompt = asset.promptCard?.prompt.trim()
  if (prompt) return prompt
  if (asset.status === 'loading') return '正在分析参考图并提取提示词...'
  if (asset.status === 'error') return '提示词提取失败'
  return '暂无提示词'
}

const BrowserPromptAssetTile = React.memo(function BrowserPromptAssetTile({
  asset,
  selected,
  setNodeRef,
  onClick,
  onDoubleClick,
  onContextMenu,
  onDragStart,
}: BrowserPromptAssetTileProps): JSX.Element {
  const previewUrl = promptPreviewUrl(asset)
  const loading = asset.status === 'loading'
  const failed = asset.status === 'error'
  const prompt = promptCardText(asset)

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      draggable
      data-browser-asset-tile="true"
      data-asset-id={asset.id}
      aria-label={asset.title}
      aria-selected={selected}
      aria-grabbed={selected}
      title={asset.title}
      className={cn(
        'group mb-2.5 min-w-0 break-inside-avoid overflow-hidden rounded-nomi border bg-nomi-paper text-left outline-none',
        'cursor-pointer select-none shadow-nomi-sm transition-[border-color,box-shadow,transform,background] duration-[var(--nomi-transition-fast)]',
        selected
          ? 'border-nomi-accent shadow-nomi-md ring-2 ring-nomi-accent ring-offset-1 ring-offset-nomi-paper'
          : 'border-nomi-line hover:border-nomi-ink-20 hover:bg-nomi-bg',
        failed && 'border-workbench-danger/45',
      )}
      style={{ breakInside: 'avoid' }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        event.currentTarget.click()
      }}
    >
      <div className={cn('relative overflow-hidden bg-nomi-ink-05', previewUrl ? 'aspect-[5/3]' : 'h-20')}>
        {previewUrl ? (
          <img src={previewUrl} alt="" draggable={false} className="block size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-nomi-ink-35">
            <IconPhoto size={26} stroke={1.5} aria-hidden="true" />
          </div>
        )}
        {loading ? (
          <div className="absolute inset-0 grid place-items-center bg-nomi-paper/74 text-nomi-ink-45 backdrop-blur-[1px]">
            <span className="size-5 animate-spin rounded-pill border-2 border-nomi-ink-20 border-t-nomi-accent" />
          </div>
        ) : null}
        {failed ? (
          <div className="absolute inset-0 grid place-items-center bg-workbench-danger-soft/85 text-workbench-danger">
            <IconFileText size={24} stroke={1.6} aria-hidden="true" />
          </div>
        ) : null}
        {selected ? (
          <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-pill bg-nomi-accent text-nomi-paper shadow-nomi-sm">
            <IconCheck size={13} stroke={2.2} aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <div className="grid gap-1.5 p-2">
        <div className="truncate text-micro font-semibold leading-[1.15] text-nomi-ink" title={asset.title}>
          {asset.title}
        </div>
        <div
          className={cn(
            'max-h-[58px] overflow-hidden rounded-nomi-sm border bg-nomi-bg px-2 py-1.5 text-micro leading-relaxed',
            failed ? 'border-workbench-danger/35 text-workbench-danger' : 'border-nomi-line-soft text-nomi-ink-65',
          )}
          style={{
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 3,
          }}
        >
          {prompt}
        </div>
      </div>
    </div>
  )
})

function BrowserPromptDetailModal({
  asset,
  promptCategories,
  onClose,
}: BrowserPromptDetailModalProps): JSX.Element {
  const [copied, setCopied] = React.useState(false)
  const references = asset.promptCard?.referenceImages ?? []
  const previewUrl = promptPreviewUrl(asset)
  const prompt = promptCardText(asset)
  const loading = asset.status === 'loading'
  const canUsePrompt = asset.status !== 'loading' && Boolean(asset.promptCard?.prompt.trim())

  const copyPrompt = React.useCallback(async (): Promise<void> => {
    if (!canUsePrompt) return
    try {
      await navigator.clipboard.writeText(asset.promptCard?.prompt.trim() || '')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }, [asset.promptCard?.prompt, canUsePrompt])

  return (
    <div
      className="absolute inset-0 z-[20] grid place-items-center bg-nomi-ink/38 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="提示词详情"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <motion.div
        className="flex max-h-full w-full max-w-[840px] flex-col overflow-hidden rounded-nomi-lg border border-nomi-line bg-nomi-paper shadow-nomi-lg"
        initial={{ opacity: 0, scale: 0.985, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
      >
        <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-nomi-line-soft px-4">
          <div className="min-w-0">
            <div className="truncate text-body-sm font-bold text-nomi-ink">提示词详情</div>
            <div className="mt-0.5 truncate text-micro text-nomi-ink-40">{asset.title}</div>
          </div>
          <button type="button" className={TOOL_BUTTON_CLASS} aria-label="关闭提示词详情" onClick={onClose}>
            <IconX size={17} stroke={1.8} aria-hidden="true" />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 gap-4 overflow-auto p-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
          <section className="grid min-h-0 gap-2">
            <div className="text-caption font-semibold text-nomi-ink-70">参考图片</div>
            <div className="relative min-h-[260px] overflow-hidden rounded-nomi border border-nomi-line bg-nomi-bg">
              {previewUrl ? (
                <img src={previewUrl} alt="" draggable={false} className="block size-full object-contain" />
              ) : (
                <div className="grid size-full min-h-[260px] place-items-center text-nomi-ink-35">
                  <IconPhoto size={34} stroke={1.45} aria-hidden="true" />
                </div>
              )}
              {loading ? (
                <div className="absolute inset-0 grid place-items-center bg-nomi-paper/70 backdrop-blur-[1px]">
                  <span className="size-6 animate-spin rounded-pill border-2 border-nomi-ink-20 border-t-nomi-accent" />
                </div>
              ) : null}
            </div>
            {references.length > 1 ? (
              <div className="grid grid-cols-4 gap-2">
                {references.slice(0, 8).map((reference, index) => (
                  <div
                    key={`${reference.url}-${index}`}
                    className="aspect-video overflow-hidden rounded-nomi-sm border border-nomi-line bg-nomi-bg"
                  >
                    <img src={reference.url} alt="" draggable={false} className="block size-full object-cover" />
                  </div>
                ))}
              </div>
            ) : null}
          </section>
          <section className="flex min-h-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-caption font-semibold text-nomi-ink-70">提示词</div>
              <span className="inline-flex h-6 items-center rounded-pill bg-nomi-ink-05 px-2 text-micro font-semibold text-nomi-ink-55">
                {promptTypeLabel(asset, promptCategories)}
              </span>
            </div>
            <textarea
              readOnly
              value={prompt}
              className={cn(
                'min-h-[260px] flex-1 resize-none rounded-nomi border bg-nomi-bg p-3 text-body-sm leading-relaxed outline-none',
                asset.status === 'error'
                  ? 'border-workbench-danger/35 text-workbench-danger'
                  : 'border-nomi-line text-nomi-ink-75',
              )}
            />
            <div className="flex items-center gap-2 text-caption text-nomi-ink-45">
              <span className="font-semibold text-nomi-ink-60">模型</span>
              <span className="rounded-pill bg-nomi-accent-soft px-2 py-1 text-micro font-semibold text-nomi-accent">
                当前文本模型
              </span>
            </div>
          </section>
        </div>
        <div className="flex min-h-14 shrink-0 items-center justify-end gap-2 border-t border-nomi-line-soft px-4">
          <button
            type="button"
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-nomi border border-nomi-line bg-nomi-paper px-3 text-caption font-semibold',
              'cursor-pointer text-nomi-ink-70 hover:bg-nomi-ink-05 hover:text-nomi-ink',
              !canUsePrompt && 'cursor-not-allowed opacity-45 hover:bg-nomi-paper',
            )}
            disabled={!canUsePrompt}
            onClick={() => {
              void copyPrompt()
            }}
          >
            <IconCopy size={15} stroke={1.8} aria-hidden="true" />
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

type BrowserPromptExtractionSettingsModalProps = {
  settings: BrowserPromptExtractionTemplateSettings
  projectAvailable: boolean
  onSave: (settings: BrowserPromptExtractionTemplateSettings) => void
  onClose: () => void
}

function updatePromptExtractionTemplate(
  settings: BrowserPromptExtractionTemplateSettings,
  mode: BrowserPromptExtractionMode,
  templateId: string,
  patch: Partial<Pick<BrowserPromptExtractionTemplate, 'title' | 'prompt'>>,
): BrowserPromptExtractionTemplateSettings {
  const updatedAt = new Date().toISOString()
  if (templateId === BROWSER_PROMPT_TEMPLATE_DEFAULT_IDS[mode]) {
    const current = settings.defaultOverrides[mode] ?? {}
    return normalizeBrowserPromptExtractionTemplateSettings({
      ...settings,
      defaultOverrides: {
        ...settings.defaultOverrides,
        [mode]: {
          ...current,
          ...patch,
          updatedAt,
        },
      },
      selectedTemplateIds: {
        ...settings.selectedTemplateIds,
        [mode]: templateId,
      },
    })
  }
  return normalizeBrowserPromptExtractionTemplateSettings({
    ...settings,
    selectedTemplateIds: {
      ...settings.selectedTemplateIds,
      [mode]: templateId,
    },
    customTemplates: {
      ...settings.customTemplates,
      [mode]: (settings.customTemplates[mode] ?? []).map((template) =>
        template.id === templateId ? { ...template, ...patch, updatedAt } : template,
      ),
    },
  })
}

function BrowserPromptExtractionSettingsModal({
  settings,
  projectAvailable,
  onSave,
  onClose,
}: BrowserPromptExtractionSettingsModalProps): JSX.Element {
  const [draft, setDraft] = React.useState(() => normalizeBrowserPromptExtractionTemplateSettings(settings))
  const [mode, setMode] = React.useState<BrowserPromptExtractionMode>('replicate')
  const selectedId = draft.selectedTemplateIds[mode] || BROWSER_PROMPT_TEMPLATE_DEFAULT_IDS[mode]
  const templates = browserPromptExtractionTemplatesForMode(draft, mode)
  const selectedTemplate = templates.find((template) => template.id === selectedId) ?? templates[0]
  const isDefaultTemplate = selectedTemplate.id === BROWSER_PROMPT_TEMPLATE_DEFAULT_IDS[mode]

  const selectTemplate = React.useCallback((templateId: string): void => {
    setDraft((current) => normalizeBrowserPromptExtractionTemplateSettings({
      ...current,
      selectedTemplateIds: {
        ...current.selectedTemplateIds,
        [mode]: templateId,
      },
    }))
  }, [mode])

  const updateTemplate = React.useCallback(
    (patch: Partial<Pick<BrowserPromptExtractionTemplate, 'title' | 'prompt'>>): void => {
      setDraft((current) => updatePromptExtractionTemplate(current, mode, selectedId, patch))
    },
    [mode, selectedId],
  )

  const addCustomTemplate = React.useCallback((): void => {
    const now = new Date().toISOString()
    const id = `custom:${mode}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const template: BrowserPromptExtractionTemplate = {
      id,
      title: `自定义${BROWSER_PROMPT_EXTRACTION_MODE_LABELS[mode]}`,
      prompt: selectedTemplate.prompt,
      createdAt: now,
      updatedAt: now,
    }
    setDraft((current) => normalizeBrowserPromptExtractionTemplateSettings({
      ...current,
      selectedTemplateIds: {
        ...current.selectedTemplateIds,
        [mode]: id,
      },
      customTemplates: {
        ...current.customTemplates,
        [mode]: [template, ...(current.customTemplates[mode] ?? [])],
      },
    }))
  }, [mode, selectedTemplate.prompt])

  const deleteSelectedTemplate = React.useCallback((): void => {
    if (isDefaultTemplate) return
    setDraft((current) => normalizeBrowserPromptExtractionTemplateSettings({
      ...current,
      selectedTemplateIds: {
        ...current.selectedTemplateIds,
        [mode]: BROWSER_PROMPT_TEMPLATE_DEFAULT_IDS[mode],
      },
      customTemplates: {
        ...current.customTemplates,
        [mode]: (current.customTemplates[mode] ?? []).filter((template) => template.id !== selectedId),
      },
    }))
  }, [isDefaultTemplate, mode, selectedId])

  const resetDefaultTemplate = React.useCallback((): void => {
    if (!isDefaultTemplate) return
    setDraft((current) => normalizeBrowserPromptExtractionTemplateSettings({
      ...current,
      defaultOverrides: Object.fromEntries(
        Object.entries(current.defaultOverrides).filter(([key]) => key !== mode),
      ) as BrowserPromptExtractionTemplateSettings['defaultOverrides'],
      selectedTemplateIds: {
        ...current.selectedTemplateIds,
        [mode]: BROWSER_PROMPT_TEMPLATE_DEFAULT_IDS[mode],
      },
    }))
  }, [isDefaultTemplate, mode])

  const dialog = (
    <div
      className="fixed inset-0 z-[3400] grid place-items-center bg-nomi-ink/38 p-5 font-nomi-sans text-nomi-ink backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="提示词提取设置"
      data-nomi-prompt-extraction-settings-dialog="true"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <motion.div
        className="flex h-[min(720px,calc(100vh-40px))] w-[min(920px,calc(100vw-40px))] flex-col overflow-hidden rounded-nomi-lg border border-nomi-line bg-nomi-paper shadow-nomi-lg"
        initial={{ opacity: 0, scale: 0.985, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
      >
        <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-nomi-line-soft px-4">
          <div className="min-w-0">
            <div className="truncate text-body-sm font-bold text-nomi-ink">提示词提取设置</div>
            <div className="mt-0.5 truncate text-micro text-nomi-ink-40">
              保存到当前项目 .nomi/browser-prompt-extraction.json
            </div>
          </div>
          <button type="button" className={TOOL_BUTTON_CLASS} aria-label="关闭提示词提取设置" onClick={onClose}>
            <IconX size={17} stroke={1.8} aria-hidden="true" />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 md:grid-cols-[220px_minmax(0,1fr)]">
          <section className="flex min-h-0 flex-col gap-3">
            <div className="grid grid-cols-2 gap-1 rounded-nomi bg-nomi-ink-05 p-1">
              {(['replicate', 'style'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={cn(
                    'h-8 rounded-nomi-sm border-0 bg-transparent px-2 text-caption font-semibold',
                    'cursor-pointer transition-colors duration-[var(--nomi-transition-fast)]',
                    mode === item ? 'bg-nomi-paper text-nomi-ink shadow-nomi-sm' : 'text-nomi-ink-55 hover:text-nomi-ink',
                  )}
                  onClick={() => setMode(item)}
                >
                  {BROWSER_PROMPT_EXTRACTION_MODE_LABELS[item]}
                </button>
              ))}
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto pr-1">
              {templates.map((template) => {
                const active = template.id === selectedTemplate.id
                return (
                  <button
                    key={template.id}
                    type="button"
                    className={cn(
                      'min-h-10 rounded-nomi border px-3 py-2 text-left text-caption font-semibold',
                      'cursor-pointer transition-colors duration-[var(--nomi-transition-fast)]',
                      active
                        ? 'border-nomi-accent bg-nomi-accent-soft text-nomi-accent'
                        : 'border-nomi-line bg-nomi-paper text-nomi-ink-65 hover:bg-nomi-ink-05 hover:text-nomi-ink',
                    )}
                    onClick={() => selectTemplate(template.id)}
                  >
                    <span className="block truncate">{template.title}</span>
                    {template.builtin ? <span className="mt-0.5 block text-micro text-nomi-ink-40">默认</span> : null}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-nomi border border-nomi-line bg-nomi-paper px-3 text-caption font-semibold text-nomi-ink-70 hover:bg-nomi-ink-05"
              onClick={addCustomTemplate}
            >
              <IconFolderPlus size={15} stroke={1.8} aria-hidden="true" />
              添加自定义
            </button>
          </section>
          <section className="flex min-h-0 flex-col gap-3">
            <label className="grid gap-1.5">
              <span className="text-caption font-semibold text-nomi-ink-65">名称</span>
              <input
                value={selectedTemplate.title}
                className="h-9 rounded-nomi border border-nomi-line bg-nomi-bg px-3 text-body-sm text-nomi-ink outline-none focus:border-nomi-accent"
                onChange={(event) => updateTemplate({ title: event.target.value })}
              />
            </label>
            <label className="flex min-h-0 flex-1 flex-col gap-1.5">
              <span className="text-caption font-semibold text-nomi-ink-65">提示词</span>
              <textarea
                value={selectedTemplate.prompt}
                className="min-h-[340px] flex-1 resize-none rounded-nomi border border-nomi-line bg-nomi-bg p-3 text-body-sm leading-relaxed text-nomi-ink outline-none focus:border-nomi-accent"
                onChange={(event) => updateTemplate({ prompt: event.target.value })}
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-caption text-nomi-ink-45">
                {projectAvailable ? '设置会随项目文件夹迁移' : '当前项目目录不可用，保存会失败'}
              </div>
              <div className="flex items-center gap-2">
                {isDefaultTemplate ? (
                  <button
                    type="button"
                    className="inline-flex h-9 items-center rounded-nomi border border-nomi-line bg-nomi-paper px-3 text-caption font-semibold text-nomi-ink-60 hover:bg-nomi-ink-05"
                    onClick={resetDefaultTemplate}
                  >
                    恢复默认
                  </button>
                ) : (
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-2 rounded-nomi border border-workbench-danger/35 bg-nomi-paper px-3 text-caption font-semibold text-workbench-danger hover:bg-workbench-danger-soft"
                    onClick={deleteSelectedTemplate}
                  >
                    <IconTrash size={15} stroke={1.8} aria-hidden="true" />
                    删除
                  </button>
                )}
                <button
                  type="button"
                  className="inline-flex h-9 items-center rounded-nomi border border-nomi-line bg-nomi-paper px-3 text-caption font-semibold text-nomi-ink-70 hover:bg-nomi-ink-05"
                  onClick={onClose}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-2 rounded-nomi border-0 bg-nomi-ink px-4 text-caption font-semibold text-nomi-paper hover:bg-nomi-accent"
                  onClick={() => onSave(normalizeBrowserPromptExtractionTemplateSettings(draft))}
                >
                  <IconCheck size={15} stroke={2} aria-hidden="true" />
                  保存
                </button>
              </div>
            </div>
          </section>
        </div>
      </motion.div>
    </div>
  )
  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body)
}

export function NomiBrowserAssetPopover({
  className,
  placement = 'absolute',
  surface = 'floating',
  opened,
  anchorRect,
  boundsRect,
  dockable,
  dockPresentation = 'overlay',
  defaultOpened = false,
  defaultSource = 'my',
  defaultTab = 'all',
  showTrigger = true,
  assets = NOMI_BROWSER_ASSETS,
  tabs = NOMI_BROWSER_ASSET_TABS,
  sourceTabs = NOMI_BROWSER_ASSET_SOURCES,
  onOpenChange,
  onWindowRectChange,
  onDockModeChange,
  onAssetSelect,
  onCreateFolder,
  onImportRemoteAsset,
  browserCaptureEnabled = false,
  browserCaptureDisabled = false,
  browserCaptureRequest,
  browserPromptCaptureRequest,
  onBrowserCaptureToggle,
}: NomiBrowserAssetPopoverProps): JSX.Element {
  const contained = surface === 'contained'
  const canDock = dockable ?? contained
  const [internalOpen, setInternalOpen] = React.useState(defaultOpened)
  const [activeSource, setActiveSource] = React.useState<NomiBrowserAssetSource>(defaultSource)
  const [activeTab, setActiveTab] = React.useState<NomiBrowserAssetTab>(defaultTab)
  const [activePromptCategory, setActivePromptCategory] = React.useState('all')
  const [query, setQuery] = React.useState('')
  const [localAssets, setLocalAssets] = React.useState<NomiBrowserAsset[]>([])
  const [persistedAssets, setPersistedAssets] = React.useState<NomiBrowserAsset[]>([])
  const [libraryState, setLibraryState] = React.useState<BrowserAssetLibraryState>(EMPTY_BROWSER_ASSET_LIBRARY_STATE)
  const [activeFolderId, setActiveFolderId] = React.useState<string | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set())
  const [marquee, setMarquee] = React.useState<MarqueeState | null>(null)
  const [filtersOpen, setFiltersOpen] = React.useState(false)
  const [actionsOpen, setActionsOpen] = React.useState(false)
  const [viewMode, setViewMode] = React.useState<AssetPopoverViewMode>('grid')
  const [sortAscending, setSortAscending] = React.useState(true)
  const [dockMode, setDockMode] = React.useState<AssetPopoverDockMode>(null)
  const [dropActive, setDropActive] = React.useState(false)
  const [assetContextMenu, setAssetContextMenu] = React.useState<AssetContextMenuState | null>(null)
  const [blankContextMenu, setBlankContextMenu] = React.useState<BlankContextMenuState | null>(null)
  const [promptDetailAssetId, setPromptDetailAssetId] = React.useState<string | null>(null)
  const [promptExtractionSettingsOpen, setPromptExtractionSettingsOpen] = React.useState(false)
  const [canvasImportAvailable, setCanvasImportAvailable] = React.useState(false)
  const [promptExtractionSettings, setPromptExtractionSettings] = React.useState<BrowserPromptExtractionTemplateSettings>(
    () => createDefaultBrowserPromptExtractionTemplateSettings(),
  )
  const [promptExtractionSettingsProjectAvailable, setPromptExtractionSettingsProjectAvailable] = React.useState(false)
  const popoverOpen = opened ?? internalOpen
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const [hostBounds, setHostBounds] = React.useState<FloatingWindowBoundsRect | null>(null)
  const previousFloatingRectRef = React.useRef<FloatingWindowRect | null>(null)
  const windowInteractionEndRef = React.useRef<((event: FloatingWindowInteractionEndEvent) => void) | null>(null)
  const handleHookInteractionEnd = React.useCallback((event: FloatingWindowInteractionEndEvent): void => {
    windowInteractionEndRef.current?.(event)
  }, [])
  const activeBounds = boundsRect ?? (contained ? hostBounds : null)
  const hostOrigin = contained ? (hostBounds ?? activeBounds) : null
  const splitDocked = contained && dockPresentation === 'split' && Boolean(dockMode)
  const edgeDocked = contained && dockPresentation === 'edge' && Boolean(dockMode)
  const dockGap = edgeDocked ? 0 : DOCK_GAP

  const {
    rect: windowRect,
    isInteracting: isWindowInteracting,
    setRect: setWindowRect,
    startMove,
    startResize,
  } = useResizableFloatingWindow(popoverOpen, anchorRect, activeBounds, {
    onInteractionEnd: handleHookInteractionEnd,
  })

  const dockAssetWindow = React.useCallback(
    (nextDockMode: Exclude<AssetPopoverDockMode, null>, sourceRect?: FloatingWindowRect): void => {
      if (!canDock || !activeBounds) return
      const floatingRect = sourceRect ?? previousFloatingRectRef.current ?? windowRect
      previousFloatingRectRef.current = floatingRect
      const dockedRect = createDockedWindowRect(
        activeBounds,
        nextDockMode,
        Math.min(floatingRect.width, DOCK_DEFAULT_WIDTH),
        dockGap,
      )
      setDockMode(nextDockMode)
      setWindowRect(dockedRect)
    },
    [activeBounds, canDock, dockGap, setWindowRect, windowRect],
  )

  const restoreFloatingWindow = React.useCallback((): void => {
    const nextRect = previousFloatingRectRef.current ?? createInitialFloatingWindowRect(anchorRect, activeBounds)
    previousFloatingRectRef.current = null
    setDockMode(null)
    setWindowRect(nextRect)
  }, [activeBounds, anchorRect, setWindowRect])

  const handleWindowInteractionEnd = React.useCallback(
    (event: FloatingWindowInteractionEndEvent): void => {
      if (!canDock || dockMode || !activeBounds || event.type !== 'move') return
      const leftGap = event.rect.left - activeBounds.left
      const rightGap = activeBounds.right - (event.rect.left + event.rect.width)
      if (leftGap <= DOCK_EDGE_THRESHOLD) {
        dockAssetWindow('left', event.rect)
        return
      }
      if (rightGap <= DOCK_EDGE_THRESHOLD) {
        dockAssetWindow('right', event.rect)
      }
    },
    [activeBounds, canDock, dockAssetWindow, dockMode],
  )

  React.useEffect(() => {
    windowInteractionEndRef.current = handleWindowInteractionEnd
  }, [handleWindowInteractionEnd])

  const compactToolbar = windowRect.width <= 560
  const singleTileToolbar = windowRect.width <= 220
  const listMode = viewMode === 'list'
  const gridCompact = compactToolbar
  const assetGridColumnCount = getAssetGridColumnCount(windowRect.width, gridCompact)
  const promptMasonryColumnCount = getPromptMasonryColumnCount(windowRect.width)
  const sourceTabGridStyle = React.useMemo<React.CSSProperties>(
    () => ({ gridTemplateColumns: `repeat(${Math.max(sourceTabs.length, 1)}, minmax(0, 1fr))` }),
    [sourceTabs.length],
  )
  const assetGridStyle = React.useMemo<React.CSSProperties | undefined>(
    () =>
      listMode
        ? undefined
        : {
            gridTemplateColumns: `repeat(${assetGridColumnCount}, minmax(0, 1fr))`,
          },
    [assetGridColumnCount, listMode],
  )
  const promptMasonryStyle = React.useMemo<React.CSSProperties>(
    () => ({
      columnCount: promptMasonryColumnCount,
      columnGap: PROMPT_MASONRY_COLUMN_GAP,
    }),
    [promptMasonryColumnCount],
  )
  const toolbarButtonClass = compactToolbar ? TOOL_BUTTON_COMPACT_CLASS : TOOL_BUTTON_CLASS
  const activeResizeEdges = React.useMemo<readonly FloatingWindowResizeEdge[]>(() => {
    if (splitDocked) return []
    if (dockMode === 'left') return ['e']
    if (dockMode === 'right') return ['w']
    return FLOATING_WINDOW_RESIZE_EDGES
  }, [dockMode, splitDocked])
  const gridRef = React.useRef<HTMLDivElement | null>(null)
  const marqueeRef = React.useRef<MarqueeState | null>(null)
  const marqueePointerRef = React.useRef<MarqueePointerState | null>(null)
  const marqueeAutoScrollFrameRef = React.useRef<number | null>(null)
  const filterPopoverRef = React.useRef<HTMLDivElement | null>(null)
  const filterButtonRef = React.useRef<HTMLButtonElement | null>(null)
  const actionsPopoverRef = React.useRef<HTMLDivElement | null>(null)
  const actionsButtonRef = React.useRef<HTMLButtonElement | null>(null)
  const assetContextMenuRef = React.useRef<HTMLDivElement | null>(null)
  const blankContextMenuRef = React.useRef<HTMLDivElement | null>(null)
  const uploadInputRef = React.useRef<HTMLInputElement | null>(null)
  const itemRefs = React.useRef(new Map<string, HTMLDivElement>())
  const folderCountRef = React.useRef(0)
  const previewUrlsRef = React.useRef<string[]>([])
  const handledCaptureRequestIdRef = React.useRef<string | null>(null)
  const handledPromptRequestIdRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!onWindowRectChange) return
    if (!popoverOpen) {
      onWindowRectChange(null)
      return
    }
    onWindowRectChange({
      left: windowRect.left,
      top: windowRect.top,
      right: windowRect.left + windowRect.width,
      bottom: windowRect.top + windowRect.height,
      width: windowRect.width,
      height: windowRect.height,
    })
  }, [onWindowRectChange, popoverOpen, windowRect])

  React.useEffect(() => {
    onDockModeChange?.(popoverOpen ? dockMode : null)
  }, [dockMode, onDockModeChange, popoverOpen])

  React.useEffect(() => {
    if (popoverOpen) return
    setDockMode(null)
    previousFloatingRectRef.current = null
  }, [popoverOpen])

  React.useEffect(() => {
    if (!popoverOpen || !dockMode || !activeBounds) return
    if (splitDocked) {
      setWindowRect({
        left: activeBounds.left,
        top: activeBounds.top,
        width: activeBounds.width,
        height: activeBounds.height,
      })
      return
    }
    setWindowRect((current) => createDockedWindowRect(activeBounds, dockMode, current.width, dockGap))
  }, [activeBounds, dockGap, dockMode, popoverOpen, setWindowRect, splitDocked])

  React.useLayoutEffect(() => {
    if (!contained) {
      setHostBounds(null)
      return undefined
    }
    const node = rootRef.current
    if (!node) return undefined
    const updateHostBounds = (): void => {
      const rect = node.getBoundingClientRect()
      setHostBounds({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      })
    }
    updateHostBounds()
    const observer = new ResizeObserver(updateHostBounds)
    observer.observe(node)
    window.addEventListener('resize', updateHostBounds)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateHostBounds)
    }
  }, [contained])

  const setPopoverOpen = React.useCallback(
    (nextOpen: boolean): void => {
      if (opened === undefined) setInternalOpen(nextOpen)
      onOpenChange?.(nextOpen)
    },
    [onOpenChange, opened],
  )

  const toggleDockMode = React.useCallback((): void => {
    if (!canDock) return
    if (dockMode) {
      restoreFloatingWindow()
      return
    }
    dockAssetWindow('right', windowRect)
  }, [canDock, dockAssetWindow, dockMode, restoreFloatingWindow, windowRect])

  const updateLibraryState = React.useCallback(
    (updater: (current: BrowserAssetLibraryState) => BrowserAssetLibraryState): void => {
      const projectId = getDesktopActiveProjectId()
      setLibraryState((current) => {
        const next = updater(current)
        writeBrowserAssetLibraryState(projectId, next)
        return next
      })
    },
    [],
  )

  React.useEffect(
    () => () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      previewUrlsRef.current = []
    },
    [],
  )

  React.useEffect(() => {
    if (!popoverOpen) return
    const handleMouseDown = (event: MouseEvent): void => {
      const target = event.target as Node
      const targetElement = target instanceof HTMLElement ? target : target.parentElement
      if (rootRef.current?.contains(target)) return
      if (targetElement?.closest(PROMPT_EXTRACTION_SETTINGS_DIALOG_SELECTOR)) return
      setPopoverOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [popoverOpen, setPopoverOpen])

  React.useEffect(() => {
    if (!popoverOpen) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (promptExtractionSettingsOpen) {
        setPromptExtractionSettingsOpen(false)
        return
      }
      if (promptDetailAssetId) {
        setPromptDetailAssetId(null)
        return
      }
      if (assetContextMenu) {
        setAssetContextMenu(null)
        return
      }
      if (blankContextMenu) {
        setBlankContextMenu(null)
        return
      }
      setPopoverOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [assetContextMenu, blankContextMenu, popoverOpen, promptDetailAssetId, promptExtractionSettingsOpen, setPopoverOpen])

  React.useEffect(() => {
    if (!popoverOpen) {
      setFiltersOpen(false)
      setActionsOpen(false)
      setAssetContextMenu(null)
      setBlankContextMenu(null)
      setPromptDetailAssetId(null)
      setPromptExtractionSettingsOpen(false)
      setCanvasImportAvailable(false)
    }
  }, [popoverOpen])

  React.useEffect(() => {
    if (!popoverOpen || contained || typeof document === 'undefined') {
      setCanvasImportAvailable(false)
      return undefined
    }
    const updateCanvasImportAvailability = (): void => {
      setCanvasImportAvailable(
        Boolean(document.querySelector(CANVAS_IMPORT_TARGET_SELECTOR)) &&
          !document.querySelector(BROWSER_DIALOG_ROOT_SELECTOR),
      )
    }
    updateCanvasImportAvailability()
    const observer = new MutationObserver(updateCanvasImportAvailability)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-nomi-generation-canvas-import-target'],
    })
    return () => observer.disconnect()
  }, [contained, popoverOpen])

  React.useEffect(() => {
    if (!popoverOpen) return undefined
    let cancelled = false

    const loadPersistedAssets = async (): Promise<void> => {
      const projectId = getDesktopActiveProjectId()
      const desktop = getDesktopBridge()
      const nextLibraryState = readBrowserAssetLibraryState(projectId)
      if (!cancelled) {
        setPersistedAssets([])
        setLibraryState(nextLibraryState)
        if (activeFolderId && !nextLibraryState.folders.some((folder) => folder.id === activeFolderId)) {
          setActiveFolderId(null)
        }
      }
      if (!projectId || !desktop?.assets?.list) {
        if (!cancelled) setPersistedAssets([])
        return
      }

      try {
        const loaded: NomiBrowserAsset[] = []
        let cursor: string | null = null
        do {
          const page = await desktop.assets.list({
            projectId,
            cursor,
            limit: PERSISTED_ASSET_PAGE_LIMIT,
          })
          for (const asset of page.items) {
            if (!shouldShowDesktopAssetInBrowserPopover(asset, nextLibraryState)) continue
            const mapped = browserAssetFromDesktopAsset(asset)
            if (mapped) loaded.push(mapped)
          }
          cursor = page.cursor
        } while (cursor)

        if (!cancelled) setPersistedAssets(mergeBrowserAssetGroups(loaded))
      } catch {
        if (!cancelled) setPersistedAssets([])
      }
    }

    void loadPersistedAssets()
    return () => {
      cancelled = true
    }
  }, [activeFolderId, popoverOpen])

  const loadPromptExtractionSettings = React.useCallback(async (): Promise<void> => {
    const projectId = getDesktopActiveProjectId()
    const browserBridge = getDesktopBridge()?.browser
    setPromptExtractionSettingsProjectAvailable(Boolean(projectId && browserBridge?.readPromptExtractionSettings))
    if (!projectId || !browserBridge?.readPromptExtractionSettings) {
      setPromptExtractionSettings(createDefaultBrowserPromptExtractionTemplateSettings())
      return
    }
    try {
      const result = await browserBridge.readPromptExtractionSettings({ projectId })
      const normalized = normalizeBrowserPromptExtractionTemplateSettings(result?.settings)
      setPromptExtractionSettings(normalized)
      if (!result?.settings && browserBridge.writePromptExtractionSettings) {
        void browserBridge.writePromptExtractionSettings({
          projectId,
          settings: normalized,
        }).catch(() => undefined)
      }
    } catch {
      setPromptExtractionSettings(createDefaultBrowserPromptExtractionTemplateSettings())
    }
  }, [])

  React.useEffect(() => {
    if (!popoverOpen) return
    void loadPromptExtractionSettings()
  }, [loadPromptExtractionSettings, popoverOpen])

  const savePromptExtractionSettings = React.useCallback(
    (settings: BrowserPromptExtractionTemplateSettings): void => {
      const normalized = normalizeBrowserPromptExtractionTemplateSettings(settings)
      setPromptExtractionSettings(normalized)
      setPromptExtractionSettingsOpen(false)
      const projectId = getDesktopActiveProjectId()
      const browserBridge = getDesktopBridge()?.browser
      setPromptExtractionSettingsProjectAvailable(Boolean(projectId && browserBridge?.writePromptExtractionSettings))
      if (!projectId || !browserBridge?.writePromptExtractionSettings) return
      void browserBridge.writePromptExtractionSettings({
        projectId,
        settings: normalized,
      }).catch(() => {
        // Best effort; in-memory settings remain active for the current session.
      })
    },
    [],
  )

  React.useEffect(() => {
    const handleLibraryUpdated = (): void => {
      const projectId = getDesktopActiveProjectId()
      const nextLibraryState = readBrowserAssetLibraryState(projectId)
      setLibraryState(nextLibraryState)
      if (activeFolderId && !nextLibraryState.folders.some((folder) => folder.id === activeFolderId)) {
        setActiveFolderId(null)
      }
    }
    window.addEventListener(BROWSER_ASSET_LIBRARY_UPDATED_EVENT, handleLibraryUpdated)
    return () => window.removeEventListener(BROWSER_ASSET_LIBRARY_UPDATED_EVENT, handleLibraryUpdated)
  }, [activeFolderId])

  const deletedAssetKeySet = React.useMemo(
    () => new Set(libraryState.deletedAssetKeys),
    [libraryState.deletedAssetKeys],
  )

  const mergedAssets = React.useMemo(
    () =>
      mergeBrowserAssetGroups(libraryState.folders, libraryState.promptCards, localAssets, persistedAssets, assets)
        .filter((asset) => !deletedAssetKeySet.has(browserAssetStorageKey(asset)))
        .map((asset) => {
          if (asset.type === 'folder') return { ...asset, parentFolderId: asset.parentFolderId ?? null }
          const assignedFolderId = libraryState.folderAssignments[browserAssetStorageKey(asset)]
          return {
            ...asset,
            parentFolderId: assignedFolderId === undefined ? (asset.parentFolderId ?? null) : assignedFolderId,
          }
        }),
    [
      assets,
      deletedAssetKeySet,
      libraryState.folderAssignments,
      libraryState.folders,
      libraryState.promptCards,
      localAssets,
      persistedAssets,
    ],
  )

  const allFolderIds = React.useMemo(
    () => new Set(mergedAssets.filter((asset) => asset.type === 'folder').map((asset) => asset.id)),
    [mergedAssets],
  )

  React.useEffect(() => {
    if (!activeFolderId || allFolderIds.has(activeFolderId)) return
    setActiveFolderId(null)
  }, [activeFolderId, allFolderIds])

  const assetsWithFolderSummaries = React.useMemo(() => {
    const childMap = new Map<string, NomiBrowserAsset[]>()
    for (const asset of mergedAssets) {
      const parentFolderId = asset.parentFolderId ?? null
      if (!parentFolderId) continue
      const children = childMap.get(parentFolderId)
      if (children) children.push(asset)
      else childMap.set(parentFolderId, [asset])
    }
    return mergedAssets.map((asset) => {
      if (asset.type !== 'folder') return asset
      const children = childMap.get(asset.id) ?? []
      const previewChild = children.find((child) => child.previewUrl || child.preview)
      const previewMediaType: NomiBrowserAsset['previewMediaType'] =
        previewChild?.previewMediaType ??
        (previewChild?.type === 'video' ? 'video' : previewChild?.type === 'image' || previewChild?.promptCard ? 'image' : undefined)
      return {
        ...asset,
        count: children.length,
        subtitle: '文件夹',
        previewUrl: previewChild?.previewUrl,
        preview: previewChild?.preview,
        previewMediaType,
      }
    })
  }, [mergedAssets])

  const currentFolder = React.useMemo(
    () => assetsWithFolderSummaries.find((asset) => asset.type === 'folder' && asset.id === activeFolderId) ?? null,
    [activeFolderId, assetsWithFolderSummaries],
  )

  const folderBreadcrumbs = React.useMemo(() => {
    if (!currentFolder) return []
    const folderById = new Map<string, NomiBrowserAsset>()
    for (const asset of assetsWithFolderSummaries) {
      if (asset.type === 'folder') folderById.set(asset.id, asset)
    }

    const breadcrumbs: NomiBrowserAsset[] = []
    const seenIds = new Set<string>()
    let folder: NomiBrowserAsset | null = currentFolder
    while (folder && !seenIds.has(folder.id)) {
      breadcrumbs.unshift(folder)
      seenIds.add(folder.id)
      const parentFolderId: string | null = folder.parentFolderId ?? null
      folder = parentFolderId ? (folderById.get(parentFolderId) ?? null) : null
    }
    return breadcrumbs
  }, [assetsWithFolderSummaries, currentFolder])

  const folderScopedAssets = React.useMemo(
    () => assetsWithFolderSummaries.filter((asset) => (asset.parentFolderId ?? null) === activeFolderId),
    [activeFolderId, assetsWithFolderSummaries],
  )

  const promptLibrarySourceKey = React.useMemo(
    () => sourceTabs.find((source) => source.label === '提示词库')?.key ?? 'transcript',
    [sourceTabs],
  )
  const showingPromptLibrary = activeSource === promptLibrarySourceKey

  const promptCategories = React.useMemo(() => {
    const seen = new Set(DEFAULT_BROWSER_PROMPT_CATEGORIES.map((category) => category.id))
    return [
      ...DEFAULT_BROWSER_PROMPT_CATEGORIES,
      ...libraryState.promptCategories.filter((category) => {
        if (seen.has(category.id)) return false
        seen.add(category.id)
        return true
      }),
    ]
  }, [libraryState.promptCategories])

  const filterBaseAssets = React.useMemo(
    () => filterNomiBrowserAssets(folderScopedAssets, { source: activeSource, activeTab: 'all', query }),
    [activeSource, folderScopedAssets, query],
  )

  const filterCounts = React.useMemo(() => {
    const next = new Map<NomiBrowserAssetTab, number>()
    next.set('all', filterBaseAssets.length)
    for (const asset of filterBaseAssets) {
      next.set(asset.type, (next.get(asset.type) ?? 0) + 1)
    }
    return next
  }, [filterBaseAssets])

  const promptCategoryCounts = React.useMemo(() => {
    const next = new Map<string, number>()
    const promptAssets = filterNomiBrowserAssets(folderScopedAssets, { source: 'transcript', activeTab: 'prompt', query })
    next.set('all', promptAssets.length)
    for (const asset of promptAssets) {
      const promptType = asset.promptCard?.promptType || 'image'
      next.set(promptType, (next.get(promptType) ?? 0) + 1)
    }
    return next
  }, [folderScopedAssets, query])

  const filteredAssets = React.useMemo(() => {
    const visible = showingPromptLibrary
      ? filterNomiBrowserAssets(folderScopedAssets, {
          source: 'transcript',
          activeTab: 'prompt',
          query,
        }).filter((asset) => activePromptCategory === 'all' || (asset.promptCard?.promptType || 'image') === activePromptCategory)
      : filterNomiBrowserAssets(folderScopedAssets, {
          source: activeSource,
          activeTab,
          query,
        })
    return [...visible].sort((left, right) => {
      const folderBias = Number(right.type === 'folder') - Number(left.type === 'folder')
      if (folderBias !== 0) return folderBias
      const result = left.title.localeCompare(right.title, 'zh-CN')
      return sortAscending ? result : -result
    })
  }, [activePromptCategory, activeSource, activeTab, folderScopedAssets, query, showingPromptLibrary, sortAscending])

  const visibleIdSet = React.useMemo(() => new Set(filteredAssets.map((asset) => asset.id)), [filteredAssets])

  const selectedAssets = React.useMemo(
    () => mergedAssets.filter((asset) => selectedIds.has(asset.id)),
    [mergedAssets, selectedIds],
  )

  const assetById = React.useMemo(() => {
    const next = new Map<string, NomiBrowserAsset>()
    for (const asset of mergedAssets) next.set(asset.id, asset)
    return next
  }, [mergedAssets])

  const promptDetailAsset = React.useMemo(() => {
    if (!promptDetailAssetId) return null
    const asset = assetById.get(promptDetailAssetId)
    return asset?.promptCard ? asset : null
  }, [assetById, promptDetailAssetId])

  const activeSourceLabel = React.useMemo(
    () => sourceTabs.find((source) => source.key === activeSource)?.label || '素材',
    [activeSource, sourceTabs],
  )
  const filterActive = showingPromptLibrary ? activePromptCategory !== 'all' : activeTab !== 'all'

  const emptyStateCopy = React.useMemo(() => {
    const filtered = Boolean(query.trim()) || filterActive
    if (filtered) {
      return {
        title: '没有匹配的素材',
        description: '换个分类或搜索词试试。',
      }
    }
    if (currentFolder) {
      return {
        title: '文件夹还是空的',
        description: '拖入素材，或把已选素材移动到这里。',
      }
    }
    if (showingPromptLibrary) {
      return {
        title: '还没有提示词',
        description: '从浏览器图片或截图提取提示词后会出现在这里。',
      }
    }
    return {
      title: '还没有素材',
      description: '上传本地文件，或在浏览器里捕捞图片和视频。',
    }
  }, [currentFolder, filterActive, query, showingPromptLibrary])

  React.useEffect(() => {
    if (sourceTabs.some((source) => source.key === activeSource)) return
    const fallbackSource = sourceTabs[0]?.key
    if (fallbackSource) setActiveSource(fallbackSource)
  }, [activeSource, sourceTabs])

  React.useEffect(() => {
    if (!filtersOpen) return
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (filterPopoverRef.current?.contains(target)) return
      if (filterButtonRef.current?.contains(target)) return
      setFiltersOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [filtersOpen])

  React.useEffect(() => {
    if (!actionsOpen) return
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (actionsPopoverRef.current?.contains(target)) return
      if (actionsButtonRef.current?.contains(target)) return
      setActionsOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [actionsOpen])

  React.useEffect(() => {
    if (!assetContextMenu) return
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (assetContextMenuRef.current?.contains(target)) return
      setAssetContextMenu(null)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [assetContextMenu])

  React.useEffect(() => {
    if (!blankContextMenu) return
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (blankContextMenuRef.current?.contains(target)) return
      setBlankContextMenu(null)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [blankContextMenu])

  React.useEffect(() => {
    if (!compactToolbar) setActionsOpen(false)
  }, [compactToolbar])

  React.useEffect(() => {
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => visibleIdSet.has(id)))
      return next.size === current.size ? current : next
    })
  }, [visibleIdSet])

  React.useEffect(() => {
    if (!assetContextMenu) return
    if (visibleIdSet.has(assetContextMenu.assetId)) return
    setAssetContextMenu(null)
  }, [assetContextMenu, visibleIdSet])

  const setAssetNode = React.useCallback((id: string, node: HTMLDivElement | null): void => {
    if (node) itemRefs.current.set(id, node)
    else itemRefs.current.delete(id)
  }, [])

  const createFolder = React.useCallback(() => {
    setBlankContextMenu(null)
    setAssetContextMenu(null)
    folderCountRef.current += 1
    const nextFolderIndex = libraryState.folders.length + folderCountRef.current
    const folder: NomiBrowserAsset = {
      id: `local-folder-${Date.now()}-${folderCountRef.current}`,
      type: 'folder',
      source: 'my',
      title: nextFolderIndex === 1 ? '新建文件夹' : `新建文件夹 ${nextFolderIndex}`,
      subtitle: '文件夹',
      count: 0,
      tags: ['文件夹'],
      parentFolderId: activeFolderId,
    }
    setActiveSource('my')
    setActiveTab('all')
    updateLibraryState((current) => ({ ...current, folders: [folder, ...current.folders] }))
    setSelectedIds(new Set([folder.id]))
    onCreateFolder?.(folder)
  }, [activeFolderId, libraryState.folders.length, onCreateFolder, updateLibraryState])

  const addLocalFiles = React.useCallback(
    (files: readonly File[]): void => {
      const fileList = [...files]
      if (fileList.length === 0) return
      const projectId = getDesktopActiveProjectId()
      const desktopAssets = getDesktopBridge()?.assets
      const persistImport =
        projectId && desktopAssets?.importFile ? { projectId, importFile: desktopAssets.importFile } : null
      const uploaded = fileList.map((file, index): NomiBrowserAsset => {
        const type = assetTypeFromFile(file)
        let previewUrl: string | undefined
        if (type === 'image') {
          previewUrl = URL.createObjectURL(file)
          previewUrlsRef.current.push(previewUrl)
        }
        return {
          id: `local-upload-${Date.now()}-${index}`,
          type,
          source: 'my',
          title: file.name || '未命名素材',
          subtitle: persistImport ? '保存中...' : type === 'prompt' ? '本地文本' : '本地导入',
          previewUrl,
          tags: ['本地导入'],
          parentFolderId: activeFolderId,
          status: persistImport ? 'loading' : undefined,
        }
      })
      setActiveSource('my')
      setActiveTab('all')
      setLocalAssets((current) => [...uploaded, ...current])
      setSelectedIds(new Set(uploaded.map((asset) => asset.id)))

      if (!persistImport) return

      uploaded.forEach((pendingAsset, index) => {
        const file = fileList[index]
        if (!file) return
        void (async () => {
          try {
            const bytes = await file.arrayBuffer()
            const persisted = await persistImport.importFile({
              projectId: persistImport.projectId,
              fileName: file.name || pendingAsset.title || 'asset',
              contentType: contentTypeFromFile(file),
              bytes,
              kind: 'browser-upload',
            })
            const mapped = browserAssetFromDesktopAsset(persisted)
            const readyAsset: NomiBrowserAsset = {
              ...(mapped ?? pendingAsset),
              parentFolderId: activeFolderId,
              status: 'ready',
              subtitle: mapped?.subtitle ?? (pendingAsset.type === 'prompt' ? '本地文本' : '本地导入'),
            }
            setLocalAssets((current) => current.map((asset) => (asset.id === pendingAsset.id ? readyAsset : asset)))
            setPersistedAssets((current) => upsertBrowserAsset(current, readyAsset))
            updateLibraryState((current) => ({
              ...current,
              folderAssignments: {
                ...current.folderAssignments,
                [browserAssetStorageKey(readyAsset)]: activeFolderId,
              },
            }))
            setSelectedIds((current) => {
              if (!current.has(pendingAsset.id)) return current
              const next = new Set(current)
              next.delete(pendingAsset.id)
              next.add(readyAsset.id)
              return next
            })
          } catch {
            setLocalAssets((current) =>
              current.map((asset) =>
                asset.id === pendingAsset.id ? { ...asset, subtitle: '保存失败', status: 'error' } : asset,
              ),
            )
          }
        })()
      })
    },
    [activeFolderId, updateLibraryState],
  )

  const handleUploadFiles = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.currentTarget.files ?? [])
      event.currentTarget.value = ''
      addLocalFiles(files)
    },
    [addLocalFiles],
  )

  const selectAsset = React.useCallback(
    (asset: NomiBrowserAsset, event: React.MouseEvent<HTMLDivElement>) => {
      setAssetContextMenu(null)
      setBlankContextMenu(null)
      setSelectedIds((current) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) {
          const next = new Set(current)
          if (next.has(asset.id)) next.delete(asset.id)
          else next.add(asset.id)
          return next
        }
        return new Set([asset.id])
      })
      onAssetSelect?.(asset)
    },
    [onAssetSelect],
  )

  const openAssetContextMenu = React.useCallback(
    (asset: NomiBrowserAsset, event: React.MouseEvent<HTMLDivElement>): void => {
      event.preventDefault()
      event.stopPropagation()
      setFiltersOpen(false)
      setActionsOpen(false)
      setBlankContextMenu(null)
      setSelectedIds((current) => (current.has(asset.id) ? current : new Set([asset.id])))
      onAssetSelect?.(asset)
      setAssetContextMenu({
        assetId: asset.id,
        x: clampNumber(
          event.clientX - windowRect.left,
          ASSET_CONTEXT_MENU_MARGIN,
          Math.max(ASSET_CONTEXT_MENU_MARGIN, windowRect.width - ASSET_CONTEXT_MENU_WIDTH - ASSET_CONTEXT_MENU_MARGIN),
        ),
        y: clampNumber(
          event.clientY - windowRect.top,
          ASSET_CONTEXT_MENU_MARGIN,
          Math.max(
            ASSET_CONTEXT_MENU_MARGIN,
            windowRect.height - ASSET_CONTEXT_MENU_ESTIMATED_HEIGHT - ASSET_CONTEXT_MENU_MARGIN,
          ),
        ),
      })
    },
    [onAssetSelect, windowRect.height, windowRect.left, windowRect.top, windowRect.width],
  )

  const openBlankContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>): void => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-browser-asset-tile="true"],button,input,textarea,select,[contenteditable="true"]')) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      setFiltersOpen(false)
      setActionsOpen(false)
      setAssetContextMenu(null)
      setSelectedIds(new Set())
      setBlankContextMenu({
        x: clampNumber(
          event.clientX - windowRect.left,
          ASSET_CONTEXT_MENU_MARGIN,
          Math.max(ASSET_CONTEXT_MENU_MARGIN, windowRect.width - BLANK_CONTEXT_MENU_WIDTH - ASSET_CONTEXT_MENU_MARGIN),
        ),
        y: clampNumber(
          event.clientY - windowRect.top,
          ASSET_CONTEXT_MENU_MARGIN,
          Math.max(
            ASSET_CONTEXT_MENU_MARGIN,
            windowRect.height - BLANK_CONTEXT_MENU_ESTIMATED_HEIGHT - ASSET_CONTEXT_MENU_MARGIN,
          ),
        ),
      })
    },
    [windowRect.height, windowRect.left, windowRect.top, windowRect.width],
  )

  const openPromptDetail = React.useCallback((asset: NomiBrowserAsset): void => {
    if (!asset.promptCard) return
    setPromptDetailAssetId(asset.id)
  }, [])

  const openFolder = React.useCallback((folder: NomiBrowserAsset): void => {
    if (folder.type !== 'folder') return
    setActiveFolderId(folder.id)
    setActiveTab('all')
    setSelectedIds(new Set())
    setAssetContextMenu(null)
    setBlankContextMenu(null)
  }, [])

  const openAssetRoot = React.useCallback((): void => {
    setActiveFolderId(null)
    setActiveTab('all')
    setSelectedIds(new Set())
    setAssetContextMenu(null)
    setBlankContextMenu(null)
  }, [])

  const exitCurrentFolder = React.useCallback((): void => {
    const parentFolderId = currentFolder?.parentFolderId ?? null
    setActiveFolderId(parentFolderId)
    setActiveTab('all')
    setActivePromptCategory('all')
    setSelectedIds(new Set())
    setAssetContextMenu(null)
    setBlankContextMenu(null)
  }, [currentFolder?.parentFolderId])

  const selectAssetSource = React.useCallback(
    (source: NomiBrowserAssetSource): void => {
      setActiveSource(source)
      setActiveTab(source === promptLibrarySourceKey ? 'prompt' : 'all')
      setActivePromptCategory('all')
      setActiveFolderId(null)
      setSelectedIds(new Set())
      setAssetContextMenu(null)
      setBlankContextMenu(null)
    },
    [promptLibrarySourceKey],
  )

  const deleteSelectedAssets = React.useCallback((): void => {
    if (selectedIds.size === 0) return
    setAssetContextMenu(null)
    setBlankContextMenu(null)
    const selectedIdSet = new Set(selectedIds)
    const folderIdsToDelete = new Set<string>()
    const collectFolder = (folderId: string): void => {
      if (folderIdsToDelete.has(folderId)) return
      folderIdsToDelete.add(folderId)
      for (const asset of mergedAssets) {
        if (asset.type === 'folder' && (asset.parentFolderId ?? null) === folderId) collectFolder(asset.id)
      }
    }
    for (const id of selectedIdSet) {
      const asset = assetById.get(id)
      if (asset?.type === 'folder') collectFolder(asset.id)
    }

    const deletedKeys = new Set<string>()
    for (const asset of mergedAssets) {
      if (selectedIdSet.has(asset.id) && asset.type !== 'folder') deletedKeys.add(browserAssetStorageKey(asset))
      if (asset.parentFolderId && folderIdsToDelete.has(asset.parentFolderId) && asset.type !== 'folder') {
        deletedKeys.add(browserAssetStorageKey(asset))
      }
    }

    updateLibraryState((current) => {
      const nextDeletedKeys = new Set(current.deletedAssetKeys)
      deletedKeys.forEach((key) => nextDeletedKeys.add(key))
      const nextAssignments = { ...current.folderAssignments }
      deletedKeys.forEach((key) => {
        delete nextAssignments[key]
      })
      return {
        folders: current.folders.filter((folder) => !folderIdsToDelete.has(folder.id) && !selectedIdSet.has(folder.id)),
        promptCards: current.promptCards.filter(
          (asset) => !selectedIdSet.has(asset.id) && !deletedKeys.has(browserAssetStorageKey(asset)),
        ),
        promptCategories: current.promptCategories,
        folderAssignments: nextAssignments,
        deletedAssetKeys: [...nextDeletedKeys],
      }
    })
    setLocalAssets((current) =>
      current.filter((asset) => !selectedIdSet.has(asset.id) && !deletedKeys.has(browserAssetStorageKey(asset))),
    )
    setPersistedAssets((current) =>
      current.filter((asset) => !selectedIdSet.has(asset.id) && !deletedKeys.has(browserAssetStorageKey(asset))),
    )
    if (activeFolderId && folderIdsToDelete.has(activeFolderId)) setActiveFolderId(null)
    setSelectedIds(new Set())
  }, [activeFolderId, assetById, mergedAssets, selectedIds, updateLibraryState])

  const moveAssetsToFolder = React.useCallback(
    (assetIds: readonly string[], targetFolderId: string): void => {
      const targetFolder = assetById.get(targetFolderId)
      if (targetFolder?.type !== 'folder') return
      const movingIds = new Set(assetIds.filter((id) => id !== targetFolderId))
      if (movingIds.size === 0) return

      const isFolderDescendant = (folderId: string, possibleAncestorId: string): boolean => {
        let current = assetById.get(folderId)?.parentFolderId ?? null
        while (current) {
          if (current === possibleAncestorId) return true
          current = assetById.get(current)?.parentFolderId ?? null
        }
        return false
      }

      updateLibraryState((current) => {
        const nextAssignments = { ...current.folderAssignments }
        const nextFolders = current.folders.map((folder) => {
          if (!movingIds.has(folder.id)) return folder
          if (folder.id === targetFolderId || isFolderDescendant(targetFolderId, folder.id)) return folder
          return { ...folder, parentFolderId: targetFolderId }
        })
        for (const id of movingIds) {
          const asset = assetById.get(id)
          if (!asset || asset.type === 'folder') continue
          nextAssignments[browserAssetStorageKey(asset)] = targetFolderId
        }
        return {
          ...current,
          folders: nextFolders,
          folderAssignments: nextAssignments,
        }
      })
      setSelectedIds(new Set([...movingIds]))
    },
    [assetById, updateLibraryState],
  )

  const selectAllVisibleAssets = React.useCallback((): void => {
    if (filteredAssets.length === 0) return
    setSelectedIds(new Set(filteredAssets.map((asset) => asset.id)))
  }, [filteredAssets])

  React.useEffect(() => {
    if (!popoverOpen) return undefined
    const handleDeleteKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      const target = event.target as HTMLElement | null
      if (target?.closest('input,textarea,select,[contenteditable="true"]')) return
      if (selectedIds.size === 0) return
      event.preventDefault()
      event.stopPropagation()
      deleteSelectedAssets()
    }
    window.addEventListener('keydown', handleDeleteKey, { capture: true })
    return () => window.removeEventListener('keydown', handleDeleteKey, { capture: true })
  }, [deleteSelectedAssets, popoverOpen, selectedIds.size])

  React.useEffect(() => {
    if (!popoverOpen) return undefined
    const handleSelectAllKey = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'a' || (!event.ctrlKey && !event.metaKey) || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input,textarea,select,[contenteditable="true"]')) return
      const insidePopover = target ? rootRef.current?.contains(target) : false
      if (!insidePopover && document.activeElement !== document.body) return
      if (filteredAssets.length === 0) return
      event.preventDefault()
      event.stopPropagation()
      selectAllVisibleAssets()
    }
    window.addEventListener('keydown', handleSelectAllKey, { capture: true })
    return () => window.removeEventListener('keydown', handleSelectAllKey, { capture: true })
  }, [filteredAssets.length, popoverOpen, selectAllVisibleAssets])

  const updateSelectionFromMarquee = React.useCallback(
    (selection: MarqueeState): void => {
      const grid = gridRef.current
      if (!grid) return
      const gridRect = grid.getBoundingClientRect()
      const local = normalizeMarqueeRect(selection)
      const selectionRect = new DOMRect(
        gridRect.left + Number(local.left) - grid.scrollLeft,
        gridRect.top + Number(local.top) - grid.scrollTop,
        Number(local.width),
        Number(local.height),
      )
      const next = new Set<string>()
      for (const asset of filteredAssets) {
        const node = itemRefs.current.get(asset.id)
        if (node && rectsIntersect(node.getBoundingClientRect(), selectionRect)) {
          next.add(asset.id)
        }
      }
      setSelectedIds(next)
    },
    [filteredAssets],
  )

  const pointFromClientPoint = React.useCallback((clientX: number, clientY: number) => {
    const grid = gridRef.current
    if (!grid) return null
    const rect = grid.getBoundingClientRect()
    const maxX = Math.max(rect.width, grid.scrollWidth)
    const maxY = Math.max(rect.height, grid.scrollHeight)
    return {
      x: Math.max(0, Math.min(clientX - rect.left + grid.scrollLeft, maxX)),
      y: Math.max(0, Math.min(clientY - rect.top + grid.scrollTop, maxY)),
    }
  }, [])

  const pointFromPointerEvent = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => pointFromClientPoint(event.clientX, event.clientY),
    [pointFromClientPoint],
  )

  const updateMarqueeFromClientPoint = React.useCallback(
    (clientX: number, clientY: number, baseMarquee = marqueeRef.current): void => {
      if (!baseMarquee) return
      const point = pointFromClientPoint(clientX, clientY)
      if (!point) return
      const next = {
        ...baseMarquee,
        currentX: point.x,
        currentY: point.y,
      }
      marqueeRef.current = next
      setMarquee(next)
      updateSelectionFromMarquee(next)
    },
    [pointFromClientPoint, updateSelectionFromMarquee],
  )

  const stopMarqueeAutoScroll = React.useCallback((): void => {
    if (marqueeAutoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(marqueeAutoScrollFrameRef.current)
      marqueeAutoScrollFrameRef.current = null
    }
    marqueePointerRef.current = null
  }, [])

  const scheduleMarqueeAutoScroll = React.useCallback((): void => {
    if (marqueeAutoScrollFrameRef.current !== null) return
    const tick = (): void => {
      marqueeAutoScrollFrameRef.current = null
      const grid = gridRef.current
      const pointer = marqueePointerRef.current
      const activeMarquee = marqueeRef.current
      if (!grid || !pointer || !activeMarquee) return
      const rect = grid.getBoundingClientRect()
      const topDistance = pointer.clientY - rect.top
      const bottomDistance = rect.bottom - pointer.clientY
      let deltaY = 0
      if (topDistance < MARQUEE_AUTO_SCROLL_EDGE_SIZE) {
        const intensity = clampNumber(
          (MARQUEE_AUTO_SCROLL_EDGE_SIZE - topDistance) / MARQUEE_AUTO_SCROLL_EDGE_SIZE,
          0,
          1,
        )
        deltaY = -Math.ceil(intensity * MARQUEE_AUTO_SCROLL_MAX_SPEED)
      } else if (bottomDistance < MARQUEE_AUTO_SCROLL_EDGE_SIZE) {
        const intensity = clampNumber(
          (MARQUEE_AUTO_SCROLL_EDGE_SIZE - bottomDistance) / MARQUEE_AUTO_SCROLL_EDGE_SIZE,
          0,
          1,
        )
        deltaY = Math.ceil(intensity * MARQUEE_AUTO_SCROLL_MAX_SPEED)
      }
      if (deltaY === 0) return
      const before = grid.scrollTop
      const maxScrollTop = Math.max(0, grid.scrollHeight - grid.clientHeight)
      grid.scrollTop = clampNumber(before + deltaY, 0, maxScrollTop)
      updateMarqueeFromClientPoint(pointer.clientX, pointer.clientY, activeMarquee)
      if (grid.scrollTop !== before) {
        marqueeAutoScrollFrameRef.current = window.requestAnimationFrame(tick)
      }
    }
    marqueeAutoScrollFrameRef.current = window.requestAnimationFrame(tick)
  }, [updateMarqueeFromClientPoint])

  React.useEffect(() => {
    marqueeRef.current = marquee
  }, [marquee])

  React.useEffect(() => () => stopMarqueeAutoScroll(), [stopMarqueeAutoScroll])

  React.useEffect(() => {
    if (popoverOpen) return
    stopMarqueeAutoScroll()
    marqueeRef.current = null
    setMarquee(null)
  }, [popoverOpen, stopMarqueeAutoScroll])

  const handleGridPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-browser-asset-tile="true"],button,input')) return
      const point = pointFromPointerEvent(event)
      if (!point) return
      event.currentTarget.setPointerCapture(event.pointerId)
      const next = {
        startX: point.x,
        startY: point.y,
        currentX: point.x,
        currentY: point.y,
      }
      marqueeRef.current = next
      marqueePointerRef.current = { clientX: event.clientX, clientY: event.clientY }
      setMarquee(next)
      setSelectedIds(new Set())
    },
    [pointFromPointerEvent],
  )

  const handleGridPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const activeMarquee = marqueeRef.current ?? marquee
      if (!activeMarquee) return
      marqueePointerRef.current = { clientX: event.clientX, clientY: event.clientY }
      updateMarqueeFromClientPoint(event.clientX, event.clientY, activeMarquee)
      scheduleMarqueeAutoScroll()
    },
    [marquee, scheduleMarqueeAutoScroll, updateMarqueeFromClientPoint],
  )

  const handleGridPointerUp = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!marqueeRef.current && !marquee) return
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      stopMarqueeAutoScroll()
      marqueeRef.current = null
      setMarquee(null)
    },
    [marquee, stopMarqueeAutoScroll],
  )

  const handleTileDragStart = React.useCallback(
    (asset: NomiBrowserAsset, event: React.DragEvent<HTMLDivElement>) => {
      const dragSelection = selectedIds.has(asset.id) ? selectedAssets : [asset]
      const serializedSelection = JSON.stringify(dragSelection)
      event.dataTransfer.setData(NOMI_ASSET_DRAG_MIME, serializedSelection)
      event.dataTransfer.setData(LEGACY_BROWSER_ASSET_DRAG_MIME, serializedSelection)
      event.dataTransfer.setData('text/plain', dragSelection.map((item) => item.title).join('\n'))
      event.dataTransfer.effectAllowed = 'copyMove'
    },
    [selectedAssets, selectedIds],
  )

  const selectedCanvasImportAssets = React.useMemo(
    () => selectedAssets.map(browserAssetToCanvasImportItem).filter(isBrowserAssetCanvasImportItem),
    [selectedAssets],
  )
  const canImportSelectedAssetsToCanvas = canvasImportAvailable && selectedCanvasImportAssets.length > 0

  const importSelectedAssetsToCanvas = React.useCallback((): void => {
    if (!canImportSelectedAssetsToCanvas) return
    setAssetContextMenu(null)
    setBlankContextMenu(null)
    dispatchBrowserAssetsImportToCanvas(selectedCanvasImportAssets)
  }, [canImportSelectedAssetsToCanvas, selectedCanvasImportAssets])

  const readDraggedAssetIds = React.useCallback((dataTransfer: DataTransfer): string[] => {
    const payload = dataTransfer.getData(NOMI_ASSET_DRAG_MIME) || dataTransfer.getData(LEGACY_BROWSER_ASSET_DRAG_MIME)
    if (!payload) return []
    try {
      const parsed = JSON.parse(payload) as Array<{ id?: unknown }>
      if (!Array.isArray(parsed)) return []
      return parsed.map((asset) => (typeof asset.id === 'string' ? asset.id : '')).filter(Boolean)
    } catch {
      return []
    }
  }, [])

  const handleTileDragOver = React.useCallback((asset: NomiBrowserAsset, event: React.DragEvent<HTMLDivElement>) => {
    if (asset.type !== 'folder') return
    const types = Array.from(event.dataTransfer.types)
    if (!types.includes(NOMI_ASSET_DRAG_MIME) && !types.includes(LEGACY_BROWSER_ASSET_DRAG_MIME)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const handleTileDrop = React.useCallback(
    (asset: NomiBrowserAsset, event: React.DragEvent<HTMLDivElement>) => {
      if (asset.type !== 'folder') return
      const draggedIds = readDraggedAssetIds(event.dataTransfer)
      if (draggedIds.length === 0) return
      event.preventDefault()
      event.stopPropagation()
      moveAssetsToFolder(draggedIds, asset.id)
    },
    [moveAssetsToFolder, readDraggedAssetIds],
  )

  const importRemoteAssetToLibrary = React.useCallback(
    async (input: BrowserAssetRemoteImportInput): Promise<void> => {
      const mediaType = input.mediaType === 'video' ? 'video' : 'image'
      const sourceLabel = 'requestId' in input ? '网页捕捞' : '网页拖拽'
      const pendingId = `browser-${mediaType}-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const title = input.title || input.fileName || fileNameFromRemoteAssetUrl(input.url)
      const pendingAsset: NomiBrowserAsset = {
        id: pendingId,
        type: mediaType,
        source: 'my',
        title,
        subtitle: '下载中...',
        tags: [sourceLabel],
        parentFolderId: activeFolderId,
        status: 'loading',
      }
      setActiveSource('my')
      setActiveTab('all')
      setLocalAssets((current) => [pendingAsset, ...current])
      setSelectedIds(new Set([pendingId]))

      if (!onImportRemoteAsset) {
        setLocalAssets((current) =>
          current.map((asset) =>
            asset.id === pendingId ? { ...asset, subtitle: '无法导入网页素材', status: 'error' } : asset,
          ),
        )
        return
      }

      try {
        const imported = await onImportRemoteAsset(input)
        const readyAsset: NomiBrowserAsset = { ...imported, parentFolderId: activeFolderId, status: 'ready' }
        setLocalAssets((current) => current.map((asset) => (asset.id === pendingId ? readyAsset : asset)))
        setPersistedAssets((current) => upsertBrowserAsset(current, readyAsset))
        updateLibraryState((current) => ({
          ...current,
          folderAssignments: {
            ...current.folderAssignments,
            [browserAssetStorageKey(readyAsset)]: activeFolderId,
          },
        }))
        setSelectedIds(new Set([readyAsset.id]))
      } catch {
        setLocalAssets((current) =>
          current.map((asset) =>
            asset.id === pendingId ? { ...asset, subtitle: '下载失败', status: 'error' } : asset,
          ),
        )
      }
    },
    [activeFolderId, onImportRemoteAsset, updateLibraryState],
  )

  const upsertPromptCardAsset = React.useCallback(
    (asset: NomiBrowserAsset): void => {
      updateLibraryState((current) => ({
        ...current,
        promptCards: upsertBrowserAsset(current.promptCards, asset),
      }))
    },
    [updateLibraryState],
  )

  const preparePromptReference = React.useCallback(
    async (
      request: BrowserAssetPromptCaptureRequest,
      initialReferences: readonly BrowserAssetPromptReference[],
    ): Promise<{ references: BrowserAssetPromptReference[]; modelImageUrl: string }> => {
      const desktop = getDesktopBridge()
      const browserBridge = desktop?.browser
      const projectId = getDesktopActiveProjectId()
      const sourceUrl = request.sourceUrl?.trim() || initialReferences[0]?.sourceUrl || initialReferences[0]?.url || ''

      if (request.sourceType === 'screenshot' && request.viewId && browserBridge?.capturePromptScreenshot) {
        const captured = await browserBridge.capturePromptScreenshot({
          viewId: request.viewId,
          ...(projectId ? { projectId } : {}),
          fileName: request.fileName,
          title: request.title,
          sourceRect: request.sourceRect,
        })
        const referenceUrl = referenceResultUrl(captured) || referenceResultDataUrl(captured)
        const dataUrl = referenceResultDataUrl(captured) || referenceUrl
        return {
          references: referenceUrl
            ? [
                {
                  url: referenceUrl,
                  title: request.title,
                  sourceUrl: sourceUrl || request.pageUrl,
                },
              ]
            : [...initialReferences],
          modelImageUrl: dataUrl || request.modelImageUrl || referenceUrl || sourceUrl,
        }
      }

      if (request.viewId && /^(https?:\/\/|blob:)/i.test(sourceUrl) && browserBridge?.capturePromptImage) {
        const captured = await browserBridge.capturePromptImage({
          viewId: request.viewId,
          ...(projectId ? { projectId } : {}),
          url: sourceUrl,
          fileName: request.fileName,
          title: request.title,
        })
        const referenceUrl = referenceResultUrl(captured) || referenceResultDataUrl(captured)
        const dataUrl = referenceResultDataUrl(captured) || referenceUrl
        return {
          references: referenceUrl
            ? [
                {
                  url: referenceUrl,
                  title: request.title,
                  sourceUrl,
                },
              ]
            : [...initialReferences],
          modelImageUrl: dataUrl || request.modelImageUrl || referenceUrl || sourceUrl,
        }
      }

      return {
        references: [...initialReferences],
        modelImageUrl: request.modelImageUrl || sourceUrl || initialReferences[0]?.url || '',
      }
    },
    [],
  )

  const runPromptExtraction = React.useCallback(
    async (
      modelImageUrl: string,
      mode: BrowserPromptExtractionMode,
    ): Promise<{ title: string; prompt: string }> => {
      if (!modelImageUrl) throw new Error('没有可分析的参考图')
      const brain = await getTextBrain()
      if (!brain) throw new Error('请先在「模型接入」里启用一个支持图片输入的文本模型')
      const extractionPrompt = browserPromptExtractionPromptFromSettings(promptExtractionSettings, mode)
      const result = await runWorkbenchTaskByVendor(brain.vendor, {
        kind: 'image_to_prompt',
        prompt: extractionPrompt,
        extras: {
          modelKey: brain.modelKey,
          referenceImages: [modelImageUrl],
          temperature: mode === 'style' ? 0.2 : 0.35,
          maxTokens: mode === 'style' ? 1800 : 1600,
        },
      })
      const text = extractTextFromTaskResult(result)
      if (!text) throw new Error('模型没有返回提示词')
      const parsed = parseBrowserPromptExtraction(text, mode)
      if (!parsed.prompt) throw new Error('模型没有返回可用提示词')
      return parsed
    },
    [promptExtractionSettings],
  )

  const extractPromptToAssetCard = React.useCallback(
    async (request: BrowserAssetPromptCaptureRequest): Promise<void> => {
      const cardId = `browser-prompt-${request.requestId}`
      const extractionMode = promptExtractionModeFromRequest(request)
      const initialReferences = promptReferenceImagesFromRequest(request)
      const pendingAsset = createPromptCardAsset({
        id: cardId,
        request,
        references: initialReferences,
        prompt: '',
        status: 'loading',
      })
      setActiveSource('transcript')
      setActiveTab('prompt')
      setActiveFolderId(null)
      setPopoverOpen(true)
      upsertPromptCardAsset(pendingAsset)
      setSelectedIds(new Set([cardId]))

      let latestReferences: readonly BrowserAssetPromptReference[] = initialReferences
      try {
        const prepared = await preparePromptReference(request, initialReferences)
        latestReferences = prepared.references
        const preparedAsset = createPromptCardAsset({
          id: cardId,
          request,
          references: prepared.references,
          prompt: '',
          status: 'loading',
          savedAt: pendingAsset.promptCard?.savedAt,
        })
        upsertPromptCardAsset(preparedAsset)
        const extracted = await runPromptExtraction(prepared.modelImageUrl, extractionMode)
        const readyAsset = createPromptCardAsset({
          id: cardId,
          request,
          references: prepared.references,
          prompt: extracted.prompt,
          status: 'ready',
          title: extracted.title,
          savedAt: pendingAsset.promptCard?.savedAt,
        })
        upsertPromptCardAsset(readyAsset)
        setSelectedIds(new Set([cardId]))
      } catch (error) {
        const failedAsset = createPromptCardAsset({
          id: cardId,
          request,
          references: latestReferences,
          prompt: error instanceof Error ? error.message : '提示词提取失败',
          status: 'error',
          savedAt: pendingAsset.promptCard?.savedAt,
        })
        upsertPromptCardAsset(failedAsset)
        setSelectedIds(new Set([cardId]))
      }
    },
    [preparePromptReference, runPromptExtraction, setPopoverOpen, upsertPromptCardAsset],
  )

  React.useEffect(() => {
    if (!browserCaptureRequest) return
    if (handledCaptureRequestIdRef.current === browserCaptureRequest.requestId) return
    handledCaptureRequestIdRef.current = browserCaptureRequest.requestId
    void importRemoteAssetToLibrary(browserCaptureRequest)
  }, [browserCaptureRequest, importRemoteAssetToLibrary])

  React.useEffect(() => {
    if (!browserPromptCaptureRequest) return
    if (handledPromptRequestIdRef.current === browserPromptCaptureRequest.requestId) return
    handledPromptRequestIdRef.current = browserPromptCaptureRequest.requestId
    void extractPromptToAssetCard(browserPromptCaptureRequest)
  }, [browserPromptCaptureRequest, extractPromptToAssetCard])

  const acceptsExternalAssetDrop = React.useCallback((dataTransfer: DataTransfer): boolean => {
    const types = Array.from(dataTransfer.types)
    if (types.includes(NOMI_ASSET_DRAG_MIME) || types.includes(LEGACY_BROWSER_ASSET_DRAG_MIME)) return false
    return (
      types.includes(BROWSER_IMAGE_DRAG_MIME) ||
      types.includes('text/uri-list') ||
      types.includes('text/html') ||
      types.includes('text/plain') ||
      dataTransfer.files.length > 0
    )
  }, [])

  const handleWindowDragEnter = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>): void => {
      if (!acceptsExternalAssetDrop(event.dataTransfer)) return
      event.preventDefault()
      event.stopPropagation()
      setDropActive(true)
    },
    [acceptsExternalAssetDrop],
  )

  const handleWindowDragOver = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>): void => {
      if (!acceptsExternalAssetDrop(event.dataTransfer)) return
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'copy'
      setDropActive(true)
    },
    [acceptsExternalAssetDrop],
  )

  const handleWindowDragLeave = React.useCallback((event: React.DragEvent<HTMLDivElement>): void => {
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && event.currentTarget.contains(nextTarget)) return
    setDropActive(false)
  }, [])

  const handleWindowDrop = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>): void => {
      if (!acceptsExternalAssetDrop(event.dataTransfer)) return
      event.preventDefault()
      event.stopPropagation()
      setDropActive(false)

      const remoteAsset = readBrowserImageDragPayload(event.dataTransfer)
      if (remoteAsset) {
        void importRemoteAssetToLibrary(remoteAsset)
        return
      }

      const droppedFiles = Array.from(event.dataTransfer.files ?? [])
      if (droppedFiles.length > 0) addLocalFiles(droppedFiles)
    },
    [acceptsExternalAssetDrop, addLocalFiles, importRemoteAssetToLibrary],
  )

  const selectFilterTab = React.useCallback((tab: NomiBrowserAssetTab): void => {
    setActiveTab(tab)
    setFiltersOpen(false)
    setActionsOpen(false)
  }, [])

  const selectPromptCategory = React.useCallback((categoryId: string): void => {
    setActivePromptCategory(categoryId)
    setFiltersOpen(false)
    setActionsOpen(false)
  }, [])

  const addPromptCategory = React.useCallback((label: string): void => {
    const category = createBrowserPromptCategory(getDesktopActiveProjectId(), label)
    if (category) setActivePromptCategory(category.id)
  }, [])

  const showAllFilters = React.useCallback((): void => {
    setActiveTab('all')
    setActivePromptCategory('all')
    setFiltersOpen(false)
    setActionsOpen(false)
  }, [])

  const handleHeaderPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (dockMode) return
      const target = event.target as HTMLElement | null
      if (target?.closest('button,input,textarea,select,[contenteditable="true"]')) return
      startMove(event)
    },
    [dockMode, startMove],
  )

  return (
    <div
      ref={rootRef}
      className={cn(
        'nomi-browser-asset-popover-host font-nomi-sans text-nomi-ink',
        contained
          ? 'absolute inset-0 z-[560] overflow-hidden pointer-events-none'
          : [
              'z-[2] max-[760px]:bottom-3 max-[760px]:right-3',
              placement === 'fixed' ? 'fixed' : 'absolute',
              'bottom-[18px] right-[18px]',
            ],
        className,
      )}
      data-placement={placement}
      data-surface={surface}
    >
      {showTrigger ? (
        <button
          type="button"
          className={cn(
            'nomi-browser-asset-popover__floating inline-grid size-11 place-items-center rounded-pill border border-nomi-line',
            'cursor-pointer bg-nomi-ink text-nomi-paper shadow-nomi-md',
            'transition-[background,transform] duration-[var(--nomi-transition-fast)] hover:-translate-y-px hover:bg-nomi-accent',
          )}
          aria-label="打开资产包"
          aria-expanded={popoverOpen}
          onClick={() => setPopoverOpen(!popoverOpen)}
        >
          <IconCards size={20} stroke={1.8} aria-hidden="true" />
        </button>
      ) : null}

      {popoverOpen ? (
        <motion.div
          className={cn(
            'nomi-browser-asset-popover z-[1]',
            contained ? 'absolute left-0 top-0 pointer-events-auto' : 'fixed left-0 top-0',
          )}
          style={{ width: windowRect.width, height: windowRect.height }}
          initial={contained ? { opacity: 0, scale: 0.985 } : undefined}
          animate={{
            x: contained ? windowRect.left - (hostOrigin?.left ?? 0) : windowRect.left,
            y: contained ? windowRect.top - (hostOrigin?.top ?? 0) : windowRect.top,
            ...(contained ? { opacity: 1, scale: 1 } : null),
          }}
          transition={
            isWindowInteracting
              ? { duration: 0 }
              : contained
                ? { duration: 0.16, ease: 'easeOut' }
                : { type: 'spring', stiffness: 420, damping: 30, mass: 0.8 }
          }
          role="dialog"
          aria-label="资产包"
          data-dock-mode={dockMode ?? 'floating'}
          onMouseDown={(event) => event.stopPropagation()}
          onDragEnter={handleWindowDragEnter}
          onDragOver={handleWindowDragOver}
          onDragLeave={handleWindowDragLeave}
          onDrop={handleWindowDrop}
        >
          <div
            className={cn(
              'relative flex size-full flex-col overflow-hidden rounded-nomi-lg border bg-nomi-paper shadow-nomi-lg',
              (splitDocked || edgeDocked) && 'shadow-none',
              splitDocked && 'border-0',
              dropActive
                ? 'border-nomi-accent ring-2 ring-nomi-accent ring-offset-1 ring-offset-nomi-paper'
                : 'border-nomi-line',
            )}
          >
            <div
              className={cn(
                'flex min-h-12 shrink-0 select-none items-center gap-2.5 border-b border-nomi-line-soft px-4',
                dockMode ? 'cursor-default' : isWindowInteracting ? 'cursor-grabbing' : 'cursor-grab',
                compactToolbar && 'min-h-11 px-3.5',
              )}
              onPointerDown={handleHeaderPointerDown}
            >
              {compactToolbar ? (
                <div className="min-w-0 flex-1 truncate text-body-sm font-bold text-nomi-ink">素材盒</div>
              ) : (
                <div className="flex min-w-0 shrink-0 items-center gap-3">
                  <div className="shrink-0 text-body-sm font-bold text-nomi-ink">素材盒</div>
                  <div
                    className="inline-flex min-w-0 items-center gap-0.5 rounded-nomi bg-nomi-ink-05 p-0.5"
                    role="tablist"
                    aria-label="素材来源"
                  >
                    {sourceTabs.map((source) => {
                      const active = activeSource === source.key
                      return (
                        <button
                          key={source.key}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          className={cn(
                            'h-8 rounded-nomi-sm border-0 bg-transparent px-3 text-caption font-semibold',
                            'cursor-pointer whitespace-nowrap transition-[background,color,box-shadow] duration-[var(--nomi-transition-fast)]',
                            active
                              ? 'bg-nomi-paper text-nomi-ink shadow-nomi-sm'
                              : 'text-nomi-ink-60 hover:text-nomi-ink',
                          )}
                          onClick={() => selectAssetSource(source.key)}
                        >
                          {source.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              <span className="ml-auto" aria-hidden="true" />
              {onBrowserCaptureToggle ? (
                <button
                  type="button"
                  className={cn(
                    toolbarButtonClass,
                    browserCaptureEnabled && 'bg-nomi-accent-soft text-nomi-accent hover:text-nomi-accent',
                  )}
                  aria-label={browserCaptureEnabled ? '关闭资源捕捞' : '开启资源捕捞'}
                  aria-pressed={browserCaptureEnabled}
                  title={browserCaptureEnabled ? '关闭资源捕捞' : '资源捕捞：悬停资源后按 Ctrl+C 保存'}
                  disabled={browserCaptureDisabled}
                  onClick={onBrowserCaptureToggle}
                >
                  <ScanSearch size={17} strokeWidth={1.8} aria-hidden="true" />
                </button>
              ) : null}
              <button
                type="button"
                className={cn(toolbarButtonClass, promptExtractionSettingsOpen && 'bg-nomi-ink-05 text-nomi-ink')}
                aria-label="提示词提取设置"
                title="提示词提取设置"
                aria-pressed={promptExtractionSettingsOpen}
                onClick={() => setPromptExtractionSettingsOpen(true)}
              >
                <Settings2 size={17} strokeWidth={1.8} aria-hidden="true" />
              </button>
              {canDock ? (
                <button
                  type="button"
                  className={toolbarButtonClass}
                  aria-label={dockMode ? '恢复浮动素材盒' : '吸附到右侧'}
                  title={dockMode ? '恢复浮动' : '吸附到右侧'}
                  disabled={!activeBounds}
                  onClick={toggleDockMode}
                >
                  {dockMode === 'left' ? (
                    <PanelLeftOpen size={17} strokeWidth={1.8} aria-hidden="true" />
                  ) : dockMode === 'right' ? (
                    <PanelRightOpen size={17} strokeWidth={1.8} aria-hidden="true" />
                  ) : (
                    <PanelRightClose size={17} strokeWidth={1.8} aria-hidden="true" />
                  )}
                </button>
              ) : null}
              <button
                type="button"
                className={toolbarButtonClass}
                aria-label="最小化资产包"
                onClick={() => setPopoverOpen(false)}
              >
                <IconMinus size={17} stroke={1.8} aria-hidden="true" />
              </button>
            </div>

            <div
              className={cn(
                'relative grid shrink-0 items-center gap-2.5 border-b border-nomi-line-soft/60 bg-nomi-bg/45 px-4 py-3',
                compactToolbar && 'grid-cols-1 gap-2.5 px-3.5 py-3',
                singleTileToolbar && 'gap-2',
                !compactToolbar && 'grid-cols-[minmax(0,1fr)_auto]',
              )}
            >
              <DesignSearchInput
                value={query}
                onChange={setQuery}
                placeholder="搜索素材"
                ariaLabel="搜索素材"
                size="sm"
                className="min-w-0 w-full bg-nomi-paper"
              />
              <div
                className={cn(
                  'flex min-w-0 items-center gap-2',
                  compactToolbar
                    ? singleTileToolbar
                      ? 'flex-col items-stretch gap-2'
                      : 'flex-row justify-between'
                    : 'justify-end',
                )}
              >
                {compactToolbar ? (
                  <div
                    className={cn(
                      'grid min-w-0 gap-0.5 rounded-nomi bg-nomi-ink-05 p-0.5',
                      !singleTileToolbar && 'flex-1',
                    )}
                    style={sourceTabGridStyle}
                    role="tablist"
                    aria-label="素材来源"
                  >
                    {sourceTabs.map((source) => {
                      const active = activeSource === source.key
                      return (
                        <button
                          key={source.key}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          className={cn(
                            'h-8 min-w-0 rounded-nomi-sm border-0 bg-transparent px-2.5 text-caption font-semibold',
                            'cursor-pointer truncate transition-[background,color,box-shadow] duration-[var(--nomi-transition-fast)]',
                            active
                              ? 'bg-nomi-paper text-nomi-ink shadow-nomi-sm'
                              : 'text-nomi-ink-60 hover:text-nomi-ink',
                          )}
                          onClick={() => selectAssetSource(source.key)}
                        >
                          {source.label}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
                <div
                  className={cn(
                    'flex shrink-0 items-center gap-1 rounded-nomi bg-nomi-ink-05/70 p-0.5',
                    compactToolbar && (singleTileToolbar ? 'justify-end self-end' : 'self-auto'),
                  )}
                >
                  <button
                    type="button"
                    className={toolbarButtonClass}
                    aria-label="上传素材"
                    onClick={() => uploadInputRef.current?.click()}
                  >
                    <IconUpload size={17} stroke={1.8} aria-hidden="true" />
                  </button>
                  <button type="button" className={toolbarButtonClass} aria-label="新建文件夹" onClick={createFolder}>
                    <IconFolderPlus size={17} stroke={1.8} aria-hidden="true" />
                  </button>
                  {compactToolbar ? (
                    <div className="relative">
                      <button
                        type="button"
                        ref={actionsButtonRef}
                        className={cn(TOOL_BUTTON_COMPACT_CLASS, actionsOpen && 'bg-nomi-ink-05 text-nomi-ink')}
                        aria-label="更多素材工具"
                        aria-haspopup="dialog"
                        aria-expanded={actionsOpen}
                        onClick={() => setActionsOpen((value) => !value)}
                      >
                        <IconDotsVertical size={17} stroke={1.8} aria-hidden="true" />
                      </button>
                      {actionsOpen ? (
                        <div
                          ref={actionsPopoverRef}
                          className="absolute right-0 top-[calc(100%+6px)] z-[6] flex items-center gap-1 rounded-nomi border border-nomi-line bg-nomi-paper p-1 shadow-nomi-lg"
                          role="dialog"
                          aria-label="更多素材工具"
                        >
                          <button
                            type="button"
                            className={cn(TOOL_BUTTON_COMPACT_CLASS, listMode && 'bg-nomi-ink-05 text-nomi-ink')}
                            aria-label="切换素材布局"
                            aria-pressed={listMode}
                            onClick={() => setViewMode((value) => (value === 'grid' ? 'list' : 'grid'))}
                          >
                            {listMode ? (
                              <IconLayoutGrid size={17} stroke={1.8} aria-hidden="true" />
                            ) : (
                              <IconList size={17} stroke={1.8} aria-hidden="true" />
                            )}
                          </button>
                          <button
                            type="button"
                            className={cn(TOOL_BUTTON_COMPACT_CLASS, !sortAscending && 'bg-nomi-ink-05 text-nomi-ink')}
                            aria-label="排序素材"
                            aria-pressed={!sortAscending}
                            onClick={() => setSortAscending((value) => !value)}
                          >
                            <IconSortAscending2 size={17} stroke={1.8} aria-hidden="true" />
                          </button>
                          <div className="relative">
                            <button
                              type="button"
                              ref={filterButtonRef}
                              className={cn(
                                TOOL_BUTTON_COMPACT_CLASS,
                                (filtersOpen || filterActive) && 'bg-nomi-ink-05 text-nomi-ink',
                              )}
                              aria-label="筛选分类"
                              aria-haspopup="dialog"
                              aria-expanded={filtersOpen}
                              aria-pressed={filterActive}
                              onClick={() => setFiltersOpen((value) => !value)}
                            >
                              <IconFilter size={17} stroke={1.8} aria-hidden="true" />
                            </button>
                            {filtersOpen ? (
                              showingPromptLibrary ? (
                                <BrowserPromptCategoryFilterPopover
                                  activeCategoryId={activePromptCategory}
                                  categories={promptCategories}
                                  counts={promptCategoryCounts}
                                  setNodeRef={(node) => {
                                    filterPopoverRef.current = node
                                  }}
                                  onSelectCategory={selectPromptCategory}
                                  onAddCategory={addPromptCategory}
                                  onShowAll={showAllFilters}
                                />
                              ) : (
                                <BrowserAssetFilterPopover
                                  activeTab={activeTab}
                                  counts={filterCounts}
                                  tabs={tabs}
                                  setNodeRef={(node) => {
                                    filterPopoverRef.current = node
                                  }}
                                  onSelectTab={selectFilterTab}
                                  onShowAll={showAllFilters}
                                />
                              )
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={cn(TOOL_BUTTON_CLASS, listMode && 'bg-nomi-ink-05 text-nomi-ink')}
                        aria-label="切换素材布局"
                        aria-pressed={listMode}
                        onClick={() => setViewMode((value) => (value === 'grid' ? 'list' : 'grid'))}
                      >
                        {listMode ? (
                          <IconLayoutGrid size={17} stroke={1.8} aria-hidden="true" />
                        ) : (
                          <IconList size={17} stroke={1.8} aria-hidden="true" />
                        )}
                      </button>
                      <button
                        type="button"
                        className={cn(TOOL_BUTTON_CLASS, !sortAscending && 'bg-nomi-ink-05 text-nomi-ink')}
                        aria-label="排序素材"
                        aria-pressed={!sortAscending}
                        onClick={() => setSortAscending((value) => !value)}
                      >
                        <IconSortAscending2 size={17} stroke={1.8} aria-hidden="true" />
                      </button>
                      <div className="relative">
                        <button
                          type="button"
                          ref={filterButtonRef}
                          className={cn(
                            TOOL_BUTTON_CLASS,
                            (filtersOpen || filterActive) && 'bg-nomi-ink-05 text-nomi-ink',
                          )}
                          aria-label="筛选分类"
                          aria-haspopup="dialog"
                          aria-expanded={filtersOpen}
                          aria-pressed={filterActive}
                          onClick={() => setFiltersOpen((value) => !value)}
                        >
                          <IconFilter size={17} stroke={1.8} aria-hidden="true" />
                        </button>
                        {filtersOpen ? (
                          showingPromptLibrary ? (
                            <BrowserPromptCategoryFilterPopover
                              activeCategoryId={activePromptCategory}
                              categories={promptCategories}
                              counts={promptCategoryCounts}
                              setNodeRef={(node) => {
                                filterPopoverRef.current = node
                              }}
                              onSelectCategory={selectPromptCategory}
                              onAddCategory={addPromptCategory}
                              onShowAll={showAllFilters}
                            />
                          ) : (
                            <BrowserAssetFilterPopover
                              activeTab={activeTab}
                              counts={filterCounts}
                              tabs={tabs}
                              setNodeRef={(node) => {
                                filterPopoverRef.current = node
                              }}
                              onSelectTab={selectFilterTab}
                              onShowAll={showAllFilters}
                            />
                          )
                        ) : null}
                      </div>
                    </>
                  )}
                  <input
                    ref={uploadInputRef}
                    type="file"
                    className="sr-only"
                    multiple
                    accept="image/*,video/*,.txt,.md"
                    aria-label="选择素材文件"
                    onChange={handleUploadFiles}
                  />
                </div>
              </div>
            </div>

            {!showingPromptLibrary ? (
              <div className="flex min-h-9 shrink-0 items-center gap-2 bg-nomi-paper px-4 text-caption text-nomi-ink-60">
                {currentFolder ? (
                  <button
                    type="button"
                    className={cn(toolbarButtonClass, 'shrink-0')}
                    aria-label="返回上一级文件夹"
                    onClick={exitCurrentFolder}
                  >
                    <IconArrowLeft size={17} stroke={1.8} aria-hidden="true" />
                  </button>
                ) : null}
                <nav className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden" aria-label="文件夹路径">
                  <IconFolderOpen size={15} stroke={1.7} className="shrink-0 text-nomi-ink-40" aria-hidden="true" />
                  <ol className="flex min-w-0 flex-1 items-center overflow-hidden">
                    <li className={cn('flex min-w-0 items-center gap-1', currentFolder ? 'shrink-0' : 'flex-1')}>
                      {currentFolder ? (
                        <button
                          type="button"
                          className={cn(
                            'max-w-28 truncate rounded-nomi-sm border-0 bg-transparent px-1 py-0.5 text-caption',
                            'cursor-pointer font-semibold text-nomi-ink-45 hover:bg-nomi-ink-05 hover:text-nomi-ink',
                          )}
                          title={activeSourceLabel}
                          onClick={openAssetRoot}
                        >
                          {activeSourceLabel}
                        </button>
                      ) : (
                        <span
                          className="min-w-0 truncate font-semibold text-nomi-ink-70"
                          aria-current="page"
                          title={activeSourceLabel}
                        >
                          {activeSourceLabel}
                        </span>
                      )}
                    </li>
                    {folderBreadcrumbs.map((folder, index) => {
                      const current = index === folderBreadcrumbs.length - 1
                      return (
                        <li
                          key={folder.id}
                          className={cn('flex min-w-0 items-center gap-1', current ? 'flex-1' : 'shrink-0')}
                        >
                          <IconChevronRight
                            size={13}
                            stroke={1.8}
                            className="shrink-0 text-nomi-ink-30"
                            aria-hidden="true"
                          />
                          {current ? (
                            <span
                              className="min-w-0 truncate font-semibold text-nomi-ink-70"
                              aria-current="page"
                              title={folder.title}
                            >
                              {folder.title}
                            </span>
                          ) : (
                            <button
                              type="button"
                              className={cn(
                                'max-w-28 truncate rounded-nomi-sm border-0 bg-transparent px-1 py-0.5 text-caption',
                                'cursor-pointer font-semibold text-nomi-ink-45 hover:bg-nomi-ink-05 hover:text-nomi-ink',
                              )}
                              title={folder.title}
                              onClick={() => openFolder(folder)}
                            >
                              {folder.title}
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                </nav>
              </div>
            ) : null}

            <ScrollArea
              className="min-h-0 flex-1"
              viewportRef={gridRef}
              type="hover"
              scrollbars="y"
              scrollbarSize={6}
              offsetScrollbars="y"
              scrollHideDelay={500}
              overscrollBehavior="contain"
              classNames={{
                viewport: 'relative',
                scrollbar: 'rounded-pill bg-transparent p-0.5',
                thumb: 'rounded-pill bg-nomi-ink-20 hover:bg-nomi-ink-30',
              }}
              viewportProps={{
                onPointerDown: handleGridPointerDown,
                onPointerMove: handleGridPointerMove,
                onPointerUp: handleGridPointerUp,
                onPointerCancel: handleGridPointerUp,
                onContextMenu: openBlankContextMenu,
              }}
            >
              <div className={cn('px-4 pb-5 pt-4', compactToolbar && 'px-4 pt-4')}>
                {filteredAssets.length === 0 ? (
                  <DesignEmptyState
                    density="inline"
                    icon={<IconCards size={32} stroke={1.45} className="text-nomi-ink-30" aria-hidden="true" />}
                    title={emptyStateCopy.title}
                    description={emptyStateCopy.description}
                    className="min-h-[220px] rounded-nomi bg-nomi-ink-05/40"
                  />
                ) : showingPromptLibrary ? (
                  <div
                    className="w-full select-none"
                    style={promptMasonryStyle}
                    aria-label="提示词库瀑布流"
                  >
                    {filteredAssets.map((asset) =>
                      asset.promptCard ? (
                        <BrowserPromptAssetTile
                          key={asset.id}
                          asset={asset}
                          selected={selectedIds.has(asset.id)}
                          setNodeRef={(node) => setAssetNode(asset.id, node)}
                          onClick={(event) => selectAsset(asset, event)}
                          onDoubleClick={(event) => {
                            event.preventDefault()
                            openPromptDetail(asset)
                          }}
                          onContextMenu={(event) => openAssetContextMenu(asset, event)}
                          onDragStart={(event) => handleTileDragStart(asset, event)}
                        />
                      ) : (
                        <BrowserAssetTile
                          key={asset.id}
                          asset={asset}
                          selected={selectedIds.has(asset.id)}
                          compact={gridCompact}
                          viewMode={viewMode}
                          setNodeRef={(node) => setAssetNode(asset.id, node)}
                          onClick={(event) => selectAsset(asset, event)}
                          onDoubleClick={(event) => {
                            event.preventDefault()
                            if (asset.type === 'folder') openFolder(asset)
                          }}
                          onContextMenu={(event) => openAssetContextMenu(asset, event)}
                          onDragStart={(event) => handleTileDragStart(asset, event)}
                          onDragOver={(event) => handleTileDragOver(asset, event)}
                          onDrop={(event) => handleTileDrop(asset, event)}
                        />
                      ),
                    )}
                  </div>
                ) : (
                  <div
                    className={cn(
                      'w-full select-none',
                      listMode ? 'grid gap-1.5' : 'grid auto-rows-max content-start gap-x-3 gap-y-4',
                    )}
                    style={assetGridStyle}
                    aria-label={listMode ? '素材列表' : '素材网格'}
                  >
                    {filteredAssets.map((asset) => (
                      <BrowserAssetTile
                        key={asset.id}
                        asset={asset}
                        selected={selectedIds.has(asset.id)}
                        compact={gridCompact}
                        viewMode={viewMode}
                        setNodeRef={(node) => setAssetNode(asset.id, node)}
                        onClick={(event) => selectAsset(asset, event)}
                        onDoubleClick={(event) => {
                          event.preventDefault()
                          if (asset.promptCard) openPromptDetail(asset)
                          else if (asset.type === 'folder') openFolder(asset)
                        }}
                        onContextMenu={(event) => openAssetContextMenu(asset, event)}
                        onDragStart={(event) => handleTileDragStart(asset, event)}
                        onDragOver={(event) => handleTileDragOver(asset, event)}
                        onDrop={(event) => handleTileDrop(asset, event)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {marquee ? (
                <div
                  className="pointer-events-none absolute z-[2] rounded-nomi-sm border border-nomi-accent bg-nomi-accent-soft/70"
                  style={normalizeMarqueeRect(marquee)}
                  aria-hidden="true"
                />
              ) : null}
            </ScrollArea>
            {dropActive ? (
              <div className="pointer-events-none absolute inset-2 z-[8] grid place-items-center rounded-nomi border border-dashed border-nomi-accent bg-nomi-accent-soft/75 text-caption font-semibold text-nomi-accent">
                松开以保存到素材盒
              </div>
            ) : null}
            {promptDetailAsset ? (
              <BrowserPromptDetailModal
                asset={promptDetailAsset}
                promptCategories={promptCategories}
                onClose={() => setPromptDetailAssetId(null)}
              />
            ) : null}
            {promptExtractionSettingsOpen ? (
              <BrowserPromptExtractionSettingsModal
                settings={promptExtractionSettings}
                projectAvailable={promptExtractionSettingsProjectAvailable}
                onSave={savePromptExtractionSettings}
                onClose={() => setPromptExtractionSettingsOpen(false)}
              />
            ) : null}
          </div>
          {activeResizeEdges.map((edge) => (
            <div
              key={edge}
              data-nomi-window-resize-handle="true"
              className={cn('absolute z-[7] touch-none', RESIZE_HANDLE_CLASS[edge])}
              onPointerDown={(event) => startResize(edge, event)}
              aria-hidden="true"
            />
          ))}
          {assetContextMenu && selectedIds.size > 0 ? (
            <div
              ref={assetContextMenuRef}
              className="absolute z-[9] rounded-nomi border border-nomi-line bg-nomi-paper p-1 shadow-nomi-lg"
              style={{ left: assetContextMenu.x, top: assetContextMenu.y, width: ASSET_CONTEXT_MENU_WIDTH }}
              role="menu"
              aria-label="素材操作"
              onContextMenu={(event) => event.preventDefault()}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {canImportSelectedAssetsToCanvas ? (
                <button
                  type="button"
                  className={cn(
                    'flex h-8 w-full items-center gap-2 rounded-nomi-sm border-0 bg-transparent px-2 text-left',
                    'cursor-pointer text-caption text-nomi-ink-75 transition-colors duration-[var(--nomi-transition-fast)]',
                    'hover:bg-nomi-ink-05 hover:text-nomi-ink focus-visible:bg-nomi-ink-05 focus-visible:outline-none',
                  )}
                  role="menuitem"
                  onClick={importSelectedAssetsToCanvas}
                >
                  <IconArrowForwardUp size={15} stroke={1.8} aria-hidden="true" className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">导入画布</span>
                </button>
              ) : null}
              <button
                type="button"
                className={cn(
                  'flex h-8 w-full items-center gap-2 rounded-nomi-sm border-0 bg-transparent px-2 text-left',
                  'cursor-pointer text-caption text-workbench-danger transition-colors duration-[var(--nomi-transition-fast)]',
                  'hover:bg-workbench-danger-soft focus-visible:bg-workbench-danger-soft focus-visible:outline-none',
                )}
                role="menuitem"
                onClick={deleteSelectedAssets}
              >
                <IconTrash size={15} stroke={1.8} aria-hidden="true" className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">删除</span>
              </button>
            </div>
          ) : null}
          {blankContextMenu ? (
            <div
              ref={blankContextMenuRef}
              className="absolute z-[9] rounded-nomi border border-nomi-line bg-nomi-paper p-1 shadow-nomi-lg"
              style={{ left: blankContextMenu.x, top: blankContextMenu.y, width: BLANK_CONTEXT_MENU_WIDTH }}
              role="menu"
              aria-label="空白区域操作"
              onContextMenu={(event) => event.preventDefault()}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className={cn(
                  'flex h-8 w-full items-center gap-2 rounded-nomi-sm border-0 bg-transparent px-2 text-left',
                  'cursor-pointer text-caption text-nomi-ink-75 transition-colors duration-[var(--nomi-transition-fast)]',
                  'hover:bg-nomi-ink-05 hover:text-nomi-ink focus-visible:bg-nomi-ink-05 focus-visible:outline-none',
                )}
                role="menuitem"
                onClick={createFolder}
              >
                <IconFolderPlus size={15} stroke={1.8} aria-hidden="true" className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">新建文件夹</span>
              </button>
            </div>
          ) : null}
        </motion.div>
      ) : null}
    </div>
  )
}
