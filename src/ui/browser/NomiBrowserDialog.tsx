import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Box as LucideBox, Camera as LucideCamera } from 'lucide-react'
import {
  IconArrowLeft,
  IconArrowRight,
  IconBrowser,
  IconBrush,
  IconExternalLink,
  IconPalette,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconStar,
  IconSearch,
  IconStarFilled,
  IconTrash,
  IconWorld,
  IconX,
} from '../../vendor/tablerIcons'
import { BodyPortal, NomiLogoMark } from '../../design'
import { getDesktopActiveProjectId } from '../../desktop/activeProject'
import {
  getDesktopBridge,
  type DesktopAssetDto,
  type DesktopBrowserAssetOverlayCaptureRequest,
  type DesktopBrowserChromeMenuItem,
  type DesktopBrowserAssetOverlayDockMode,
  type DesktopBrowserPromptCaptureEvent,
  type DesktopBrowserTextPromptSaveEvent,
  type DesktopBrowserViewBounds,
  type DesktopBrowserResourceCaptureEvent,
  type DesktopBrowserViewState,
} from '../../desktop/bridge'
import { cn } from '../../utils/cn'
import { toast } from '../toast'
import { browserUrlDisplayTitle, normalizeBrowserInput } from './browserUrl'
import {
  NomiBrowserAssetPopover,
  type BrowserAssetCaptureRequest,
  type BrowserAssetPromptCaptureRequest,
  type BrowserAssetRemoteImportInput,
} from './NomiBrowserAssetPopover'
import { subscribeBrowserAssetPopoverOpen } from './globalAssetPopoverEvents'
import { BROWSER_PROMPT_EXTRACTION_MODE_LABELS, type BrowserPromptExtractionMode } from './browserPromptExtraction'
import type { NomiBrowserAsset } from './browserAssetData'
import {
  BROWSER_ASSET_LIBRARY_UPDATED_EVENT,
  browserAssetLibraryKey,
  readBrowserPromptCategories,
  saveBrowserPromptCard,
} from './browserAssetLibraryStorage'
import type { FloatingWindowBoundsRect } from './useResizableFloatingWindow'

type NomiBrowserDialogProps = {
  opened: boolean
  onClose: () => void
}

type BrowserTab = {
  id: string
  viewId: number | null
  title: string
  url: string
  favicon?: string
  canGoBack: boolean
  canGoForward: boolean
  loading: boolean
}

type BrowserBookmark = {
  id: string
  title: string
  url: string
  favicon?: string
  createdAt: number
}

type BrowserTabContextMenu = {
  tabId: string
  x: number
  y: number
}

type BrowserBookmarkContextMenu = {
  bookmarkId: string
  x: number
  y: number
}

type BrowserPromptModePickerState = {
  x: number
  y: number
  tab: BrowserTab
}

type ViewportRect = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

type BrowserCaptureFlyoutRect = {
  left: number
  top: number
  width: number
  height: number
}

type BrowserCaptureFlyout = {
  id: string
  url: string
  mediaType: 'image' | 'video'
  sourceRect: BrowserCaptureFlyoutRect
  targetRect: BrowserCaptureFlyoutRect
}

const TAB_LIMIT = 30
const BOOKMARKS_STORAGE_KEY = 'nomi.browser.bookmarks.v1'
const CAPTURE_FLYOUT_MAX_WIDTH = 220
const CAPTURE_FLYOUT_MAX_HEIGHT = 160
const CAPTURE_FLYOUT_TARGET_WIDTH = 96
const CAPTURE_FLYOUT_KEYFRAME_TIMES = [0, 0.18, 1]
const BROWSER_VIEW_POPOVER_GAP = 10
const BROWSER_ASSET_POPOVER_FALLBACK_WIDTH = 520
const BROWSER_ASSET_POPOVER_FALLBACK_HEIGHT = 620
const BROWSER_ASSET_POPOVER_FALLBACK_MARGIN = 18
const PROMPT_MODE_PICKER_WIDTH = 224
const PROMPT_MODE_PICKER_MARGIN = 8
const PROMPT_MODE_PICKER_ESTIMATED_HEIGHT = 142
const USE_NATIVE_BROWSER_ASSET_OVERLAY = true

const DEFAULT_BOOKMARKS: BrowserBookmark[] = [
  {
    id: 'default-nomi',
    title: 'Nomi 官网',
    url: 'http://nomiaqm.com/',
    createdAt: 1,
  },
]

const MATERIAL_SITE_SHORTCUTS = [
  { name: 'pinterest', url: 'https://www.pinterest.com/' },
  { name: 'film-grab', url: 'https://film-grab.com/' },
  { name: 'genery', url: 'https://genery.io/' },
  { name: 'behance', url: 'https://www.behance.net/' },
] as const

// 创作参考类快捷站点——空态页网格。8 张卡是最舒服的 4×2 密度：太少显得空，太多变站点堆。
const BROWSER_START_SHORTCUTS = [
  { label: 'Pinterest', url: 'https://www.pinterest.com/', hint: '视觉灵感' },
  { label: 'Behance', url: 'https://www.behance.net/', hint: '设计作品集' },
  { label: 'Dribbble', url: 'https://dribbble.com/', hint: 'UI 灵感' },
  { label: 'ArtStation', url: 'https://www.artstation.com/', hint: '概念美术' },
  { label: '小红书', url: 'https://www.xiaohongshu.com/', hint: '中文种草' },
  { label: 'YouTube', url: 'https://www.youtube.com/', hint: '视频参考' },
  { label: 'Film Grab', url: 'https://film-grab.com/', hint: '电影分镜' },
  { label: 'X', url: 'https://x.com/', hint: '创作者动态' },
] as const

const TOOL_BUTTON_CLASS = cn(
  'inline-grid size-8 shrink-0 place-items-center rounded-nomi-sm border-0 bg-transparent',
  'cursor-pointer text-nomi-ink-60 transition-[background,color] duration-[var(--nomi-transition-fast)]',
  'hover:bg-nomi-ink-05 hover:text-nomi-ink disabled:cursor-default disabled:text-nomi-ink-20 disabled:hover:bg-transparent',
)

const TAB_CONTEXT_MENU_WIDTH = 176
const TAB_CONTEXT_MENU_MARGIN = 8
const TAB_CONTEXT_MENU_ITEM_CLASS = cn(
  'flex h-9 w-full items-center gap-2 rounded-nomi-sm border-0 bg-transparent px-2.5 text-left',
  'cursor-pointer text-body-sm text-nomi-ink transition-[background,color] duration-[var(--nomi-transition-fast)]',
  'hover:bg-nomi-ink-05 disabled:cursor-default disabled:text-nomi-ink-30 disabled:hover:bg-transparent',
)

const BROWSER_DIALOG_TOP_ANCHOR_SELECTORS = ['.workbench-shell__body', '.nomi-library-page__main']

function createTabId(): string {
  return `browser-tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createBlankTab(): BrowserTab {
  return {
    id: createTabId(),
    viewId: null,
    title: '新建标签页',
    url: '',
    canGoBack: false,
    canGoForward: false,
    loading: false,
  }
}

function readBookmarks(): BrowserBookmark[] {
  if (typeof window === 'undefined') return DEFAULT_BOOKMARKS
  try {
    const raw = window.localStorage.getItem(BOOKMARKS_STORAGE_KEY)
    if (!raw) return DEFAULT_BOOKMARKS
    const parsed = JSON.parse(raw) as BrowserBookmark[]
    if (!Array.isArray(parsed)) return DEFAULT_BOOKMARKS
    return parsed.filter(
      (bookmark) => bookmark && typeof bookmark.url === 'string' && typeof bookmark.title === 'string',
    )
  } catch {
    return DEFAULT_BOOKMARKS
  }
}

function writeBookmarks(bookmarks: BrowserBookmark[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks))
}

function clampTabContextMenuPosition(x: number, y: number, itemCount: number): { x: number; y: number } {
  if (typeof window === 'undefined') return { x, y }
  const estimatedHeight = tabContextMenuEstimatedHeight(itemCount)
  return {
    x: Math.min(
      Math.max(TAB_CONTEXT_MENU_MARGIN, x),
      window.innerWidth - TAB_CONTEXT_MENU_WIDTH - TAB_CONTEXT_MENU_MARGIN,
    ),
    y: Math.min(Math.max(TAB_CONTEXT_MENU_MARGIN, y), window.innerHeight - estimatedHeight - TAB_CONTEXT_MENU_MARGIN),
  }
}

function tabContextMenuEstimatedHeight(itemCount: number): number {
  return itemCount * 36 + 16 + (itemCount > 2 ? 9 : 0)
}

function toViewportRect(rect: DOMRect): ViewportRect {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  }
}

function browserBoundsFromRect(rect: ViewportRect): DesktopBrowserViewBounds {
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.max(0, Math.round(rect.width)),
    height: Math.max(0, Math.round(rect.height)),
  }
}

function sameBrowserViewBounds(
  left: DesktopBrowserViewBounds | null | undefined,
  right: DesktopBrowserViewBounds | null | undefined,
): boolean {
  if (left === right) return true
  if (!left || !right) return false
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
}

function clampNumber(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

function viewportRectFromEdges(left: number, top: number, right: number, bottom: number): ViewportRect | null {
  const width = Math.max(0, right - left)
  const height = Math.max(0, bottom - top)
  if (width < 1 || height < 1) return null
  return { left, top, right, bottom, width, height }
}

function intersectViewportRects(
  left: ViewportRect,
  right: Pick<ViewportRect, 'left' | 'top' | 'right' | 'bottom'>,
): ViewportRect | null {
  return viewportRectFromEdges(
    Math.max(left.left, right.left),
    Math.max(left.top, right.top),
    Math.min(left.right, right.right),
    Math.min(left.bottom, right.bottom),
  )
}

function createFallbackAssetPopoverRect(containerRect: ViewportRect): FloatingWindowBoundsRect {
  const width = Math.min(
    BROWSER_ASSET_POPOVER_FALLBACK_WIDTH,
    Math.max(1, containerRect.width - BROWSER_ASSET_POPOVER_FALLBACK_MARGIN * 2),
  )
  const height = Math.min(
    BROWSER_ASSET_POPOVER_FALLBACK_HEIGHT,
    Math.max(1, containerRect.height - BROWSER_ASSET_POPOVER_FALLBACK_MARGIN * 2),
  )
  const left = clampNumber(
    containerRect.right - width - BROWSER_ASSET_POPOVER_FALLBACK_MARGIN,
    containerRect.left,
    containerRect.right - width,
  )
  const top = clampNumber(
    containerRect.top + BROWSER_ASSET_POPOVER_FALLBACK_MARGIN,
    containerRect.top,
    containerRect.bottom - height,
  )
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  }
}

function browserViewRectAroundPopover(
  containerRect: ViewportRect,
  popoverRect: FloatingWindowBoundsRect | null,
  gap = BROWSER_VIEW_POPOVER_GAP,
): ViewportRect | null {
  if (!popoverRect) return containerRect
  const intersection = intersectViewportRects(containerRect, popoverRect)
  if (!intersection) return containerRect

  const candidates = [
    viewportRectFromEdges(containerRect.left, containerRect.top, intersection.left - gap, containerRect.bottom),
    viewportRectFromEdges(intersection.right + gap, containerRect.top, containerRect.right, containerRect.bottom),
    viewportRectFromEdges(containerRect.left, containerRect.top, containerRect.right, intersection.top - gap),
    viewportRectFromEdges(containerRect.left, intersection.bottom + gap, containerRect.right, containerRect.bottom),
  ].filter((rect): rect is ViewportRect => Boolean(rect))

  if (candidates.length === 0) return null
  return candidates.reduce((best, candidate) =>
    candidate.width * candidate.height > best.width * best.height ? candidate : best,
  )
}

function measureBrowserDialogTopOffset(): number {
  if (typeof document === 'undefined') return 0
  for (const selector of BROWSER_DIALOG_TOP_ANCHOR_SELECTORS) {
    const node = document.querySelector(selector)
    if (!(node instanceof HTMLElement)) continue
    const rect = node.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) return Math.max(0, Math.round(rect.top))
  }
  return 0
}

function fitCaptureFlyoutSourceRect(rect: BrowserCaptureFlyoutRect): BrowserCaptureFlyoutRect {
  const width = Math.max(24, rect.width)
  const height = Math.max(24, rect.height)
  const scale = Math.min(1, CAPTURE_FLYOUT_MAX_WIDTH / width, CAPTURE_FLYOUT_MAX_HEIGHT / height)
  const nextWidth = Math.round(width * scale)
  const nextHeight = Math.round(height * scale)
  return {
    left: Math.round(rect.left + (width - nextWidth) / 2),
    top: Math.round(rect.top + (height - nextHeight) / 2),
    width: nextWidth,
    height: nextHeight,
  }
}

function fallbackCaptureFlyoutSourceRect(node: HTMLElement | null): BrowserCaptureFlyoutRect | null {
  if (!node) return null
  const rect = node.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  const width = Math.min(120, Math.max(72, rect.width * 0.18))
  const height = Math.round(width * 0.64)
  return {
    left: Math.round(rect.left + rect.width / 2 - width / 2),
    top: Math.round(rect.top + rect.height / 2 - height / 2),
    width: Math.round(width),
    height,
  }
}

function captureFlyoutTargetRectFromPopover(rect: FloatingWindowBoundsRect | null): BrowserCaptureFlyoutRect | null {
  if (!rect || rect.width <= 0 || rect.height <= 0) return null
  const width = Math.round(clampNumber(CAPTURE_FLYOUT_TARGET_WIDTH, 52, Math.max(52, rect.width - 32)))
  const height = Math.round(width * 0.64)
  const left = Math.round(rect.left + clampNumber(rect.width * 0.08, 12, 28))
  const preferredTop = rect.top + clampNumber(rect.height * 0.3, 94, 132)
  const top = Math.round(clampNumber(preferredTop, rect.top + 64, rect.bottom - height - 14))
  return { left, top, width, height }
}

function captureFlyoutScale(source: BrowserCaptureFlyoutRect, target: BrowserCaptureFlyoutRect): number {
  const sourceWidth = Math.max(1, source.width)
  return Math.max(0.66, Math.min(0.92, target.width / sourceWidth))
}

function sameBoundsRect(left: FloatingWindowBoundsRect | null, right: FloatingWindowBoundsRect | null): boolean {
  if (left === right) return true
  if (!left || !right) return false
  return (
    Math.round(left.left) === Math.round(right.left) &&
    Math.round(left.top) === Math.round(right.top) &&
    Math.round(left.right) === Math.round(right.right) &&
    Math.round(left.bottom) === Math.round(right.bottom) &&
    Math.round(left.width) === Math.round(right.width) &&
    Math.round(left.height) === Math.round(right.height)
  )
}

function canDownloadFromBrowserView(url: string): boolean {
  return /^(https?:\/\/|blob:)/i.test(url)
}

function faviconForTab(tab: BrowserTab): JSX.Element {
  if (tab.favicon) {
    return <img src={tab.favicon} alt="" className="size-4 rounded-[3px]" draggable={false} />
  }
  if (!tab.url) return <IconBrowser size={15} stroke={1.7} aria-hidden="true" />
  return <IconWorld size={15} stroke={1.7} aria-hidden="true" />
}

function browserAssetFromDesktopAsset(asset: DesktopAssetDto, fallbackTitle: string): NomiBrowserAsset {
  const contentType = typeof asset.data.contentType === 'string' ? asset.data.contentType : ''
  const mediaType = asset.data.mediaType === 'video' || contentType.startsWith('video/') ? 'video' : 'image'
  const url = typeof asset.data.url === 'string' ? asset.data.url : ''
  return {
    id: asset.id,
    type: mediaType,
    source: 'my',
    title: asset.name || fallbackTitle || '网页图片',
    subtitle: '网页素材',
    previewUrl: url,
    tags: ['网页素材'],
  }
}

function overlayCaptureRequestFromBrowserEvent(
  event: Extract<DesktopBrowserResourceCaptureEvent, { ok: true }>,
): DesktopBrowserAssetOverlayCaptureRequest {
  return {
    requestId: `browser-capture-${event.viewId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url: event.url,
    mediaType: event.mediaType,
    title: event.title || event.pageTitle || undefined,
    fileName: event.fileName || undefined,
    sourceRect: event.sourceRect,
  }
}

function promptCaptureRequestFromBrowserEvent(
  event: Extract<DesktopBrowserPromptCaptureEvent, { ok: true }>,
): BrowserAssetPromptCaptureRequest {
  return {
    requestId: `browser-prompt-image-${event.viewId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sourceType: 'image',
    extractionMode: event.extractionMode === 'style' ? 'style' : 'replicate',
    viewId: event.viewId,
    sourceUrl: event.url,
    title: event.title || event.pageTitle || '网页图片提示词',
    fileName: event.fileName || undefined,
    pageUrl: event.pageUrl || undefined,
    pageTitle: event.pageTitle || undefined,
    referenceImages: [
      {
        url: event.url,
        title: event.title || event.pageTitle || undefined,
        sourceUrl: event.url,
      },
    ],
  }
}

function PromptModeOption({
  mode,
  onSelect,
}: {
  mode: BrowserPromptExtractionMode
  onSelect: (mode: BrowserPromptExtractionMode) => void
}): JSX.Element {
  const styleMode = mode === 'style'
  const Icon = styleMode ? IconPalette : IconBrush
  return (
    <button
      type="button"
      className="flex w-full cursor-pointer items-start gap-2 rounded-nomi-sm border-0 bg-transparent p-2 text-left text-caption text-nomi-ink-70 transition-colors hover:bg-nomi-ink-05 hover:text-nomi-ink"
      role="menuitem"
      onClick={() => onSelect(mode)}
    >
      <span
        className={cn(
          'mt-0.5 grid size-7 shrink-0 place-items-center rounded-pill',
          styleMode ? 'bg-nomi-accent-soft text-nomi-accent' : 'bg-nomi-ink-05 text-nomi-ink-65',
        )}
      >
        <Icon size={15} stroke={1.8} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-[1.25] text-nomi-ink">
          {BROWSER_PROMPT_EXTRACTION_MODE_LABELS[mode]}
        </span>
        <span className="mt-0.5 block text-micro leading-snug text-nomi-ink-45">
          {styleMode ? '提取配色、字体、构图、效果 JSON' : '还原主体、构图、光影和细节'}
        </span>
      </span>
    </button>
  )
}

export function NomiBrowserDialog({ opened, onClose }: NomiBrowserDialogProps): JSX.Element | null {
  const browserBridge = getDesktopBridge()?.browser
  const [tabs, setTabs] = React.useState<BrowserTab[]>(() => {
    const tab = createBlankTab()
    return [tab]
  })
  const [activeTabId, setActiveTabId] = React.useState<string>(() => tabs[0]?.id ?? createTabId())
  const [addressValue, setAddressValue] = React.useState('')
  const [bookmarks, setBookmarks] = React.useState<BrowserBookmark[]>(() => readBookmarks())
  const [browserAssetPopoverOpen, setBrowserAssetPopoverOpen] = React.useState(false)
  const [browserAssetPopoverRect, setBrowserAssetPopoverRect] = React.useState<FloatingWindowBoundsRect | null>(null)
  const [browserAssetPopoverDockMode, setBrowserAssetPopoverDockMode] =
    React.useState<DesktopBrowserAssetOverlayDockMode>(null)
  const [dockPanelWidth, setDockPanelWidth] = React.useState(500)
  const [webContentBounds, setWebContentBounds] = React.useState<FloatingWindowBoundsRect | null>(null)
  const dockResizingRef = React.useRef<{ startX: number; startWidth: number } | null>(null)
  const [browserResourceCaptureEnabled, setBrowserResourceCaptureEnabled] = React.useState(false)
  const [browserCaptureRequest, setBrowserCaptureRequest] = React.useState<BrowserAssetCaptureRequest | null>(null)
  const [browserPromptCaptureRequest, setBrowserPromptCaptureRequest] =
    React.useState<BrowserAssetPromptCaptureRequest | null>(null)
  const [tabContextMenu, setTabContextMenu] = React.useState<BrowserTabContextMenu | null>(null)
  const [bookmarkContextMenu, setBookmarkContextMenu] = React.useState<BrowserBookmarkContextMenu | null>(null)
  const [lastError, setLastError] = React.useState<string | null>(null)
  const [promptModePicker, setPromptModePicker] = React.useState<BrowserPromptModePickerState | null>(null)
  const [materialSitesOpen, setMaterialSitesOpen] = React.useState(false)
  const [dialogTopOffset, setDialogTopOffset] = React.useState(0)
  const [captureFlyouts, setCaptureFlyouts] = React.useState<BrowserCaptureFlyout[]>([])
  const [promptCategories, setPromptCategories] = React.useState(() =>
    readBrowserPromptCategories(getDesktopActiveProjectId()),
  )
  const webContainerRef = React.useRef<HTMLDivElement | null>(null)
  const browserViewHostRef = React.useRef<HTMLDivElement | null>(null)
  const tabContextMenuRef = React.useRef<HTMLDivElement | null>(null)
  const bookmarkContextMenuRef = React.useRef<HTMLDivElement | null>(null)
  const promptModePickerRef = React.useRef<HTMLDivElement | null>(null)
  const materialSitesRef = React.useRef<HTMLDivElement | null>(null)
  const tabsRef = React.useRef(tabs)
  const activeTabIdRef = React.useRef(activeTabId)
  const addressEditingRef = React.useRef(false)
  const pendingCaptureFlyoutRef = React.useRef<Extract<DesktopBrowserResourceCaptureEvent, { ok: true }> | null>(null)
  const lastShownBrowserViewIdRef = React.useRef<number | null>(null)
  const lastBrowserViewBoundsRef = React.useRef<{ viewId: number; bounds: DesktopBrowserViewBounds } | null>(null)
  const lastBrowserAssetOverlayHostRef = React.useRef<{ viewId: number; bounds: DesktopBrowserViewBounds } | null>(null)

  React.useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  React.useEffect(() => {
    activeTabIdRef.current = activeTabId
  }, [activeTabId])

  React.useEffect(() => {
    const refresh = (): void => {
      setPromptCategories(readBrowserPromptCategories(getDesktopActiveProjectId()))
    }
    const handleStorage = (event: StorageEvent): void => {
      if (event.key && event.key !== browserAssetLibraryKey(getDesktopActiveProjectId())) return
      refresh()
    }
    window.addEventListener(BROWSER_ASSET_LIBRARY_UPDATED_EVENT, refresh)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener(BROWSER_ASSET_LIBRARY_UPDATED_EVENT, refresh)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  React.useEffect(() => {
    if (!opened) return
    setPromptCategories(readBrowserPromptCategories(getDesktopActiveProjectId()))
  }, [opened])

  React.useEffect(() => {
    if (!promptModePicker) return undefined
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (promptModePickerRef.current?.contains(target)) return
      setPromptModePicker(null)
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setPromptModePicker(null)
    }
    window.addEventListener('pointerdown', handlePointerDown, { capture: true })
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true })
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [promptModePicker])

  React.useEffect(() => {
    if (!materialSitesOpen) return undefined
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (materialSitesRef.current?.contains(target)) return
      setMaterialSitesOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMaterialSitesOpen(false)
    }
    window.addEventListener('pointerdown', handlePointerDown, { capture: true })
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true })
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [materialSitesOpen])

  React.useEffect(() => {
    setPromptModePicker(null)
    setMaterialSitesOpen(false)
    setBookmarkContextMenu(null)
  }, [activeTabId, opened])

  React.useLayoutEffect(() => {
    if (!opened) return undefined
    const updateDialogTopOffset = (): void => {
      setDialogTopOffset(measureBrowserDialogTopOffset())
    }
    updateDialogTopOffset()
    window.addEventListener('resize', updateDialogTopOffset)
    const frame = window.requestAnimationFrame(updateDialogTopOffset)
    return () => {
      window.removeEventListener('resize', updateDialogTopOffset)
      window.cancelAnimationFrame(frame)
    }
  }, [opened])

  const activeTab = React.useMemo(() => tabs.find((tab) => tab.id === activeTabId) ?? null, [activeTabId, tabs])
  const activeBookmarked = React.useMemo(
    () => Boolean(activeTab?.url && bookmarks.some((bookmark) => bookmark.url === activeTab.url)),
    [activeTab, bookmarks],
  )
  const contextMenuTab = React.useMemo(
    () => tabs.find((tab) => tab.id === tabContextMenu?.tabId) ?? null,
    [tabContextMenu?.tabId, tabs],
  )
  const contextMenuBookmark = React.useMemo(
    () => bookmarks.find((bookmark) => bookmark.id === bookmarkContextMenu?.bookmarkId) ?? null,
    [bookmarkContextMenu?.bookmarkId, bookmarks],
  )
  const contextMenuTabBookmarked = React.useMemo(
    () => Boolean(contextMenuTab?.url && bookmarks.some((bookmark) => bookmark.url === contextMenuTab.url)),
    [bookmarks, contextMenuTab],
  )
  const browserPromptCategoryOptions = React.useMemo(
    () => promptCategories.map((category) => ({ id: category.id, label: category.label })),
    [promptCategories],
  )
  const useNativeBrowserAssetOverlay = Boolean(
    USE_NATIVE_BROWSER_ASSET_OVERLAY && activeTab?.viewId && browserBridge?.assetOverlay,
  )

  React.useEffect(() => {
    if (!browserBridge?.setPromptCategories) return
    for (const tab of tabs) {
      if (tab.viewId === null) continue
      browserBridge.setPromptCategories({ viewId: tab.viewId, categories: browserPromptCategoryOptions })
    }
  }, [browserBridge, browserPromptCategoryOptions, tabs])

  const syncWebContentBounds = React.useCallback((): void => {
    const node = webContainerRef.current
    if (!node) {
      setWebContentBounds((current) => (current === null ? current : null))
      return
    }
    const rect = toViewportRect(node.getBoundingClientRect())
    setWebContentBounds((current) => (sameBoundsRect(current, rect) ? current : rect))
  }, [])

  const hideTabView = React.useCallback(
    (tab: BrowserTab): void => {
      if (tab.viewId === null) return
      browserBridge?.hide({ viewId: tab.viewId })
      if (lastShownBrowserViewIdRef.current === tab.viewId) lastShownBrowserViewIdRef.current = null
    },
    [browserBridge],
  )

  const removeCaptureFlyout = React.useCallback((flyoutId: string): void => {
    setCaptureFlyouts((current) => current.filter((flyout) => flyout.id !== flyoutId))
  }, [])

  const startCaptureFlyout = React.useCallback(
    (event: Extract<DesktopBrowserResourceCaptureEvent, { ok: true }>): boolean => {
      const targetRect = captureFlyoutTargetRectFromPopover(browserAssetPopoverRect)
      if (!targetRect) return false
      const rawSourceRect = event.sourceRect
        ? {
            left: event.sourceRect.left,
            top: event.sourceRect.top,
            width: event.sourceRect.width,
            height: event.sourceRect.height,
          }
        : fallbackCaptureFlyoutSourceRect(webContainerRef.current)
      if (!rawSourceRect) return false
      const flyout: BrowserCaptureFlyout = {
        id: `capture-flyout-${event.viewId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url: event.url,
        mediaType: event.mediaType,
        sourceRect: fitCaptureFlyoutSourceRect(rawSourceRect),
        targetRect,
      }
      setCaptureFlyouts((current) => [...current.slice(-2), flyout])
      return true
    },
    [browserAssetPopoverRect],
  )

  React.useEffect(() => {
    if (!browserAssetPopoverRect || !pendingCaptureFlyoutRef.current) return
    const pending = pendingCaptureFlyoutRef.current
    if (startCaptureFlyout(pending)) pendingCaptureFlyoutRef.current = null
  }, [browserAssetPopoverRect, startCaptureFlyout])

  const syncActiveViewBounds = React.useCallback((): void => {
    const tab = tabsRef.current.find((item) => item.id === activeTabIdRef.current)
    const node = webContainerRef.current
    if (!browserBridge || !tab?.viewId || !node) {
      if (tab) hideTabView(tab)
      return
    }
    const containerRect = toViewportRect(node.getBoundingClientRect())
    const localAssetPopoverOpen = browserAssetPopoverOpen && !useNativeBrowserAssetOverlay
    const localSplitDocked =
      localAssetPopoverOpen && Boolean(browserAssetPopoverDockMode)
    const nativeSplitDocked =
      browserAssetPopoverOpen && Boolean(browserAssetPopoverDockMode) && useNativeBrowserAssetOverlay
    const popoverRect = nativeSplitDocked
      ? browserAssetPopoverRect ?? createFallbackAssetPopoverRect(containerRect)
      : null
    const browserRect = localSplitDocked
      ? browserViewHostRef.current
        ? toViewportRect(browserViewHostRef.current.getBoundingClientRect())
        : viewportRectFromEdges(containerRect.left, containerRect.top, containerRect.right - dockPanelWidth, containerRect.bottom)
      : popoverRect
        ? browserViewRectAroundPopover(containerRect, popoverRect, nativeSplitDocked ? 0 : BROWSER_VIEW_POPOVER_GAP)
        : containerRect
    if (!browserRect || browserRect.width < 1 || browserRect.height < 1) {
      hideTabView(tab)
      return
    }
    const bounds = browserBoundsFromRect(browserRect)
    const lastBounds = lastBrowserViewBoundsRef.current
    const boundsChanged =
      !lastBounds || lastBounds.viewId !== tab.viewId || !sameBrowserViewBounds(lastBounds.bounds, bounds)
    if (boundsChanged) {
      browserBridge.resize({
        viewId: tab.viewId,
        bounds,
      })
      lastBrowserViewBoundsRef.current = { viewId: tab.viewId, bounds }
    }
    if (lastShownBrowserViewIdRef.current !== tab.viewId || boundsChanged) {
      browserBridge.show({ viewId: tab.viewId })
      lastShownBrowserViewIdRef.current = tab.viewId
    }
  }, [
    browserAssetPopoverDockMode,
    browserAssetPopoverOpen,
    browserAssetPopoverRect,
    browserBridge,
    dockPanelWidth,
    hideTabView,
    useNativeBrowserAssetOverlay,
  ])

  const syncBrowserAssetOverlayHost = React.useCallback((): void => {
    const tab = tabsRef.current.find((item) => item.id === activeTabIdRef.current)
    const node = webContainerRef.current
    if (!browserBridge?.assetOverlay) return
    if (!tab?.viewId || !node) {
      lastBrowserAssetOverlayHostRef.current = null
      browserBridge.assetOverlay.close()
      return
    }
    const bounds = browserBoundsFromRect(toViewportRect(node.getBoundingClientRect()))
    const lastHost = lastBrowserAssetOverlayHostRef.current
    if (lastHost?.viewId === tab.viewId && sameBrowserViewBounds(lastHost.bounds, bounds)) return
    lastBrowserAssetOverlayHostRef.current = { viewId: tab.viewId, bounds }
    browserBridge.assetOverlay.updateHost({ viewId: tab.viewId, bounds })
  }, [browserBridge])

  const openNativeAssetPopover = React.useCallback(
    (
      captureRequest?: DesktopBrowserAssetOverlayCaptureRequest,
      promptRequest?: BrowserAssetPromptCaptureRequest,
    ): boolean => {
      const tab = tabsRef.current.find((item) => item.id === activeTabIdRef.current)
      const node = webContainerRef.current
      if (!useNativeBrowserAssetOverlay || !browserBridge?.assetOverlay || !tab?.viewId || !node) return false
      if (promptRequest && !browserBridge.assetOverlay.promptRequest) return false
      const wasPopoverOpen = browserAssetPopoverOpen
      const bounds = browserBoundsFromRect(toViewportRect(node.getBoundingClientRect()))
      browserBridge.assetOverlay.open({
        viewId: tab.viewId,
        bounds,
        ...(captureRequest ? { captureRequest } : {}),
        ...(promptRequest ? { promptRequest } : {}),
      })
      setBrowserAssetPopoverOpen(true)
      if (!wasPopoverOpen) {
        setBrowserAssetPopoverDockMode(null)
        setBrowserAssetPopoverRect(null)
      }
      return true
    },
    [browserAssetPopoverOpen, browserBridge, useNativeBrowserAssetOverlay],
  )

  React.useEffect(() => {
    if (!opened) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (tabContextMenu) {
        setTabContextMenu(null)
        return
      }
      if (bookmarkContextMenu) {
        setBookmarkContextMenu(null)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [bookmarkContextMenu, onClose, opened, tabContextMenu])

  React.useEffect(() => {
    if (!tabContextMenu) return
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (tabContextMenuRef.current?.contains(target)) return
      setTabContextMenu(null)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [tabContextMenu])

  React.useEffect(() => {
    if (!bookmarkContextMenu) return
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (bookmarkContextMenuRef.current?.contains(target)) return
      setBookmarkContextMenu(null)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [bookmarkContextMenu])

  React.useEffect(() => {
    if (!tabContextMenu) return
    if (tabs.some((tab) => tab.id === tabContextMenu.tabId)) return
    setTabContextMenu(null)
  }, [tabContextMenu, tabs])

  React.useEffect(() => {
    if (!bookmarkContextMenu) return
    if (bookmarks.some((bookmark) => bookmark.id === bookmarkContextMenu.bookmarkId)) return
    setBookmarkContextMenu(null)
  }, [bookmarkContextMenu, bookmarks])

  React.useEffect(() => {
    if (!browserBridge) return undefined
    return browserBridge.onState((event: DesktopBrowserViewState) => {
      setTabs((current) => {
        let changed = false
        const nextTabs = current.map((tab) => {
          if (tab.viewId !== event.viewId) return tab
          const nextTab = {
            ...tab,
            title: event.title || browserUrlDisplayTitle(event.url),
            url: event.url || tab.url,
            favicon: event.favicon || tab.favicon,
            canGoBack: event.canGoBack,
            canGoForward: event.canGoForward,
            loading: event.loading,
          }
          if (
            tab.title === nextTab.title &&
            tab.url === nextTab.url &&
            tab.favicon === nextTab.favicon &&
            tab.canGoBack === nextTab.canGoBack &&
            tab.canGoForward === nextTab.canGoForward &&
            tab.loading === nextTab.loading
          ) {
            return tab
          }
          changed = true
          return nextTab
        })
        return changed ? nextTabs : current
      })
      if (event.tabId === activeTabIdRef.current && event.url && !addressEditingRef.current) {
        setAddressValue(event.url)
      }
    })
  }, [browserBridge])

  React.useEffect(() => {
    if (!USE_NATIVE_BROWSER_ASSET_OVERLAY || !browserBridge?.assetOverlay?.onState) return undefined
    return browserBridge.assetOverlay.onState((state) => {
      const nextOpened = Boolean(state.opened)
      const nextDockMode = nextOpened ? (state.dockMode ?? null) : null
      const nextPopoverRect = nextOpened ? (state.popoverRect ?? null) : null
      const nextCaptureEnabled = Boolean(nextOpened && state.captureEnabled)
      setBrowserAssetPopoverOpen((current) => (current === nextOpened ? current : nextOpened))
      setBrowserAssetPopoverDockMode((current) => (current === nextDockMode ? current : nextDockMode))
      setBrowserAssetPopoverRect((current) => (sameBoundsRect(current, nextPopoverRect) ? current : nextPopoverRect))
      setBrowserResourceCaptureEnabled((current) =>
        current === nextCaptureEnabled ? current : nextCaptureEnabled,
      )
      if (!state.opened) {
        setBrowserCaptureRequest(null)
        setBrowserPromptCaptureRequest(null)
      }
    })
  }, [browserBridge])

  React.useEffect(() => {
    if (USE_NATIVE_BROWSER_ASSET_OVERLAY || !browserAssetPopoverOpen) return
    browserBridge?.assetOverlay?.close()
  }, [browserAssetPopoverOpen, browserBridge])

  React.useEffect(() => {
    if (!browserBridge?.onResourceCapture) return undefined
    return browserBridge.onResourceCapture((event: DesktopBrowserResourceCaptureEvent) => {
      if (event.tabId !== activeTabIdRef.current) return
      if (!event.ok) {
        setLastError(
          event.reason === 'empty'
            ? '先将鼠标悬停在图片或视频上，再按 Ctrl+C 保存。'
            : event.message || '网页素材捕捞失败',
        )
        return
      }
      setLastError(null)
      const request = overlayCaptureRequestFromBrowserEvent(event)
      if (openNativeAssetPopover(request)) return
      setBrowserAssetPopoverOpen(true)
      if (!startCaptureFlyout(event)) pendingCaptureFlyoutRef.current = event
      setBrowserCaptureRequest({
        requestId: request.requestId,
        url: event.url,
        mediaType: event.mediaType,
        title: event.title || event.pageTitle || undefined,
        fileName: event.fileName || undefined,
      })
    })
  }, [browserBridge, openNativeAssetPopover, startCaptureFlyout])

  React.useEffect(() => {
    const viewId =
      browserAssetPopoverOpen && browserResourceCaptureEnabled && activeTab?.viewId ? activeTab.viewId : null
    if (!browserBridge?.setResourceCapture || viewId === null) return undefined
    browserBridge.setResourceCapture({ viewId, enabled: true })
    return () => browserBridge.setResourceCapture?.({ viewId, enabled: false })
  }, [activeTab?.viewId, browserAssetPopoverOpen, browserBridge, browserResourceCaptureEnabled])

  React.useEffect(() => {
    if (
      !browserAssetPopoverOpen ||
      !browserResourceCaptureEnabled ||
      !activeTab?.viewId ||
      !browserBridge?.captureResource
    ) {
      return undefined
    }
    const viewId = activeTab.viewId
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat) return
      if (event.key.toLowerCase() !== 'c') return
      if (!event.ctrlKey && !event.metaKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input,textarea,select,[contenteditable="true"]')) return
      event.preventDefault()
      event.stopPropagation()
      browserBridge.captureResource?.({ viewId })
    }
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [activeTab?.viewId, browserAssetPopoverOpen, browserBridge, browserResourceCaptureEnabled])

  React.useEffect(() => {
    if (!opened) return undefined
    const node = webContainerRef.current
    if (!node) return undefined
    const syncViews = (): void => {
      syncWebContentBounds()
      syncActiveViewBounds()
      syncBrowserAssetOverlayHost()
    }
    const observer = new ResizeObserver(syncViews)
    observer.observe(node)
    window.addEventListener('resize', syncViews)
    const frame = window.requestAnimationFrame(syncViews)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', syncViews)
      window.cancelAnimationFrame(frame)
    }
  }, [opened, syncActiveViewBounds, syncBrowserAssetOverlayHost, syncWebContentBounds])

  React.useEffect(() => {
    syncWebContentBounds()
    syncActiveViewBounds()
    syncBrowserAssetOverlayHost()
  }, [dialogTopOffset, syncActiveViewBounds, syncBrowserAssetOverlayHost, syncWebContentBounds])

  React.useEffect(() => {
    if (!opened) return
    syncWebContentBounds()
    syncActiveViewBounds()
    syncBrowserAssetOverlayHost()
  }, [opened, syncActiveViewBounds, syncBrowserAssetOverlayHost, syncWebContentBounds])

  React.useEffect(() => {
    if (opened) return
    tabsRef.current.forEach(hideTabView)
    browserBridge?.assetOverlay?.close()
    setWebContentBounds(null)
    setBrowserAssetPopoverOpen(false)
    setBrowserAssetPopoverRect(null)
    setBrowserAssetPopoverDockMode(null)
    setBrowserResourceCaptureEnabled(false)
    lastShownBrowserViewIdRef.current = null
    lastBrowserViewBoundsRef.current = null
    lastBrowserAssetOverlayHostRef.current = null
    setTabContextMenu(null)
    setCaptureFlyouts((current) => (current.length === 0 ? current : []))
  }, [browserBridge, hideTabView, opened])

  const handleDockResizeStart = React.useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dockResizingRef.current = { startX: event.clientX, startWidth: dockPanelWidth }
  }, [dockPanelWidth])

  const handleDockResizeMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    if (!dockResizingRef.current) return
    const node = webContainerRef.current
    const maxWidth = node ? Math.floor(node.getBoundingClientRect().width * 0.75) : 800
    const dx = dockResizingRef.current.startX - event.clientX
    setDockPanelWidth(Math.max(220, Math.min(maxWidth, dockResizingRef.current.startWidth + dx)))
  }, [])

  const handleDockResizeEnd = React.useCallback((): void => {
    dockResizingRef.current = null
  }, [])

  React.useEffect(() => {
    tabs.forEach((tab) => {
      if (tab.id === activeTabId) return
      hideTabView(tab)
    })
    syncActiveViewBounds()
    syncBrowserAssetOverlayHost()
  }, [activeTabId, hideTabView, syncActiveViewBounds, syncBrowserAssetOverlayHost, tabs])

  React.useEffect(
    () => () => {
      tabsRef.current.forEach((tab) => {
        if (tab.viewId !== null) browserBridge?.destroyView({ viewId: tab.viewId })
      })
    },
    [browserBridge],
  )

  const createTab = React.useCallback(
    async (input?: string): Promise<void> => {
      if (tabsRef.current.length >= TAB_LIMIT) {
        setLastError(`最多只能打开 ${TAB_LIMIT} 个标签页`)
        return
      }
      const tabId = createTabId()
      const url = input ? normalizeBrowserInput(input) : ''
      let viewId: number | null = null
      if (url) {
        try {
          if (browserBridge) {
            const result = await browserBridge.createView({
              tabId,
            })
            viewId = result.viewId
            browserBridge.navigate({ viewId, url })
          }
          setLastError(null)
        } catch (error) {
          setLastError(error instanceof Error ? error.message : '浏览器视图创建失败')
        }
      }
      const tab: BrowserTab = {
        id: tabId,
        viewId,
        title: url ? browserUrlDisplayTitle(url) : '新建标签页',
        url,
        canGoBack: false,
        canGoForward: false,
        loading: Boolean(viewId),
      }
      setTabs((current) => [...current, tab])
      setActiveTabId(tab.id)
      setAddressValue(url)
    },
    [browserBridge],
  )

  const navigateTab = React.useCallback(
    async (tabId: string, input: string): Promise<void> => {
      if (tabsRef.current.length >= TAB_LIMIT) {
        const target = tabsRef.current.find((tab) => tab.id === tabId)
        if (!target) return
      }
      const url = normalizeBrowserInput(input)
      const tab = tabsRef.current.find((item) => item.id === tabId)
      if (!tab) return
      let viewId = tab.viewId
      try {
        if (browserBridge && viewId === null) {
          const result = await browserBridge.createView({
            tabId,
          })
          viewId = result.viewId
        }
        if (browserBridge && viewId !== null) {
          browserBridge.navigate({ viewId, url })
        }
        setLastError(null)
      } catch (error) {
        setLastError(error instanceof Error ? error.message : '浏览器视图创建失败')
      }
      setTabs((current) =>
        current.map((item) =>
          item.id === tabId
            ? {
                ...item,
                viewId,
                title: browserUrlDisplayTitle(url),
                url,
                loading: Boolean(viewId),
              }
            : item,
        ),
      )
      setActiveTabId(tabId)
      setAddressValue(url)
    },
    [browserBridge],
  )

  const navigateActiveTab = React.useCallback((): void => {
    addressEditingRef.current = false
    const tab = tabsRef.current.find((item) => item.id === activeTabIdRef.current)
    if (!tab) {
      createTab(addressValue)
      return
    }
    void navigateTab(tab.id, addressValue)
  }, [addressValue, createTab, navigateTab])

  const handleAddressFocus = React.useCallback((): void => {
    addressEditingRef.current = true
  }, [])

  const handleAddressBlur = React.useCallback((): void => {
    addressEditingRef.current = false
  }, [])

  const handleAddressChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
    addressEditingRef.current = true
    setAddressValue(event.currentTarget.value)
  }, [])

  const closeTab = React.useCallback(
    (tabId: string): void => {
      const current = tabsRef.current
      const index = current.findIndex((tab) => tab.id === tabId)
      const closing = current[index]
      if (!closing) return
      if (closing.viewId !== null) browserBridge?.destroyView({ viewId: closing.viewId })
      const next = current.filter((tab) => tab.id !== tabId)
      const normalizedNext = next.length > 0 ? next : [createBlankTab()]
      setTabs(normalizedNext)
      if (activeTabIdRef.current === tabId) {
        const replacement = normalizedNext[Math.max(0, index - 1)] ?? normalizedNext[0]
        setActiveTabId(replacement.id)
        setAddressValue(replacement.url)
      }
    },
    [browserBridge],
  )

  const closeAllTabs = React.useCallback((): void => {
    tabsRef.current.forEach((tab) => {
      if (tab.viewId !== null) browserBridge?.destroyView({ viewId: tab.viewId })
    })
    const blankTab = createBlankTab()
    setTabs([blankTab])
    setActiveTabId(blankTab.id)
    setAddressValue('')
    setTabContextMenu(null)
  }, [browserBridge])

  const saveBookmark = React.useCallback((tab: BrowserTab | null): void => {
    if (!tab) return
    setBookmarks((current) => {
      if (current.some((bookmark) => bookmark.url === tab.url)) return current
      const next = [
        ...current,
        {
          id: `bookmark-${Date.now()}`,
          title: tab.title || browserUrlDisplayTitle(tab.url),
          url: tab.url,
          favicon: tab.favicon,
          createdAt: Date.now(),
        },
      ]
      writeBookmarks(next)
      return next
    })
  }, [])

  const removeBookmark = React.useCallback((bookmarkId: string): void => {
    setBookmarks((current) => {
      const next = current.filter((bookmark) => bookmark.id !== bookmarkId)
      writeBookmarks(next)
      return next
    })
  }, [])

  const renameBookmark = React.useCallback((bookmark: BrowserBookmark): void => {
    const nextTitle = window.prompt('重命名书签', bookmark.title)?.trim()
    if (!nextTitle || nextTitle === bookmark.title) return
    setBookmarks((current) => {
      const next = current.map((item) => (item.id === bookmark.id ? { ...item, title: nextTitle } : item))
      writeBookmarks(next)
      return next
    })
  }, [])

  const openBookmarkContextMenu = React.useCallback(
    (bookmark: BrowserBookmark, event: React.MouseEvent<HTMLButtonElement>): void => {
      event.preventDefault()
      event.stopPropagation()
      const position = clampTabContextMenuPosition(event.clientX, event.clientY, 2)
      setPromptModePicker(null)
      setMaterialSitesOpen(false)
      setTabContextMenu(null)
      setBookmarkContextMenu({
        bookmarkId: bookmark.id,
        x: position.x,
        y: position.y,
      })
    },
    [],
  )

  const openTabContextMenu = React.useCallback((tab: BrowserTab, event: React.MouseEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    const itemCount = tabsRef.current.length > 1 ? 3 : 2
    const position = clampTabContextMenuPosition(event.clientX, event.clientY, itemCount)
    setPromptModePicker(null)
    setMaterialSitesOpen(false)
    setBookmarkContextMenu(null)
    const bookmarked = Boolean(tab.url && bookmarks.some((bookmark) => bookmark.url === tab.url))
    const items: DesktopBrowserChromeMenuItem[] = [
      {
        id: 'bookmark',
        label: bookmarked ? '已收藏' : '收藏',
        enabled: Boolean(tab.url && !bookmarked),
      },
      { id: 'close-tab', label: '关闭标签' },
      ...(tabsRef.current.length > 1
        ? [
            { type: 'separator' as const },
            { id: 'close-all', label: '关闭全部' },
          ]
        : []),
    ]
    if (browserBridge?.showChromeMenu) {
      setTabContextMenu(null)
      void (async () => {
        const result = await browserBridge.showChromeMenu?.({
          x: position.x,
          y: position.y,
          width: TAB_CONTEXT_MENU_WIDTH,
          items,
        })
        if (result?.id === 'bookmark') saveBookmark(tab)
        if (result?.id === 'close-tab') closeTab(tab.id)
        if (result?.id === 'close-all') closeAllTabs()
      })()
      return
    }
    setTabContextMenu({
      tabId: tab.id,
      x: position.x,
      y: position.y,
    })
  }, [bookmarks, browserBridge, closeAllTabs, closeTab, saveBookmark])

  const openAssetPopoverFromBrowser = React.useCallback((): void => {
    if (openNativeAssetPopover()) return
    setBrowserAssetPopoverOpen(true)
  }, [openNativeAssetPopover])

  const openPromptCaptureInAssetPopover = React.useCallback(
    (request: BrowserAssetPromptCaptureRequest): void => {
      setLastError(null)
      if (openNativeAssetPopover(undefined, request)) return
      setBrowserAssetPopoverOpen(true)
      setBrowserPromptCaptureRequest(request)
    },
    [openNativeAssetPopover],
  )

  React.useEffect(
    () =>
      subscribeBrowserAssetPopoverOpen((nextOpened) => {
        if (nextOpened && openNativeAssetPopover()) return
        if (!nextOpened) browserBridge?.assetOverlay?.close()
        setBrowserAssetPopoverOpen(nextOpened)
      }),
    [browserBridge, openNativeAssetPopover],
  )

  React.useEffect(() => {
    if (!browserBridge?.onPromptCapture) return undefined
    return browserBridge.onPromptCapture((event: DesktopBrowserPromptCaptureEvent) => {
      if (event.tabId !== activeTabIdRef.current) return
      if (!event.ok) {
        setLastError(event.reason === 'empty' ? '没有找到可提取提示词的图片。' : event.message || '图片提示词提取入口失败')
        return
      }
      openPromptCaptureInAssetPopover(promptCaptureRequestFromBrowserEvent(event))
    })
  }, [browserBridge, openPromptCaptureInAssetPopover])

  React.useEffect(() => {
    if (!browserBridge?.onTextPromptSave) return undefined
    return browserBridge.onTextPromptSave((event: DesktopBrowserTextPromptSaveEvent) => {
      if (event.tabId !== activeTabIdRef.current) return
      if (!event.ok) {
        setLastError(event.message || '保存网页选中文字失败')
        return
      }
      const saved = saveBrowserPromptCard({
        projectId: getDesktopActiveProjectId(),
        prompt: event.prompt,
        promptType: event.promptType,
        title: event.pageTitle,
      })
      if (saved) toast('已保存到素材盒提示词库', 'success')
    })
  }, [browserBridge])

  const runBrowserScreenshotPrompt = React.useCallback(
    (mode: BrowserPromptExtractionMode, tabSnapshot: BrowserTab): void => {
      const viewId = tabSnapshot.viewId
      if (!viewId) {
        setLastError('打开网页后才能截图提取提示词。')
        return
      }
      setPromptModePicker(null)
      void (async () => {
        browserBridge?.assetOverlay?.close()
        setBrowserAssetPopoverOpen(false)
        setBrowserAssetPopoverRect(null)
        setBrowserAssetPopoverDockMode(null)
        setBrowserResourceCaptureEnabled(false)
        setBrowserPromptCaptureRequest(null)
        await new Promise((resolve) => window.setTimeout(resolve, 80))
        const selection = await browserBridge?.selectPromptScreenshot?.({ viewId })
        if (!selection) {
          setLastError('当前浏览器不支持选区截图。')
          return
        }
        if (!selection.ok) {
          if (selection.reason === 'error') setLastError(selection.message || '选区截图失败')
          return
        }
        setLastError(null)
        openPromptCaptureInAssetPopover({
          requestId: `browser-prompt-screenshot-${viewId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          sourceType: 'screenshot',
          extractionMode: mode,
          viewId,
          title: tabSnapshot.title || (mode === 'style' ? '网页选区风格' : '网页选区提示词'),
          fileName: `browser-selection-${Date.now()}.png`,
          pageUrl: tabSnapshot.url || undefined,
          pageTitle: tabSnapshot.title || undefined,
          sourceRect: selection.rect,
        })
      })()
    },
    [browserBridge, openPromptCaptureInAssetPopover],
  )

  const openBrowserScreenshotPromptModePicker = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>): void => {
      if (!activeTab?.viewId) {
        setLastError('打开网页后才能截图提取提示词。')
        return
      }
      const rect = event.currentTarget.getBoundingClientRect()
      const x = Math.round(
        clampNumber(
          rect.right - PROMPT_MODE_PICKER_WIDTH,
          PROMPT_MODE_PICKER_MARGIN,
          Math.max(PROMPT_MODE_PICKER_MARGIN, window.innerWidth - PROMPT_MODE_PICKER_WIDTH - PROMPT_MODE_PICKER_MARGIN),
        ),
      )
      const y = Math.round(
        clampNumber(
          rect.bottom + PROMPT_MODE_PICKER_MARGIN,
          PROMPT_MODE_PICKER_MARGIN,
          Math.max(PROMPT_MODE_PICKER_MARGIN, window.innerHeight - PROMPT_MODE_PICKER_ESTIMATED_HEIGHT - PROMPT_MODE_PICKER_MARGIN),
        ),
      )
      setLastError(null)
      setTabContextMenu(null)
      if (browserBridge?.showChromeMenu) {
        setPromptModePicker(null)
        void (async () => {
          const result = await browserBridge.showChromeMenu?.({
            x,
            y,
            width: PROMPT_MODE_PICKER_WIDTH,
            items: [
              {
                id: 'replicate',
                label: BROWSER_PROMPT_EXTRACTION_MODE_LABELS.replicate,
                description: '还原主体、构图、光影和细节',
              },
              {
                id: 'style',
                label: BROWSER_PROMPT_EXTRACTION_MODE_LABELS.style,
                description: '提取配色、字体、构图、效果 JSON',
              },
            ],
          })
          if (result?.id === 'replicate' || result?.id === 'style') {
            runBrowserScreenshotPrompt(result.id, activeTab)
          }
        })()
        return
      }
      setPromptModePicker({
        x,
        y,
        tab: activeTab,
      })
    },
    [activeTab, browserBridge, runBrowserScreenshotPrompt],
  )

  const handleBrowserAssetPopoverOpenChange = React.useCallback((nextOpen: boolean): void => {
    setBrowserAssetPopoverOpen(nextOpen)
    if (!nextOpen) {
      setBrowserAssetPopoverRect(null)
      setBrowserAssetPopoverDockMode(null)
      setBrowserResourceCaptureEnabled(false)
      setBrowserPromptCaptureRequest(null)
    }
  }, [])

  const handleBrowserAssetPopoverRectChange = React.useCallback((nextRect: FloatingWindowBoundsRect | null): void => {
    setBrowserAssetPopoverRect((current) => (sameBoundsRect(current, nextRect) ? current : nextRect))
  }, [])

  const toggleBrowserResourceCapture = React.useCallback((): void => {
    if (!activeTab?.viewId || !browserBridge?.setResourceCapture) {
      setLastError('打开网页后才能使用资源捕捞。')
      return
    }
    setLastError(null)
    if (openNativeAssetPopover()) return
    setBrowserAssetPopoverOpen(true)
    setBrowserResourceCaptureEnabled((enabled) => !enabled)
  }, [activeTab?.viewId, browserBridge, openNativeAssetPopover])

  const importBrowserAssetToAssetPopover = React.useCallback(
    async (input: BrowserAssetRemoteImportInput): Promise<NomiBrowserAsset> => {
      const projectId = getDesktopActiveProjectId()
      if (!projectId) throw new Error('projectId is required')
      const tab = tabsRef.current.find((item) => item.id === activeTabIdRef.current)
      const fallbackTitle = input.title || input.fileName || (input.mediaType === 'video' ? '网页视频' : '网页图片')
      if (tab?.viewId && browserBridge?.importMedia && canDownloadFromBrowserView(input.url)) {
        const asset = await browserBridge.importMedia({
          viewId: tab.viewId,
          projectId,
          url: input.url,
          fileName: input.fileName,
          title: input.title,
          mediaType: input.mediaType,
        })
        return browserAssetFromDesktopAsset(asset, fallbackTitle)
      }
      if (tab?.viewId && browserBridge?.importImage && input.mediaType !== 'video' && /^https?:\/\//i.test(input.url)) {
        const asset = await browserBridge.importImage({
          viewId: tab.viewId,
          projectId,
          url: input.url,
          fileName: input.fileName,
          title: input.title,
        })
        return browserAssetFromDesktopAsset(asset, fallbackTitle)
      }
      const asset = await getDesktopBridge()?.assets.importRemoteUrl({
        projectId,
        url: input.url,
        kind: 'browser-capture',
        fileName: input.fileName,
      })
      if (!asset) throw new Error('desktop asset import is unavailable')
      return browserAssetFromDesktopAsset(asset, fallbackTitle)
    },
    [browserBridge],
  )

  const localBrowserAssetPopoverSplit = Boolean(browserAssetPopoverDockMode && !useNativeBrowserAssetOverlay)

  if (!opened) return null

  return (
    <BodyPortal>
      <div
        className="nomi-browser-dialog-root fixed bottom-0 left-0 right-0 z-[520] bg-nomi-paper font-nomi-sans text-nomi-ink"
        style={{ top: dialogTopOffset }}
      >
        <section
          className="nomi-browser-dialog__panel absolute inset-0 flex h-full min-h-0 w-full flex-col overflow-hidden border-0 bg-nomi-paper shadow-none"
          role="dialog"
          aria-modal="true"
          aria-label="浏览器"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex min-h-11 shrink-0 items-end gap-1 border-b border-nomi-line-soft bg-nomi-bg px-3 pt-2">
            <div className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {tabs.map((tab) => {
                const active = tab.id === activeTabId
                return (
                  <div
                    key={tab.id}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      'group grid h-9 min-w-20 max-w-[200px] flex-[0_1_200px] cursor-pointer grid-cols-[16px_minmax(0,1fr)_20px] items-center gap-2 rounded-t-nomi border border-b-0 px-2 text-left',
                      active
                        ? 'border-nomi-line bg-nomi-paper text-nomi-ink shadow-nomi-sm'
                        : 'border-transparent bg-transparent text-nomi-ink-60 hover:bg-nomi-paper/70 hover:text-nomi-ink',
                    )}
                    title={tab.title}
                    onClick={() => {
                      setTabContextMenu(null)
                      setActiveTabId(tab.id)
                      setAddressValue(tab.url)
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      setTabContextMenu(null)
                      setActiveTabId(tab.id)
                      setAddressValue(tab.url)
                    }}
                    onContextMenu={(event) => openTabContextMenu(tab, event)}
                  >
                    <span className="grid size-4 place-items-center text-nomi-ink-40">{faviconForTab(tab)}</span>
                    <span className="min-w-0 truncate text-caption font-medium">
                      {tab.loading ? '加载中...' : tab.title}
                    </span>
                    <button
                      type="button"
                      className="grid size-5 cursor-pointer place-items-center rounded-nomi-sm border-0 bg-transparent text-nomi-ink-40 opacity-70 hover:bg-nomi-ink-05 hover:text-nomi-ink group-hover:opacity-100"
                      aria-label={`关闭 ${tab.title}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        setTabContextMenu(null)
                        closeTab(tab.id)
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        event.stopPropagation()
                        setTabContextMenu(null)
                        closeTab(tab.id)
                      }}
                    >
                      <IconX size={13} stroke={1.9} aria-hidden="true" />
                    </button>
                  </div>
                )
              })}
              <button
                type="button"
                className={cn(TOOL_BUTTON_CLASS, 'mb-0.5')}
                aria-label="新建标签页"
                disabled={tabs.length >= TAB_LIMIT}
                onClick={() => createTab()}
              >
                <IconPlus size={17} stroke={1.8} aria-hidden="true" />
              </button>
            </div>
            <span className="mx-1 h-5 w-px bg-nomi-line-soft" aria-hidden="true" />
            <button type="button" className={TOOL_BUTTON_CLASS} aria-label="关闭浏览器" onClick={onClose}>
              <IconX size={18} stroke={1.8} aria-hidden="true" />
            </button>
          </div>

          <form
            className="grid min-h-12 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-nomi-line-soft bg-nomi-paper px-3"
            onSubmit={(event) => {
              event.preventDefault()
              navigateActiveTab()
            }}
          >
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={TOOL_BUTTON_CLASS}
                aria-label="后退"
                disabled={!activeTab?.canGoBack}
                onClick={() => activeTab?.viewId && browserBridge?.back({ viewId: activeTab.viewId })}
              >
                <IconArrowLeft size={17} stroke={1.8} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={TOOL_BUTTON_CLASS}
                aria-label="前进"
                disabled={!activeTab?.canGoForward}
                onClick={() => activeTab?.viewId && browserBridge?.forward({ viewId: activeTab.viewId })}
              >
                <IconArrowRight size={17} stroke={1.8} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={TOOL_BUTTON_CLASS}
                aria-label="刷新"
                disabled={!activeTab?.viewId}
                onClick={() => activeTab?.viewId && browserBridge?.reload({ viewId: activeTab.viewId })}
              >
                <IconRefresh size={17} stroke={1.8} aria-hidden="true" />
              </button>
            </div>
            <div className="flex h-8 min-w-0 items-center gap-2 rounded-pill border border-nomi-line bg-nomi-bg py-0 pl-3 pr-1 text-caption text-nomi-ink-60 focus-within:border-nomi-line focus-within:ring-0">
              <IconExternalLink size={14} stroke={1.7} className="shrink-0 text-nomi-ink-30" aria-hidden="true" />
              <input
                value={addressValue}
                onFocus={handleAddressFocus}
                onBlur={handleAddressBlur}
                onChange={handleAddressChange}
                placeholder="输入网址或搜索关键词"
                aria-label="地址栏"
                className="h-full min-w-0 flex-1 border-0 bg-transparent text-body-sm leading-8 text-nomi-ink outline-none ring-0 placeholder:text-nomi-ink-30 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
              />
              <button
                type="button"
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-pill border-0 bg-transparent',
                  'cursor-pointer text-nomi-ink-35 transition-colors duration-[var(--nomi-transition-fast)] hover:bg-nomi-ink-05 hover:text-nomi-ink',
                  activeBookmarked && 'text-nomi-accent hover:text-nomi-accent',
                  (!activeTab?.url || activeBookmarked) && 'cursor-default',
                )}
                aria-label="保存为书签"
                aria-pressed={activeBookmarked}
                disabled={!activeTab?.url || activeBookmarked}
                onClick={() => saveBookmark(activeTab)}
              >
                {activeBookmarked ? (
                  <IconStarFilled size={15} aria-hidden="true" />
                ) : (
                  <IconStar size={15} stroke={1.8} aria-hidden="true" />
                )}
              </button>
            </div>
            <div className="flex items-center gap-1">
              <div ref={materialSitesRef} className="relative">
                <button
                  type="button"
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-nomi-sm border-0 bg-transparent px-2',
                    'cursor-pointer text-caption font-semibold text-nomi-ink-60 transition-[background,color] duration-[var(--nomi-transition-fast)]',
                    'hover:bg-nomi-ink-05 hover:text-nomi-ink',
                    materialSitesOpen && 'bg-nomi-ink-05 text-nomi-ink',
                  )}
                  aria-label="素材网站"
                  aria-haspopup="dialog"
                  aria-expanded={materialSitesOpen}
                  onClick={() => setMaterialSitesOpen((value) => !value)}
                >
                  <IconWorld size={16} stroke={1.8} aria-hidden="true" />
                  <span className="whitespace-nowrap">素材网站</span>
                </button>
                {materialSitesOpen ? (
                  <div
                    className="absolute right-0 top-[calc(100%+6px)] z-[12] w-[210px] rounded-nomi border border-nomi-line bg-nomi-paper p-1 shadow-nomi-lg"
                    role="dialog"
                    aria-label="素材网站列表"
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    {MATERIAL_SITE_SHORTCUTS.map((site) => (
                      <button
                        key={site.url}
                        type="button"
                        className="flex h-9 w-full items-center gap-2 rounded-nomi-sm border-0 bg-transparent px-2.5 text-left text-body-sm text-nomi-ink-70 hover:bg-nomi-ink-05 hover:text-nomi-ink"
                        onClick={() => {
                          setMaterialSitesOpen(false)
                          void createTab(site.url)
                        }}
                      >
                        <IconWorld size={15} stroke={1.7} className="shrink-0 text-nomi-ink-35" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{site.name}</span>
                        <IconExternalLink size={13} stroke={1.7} className="shrink-0 text-nomi-ink-30" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className={TOOL_BUTTON_CLASS}
                aria-label="截图提取提示词"
                title="截图提取提示词"
                disabled={!activeTab?.viewId}
                onClick={openBrowserScreenshotPromptModePicker}
              >
                <LucideCamera size={17} strokeWidth={1.8} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={TOOL_BUTTON_CLASS}
                aria-label="打开素材盒"
                title="素材盒"
                onClick={openAssetPopoverFromBrowser}
              >
                <LucideBox size={17} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
          </form>

          <div className="flex min-h-9 shrink-0 items-center gap-1 overflow-hidden border-b border-nomi-line-soft bg-nomi-paper px-3">
            {bookmarks.slice(0, 10).map((bookmark) => (
              <button
                key={bookmark.id}
                type="button"
                className="group inline-flex h-7 min-w-0 max-w-[180px] items-center gap-1.5 rounded-nomi-sm border-0 bg-transparent px-2 text-caption text-nomi-ink-60 hover:bg-nomi-ink-05 hover:text-nomi-ink"
                title={bookmark.url}
                onClick={() => {
                  setBookmarkContextMenu(null)
                  void createTab(bookmark.url)
                }}
                onContextMenu={(event) => openBookmarkContextMenu(bookmark, event)}
              >
                <IconStar
                  size={13}
                  stroke={1.7}
                  className="shrink-0 text-nomi-ink-30 group-hover:text-nomi-accent"
                  aria-hidden="true"
                />
                <span className="min-w-0 truncate">{bookmark.title}</span>
              </button>
            ))}
            {bookmarks.length > 10 ? <span className="px-2 text-caption text-nomi-ink-30">···</span> : null}
            <span className="ml-auto shrink-0 text-micro text-nomi-ink-30">右键标签或书签打开菜单</span>
          </div>

          <main
            ref={webContainerRef}
            className={cn(
              'min-h-0 flex-1 overflow-hidden bg-nomi-bg',
              localBrowserAssetPopoverSplit ? 'flex flex-row' : 'relative',
            )}
            aria-label="网页内容"
          >
            <div
              ref={browserViewHostRef}
              className={cn(
                'relative overflow-hidden',
                localBrowserAssetPopoverSplit ? 'min-h-0 min-w-0 flex-1' : 'absolute inset-0',
              )}
            >
            {!activeTab?.viewId ? (
              <div className="absolute inset-0 grid place-items-center overflow-auto p-8">
                <div className="grid w-full max-w-[880px] gap-8">
                  <div className="text-center">
                    <div className="mx-auto mb-4 grid size-12 place-items-center">
                      <NomiLogoMark size={40} />
                    </div>
                    <h3 className="m-0 text-h2 font-semibold text-nomi-ink">打开网页参考</h3>
                    <p className="m-0 mt-2 text-body-sm text-nomi-ink-40">
                      输入网址直达，或用 Bing 搜索关键词
                    </p>
                  </div>
                  <form
                    className="mx-auto w-full max-w-[560px]"
                    onSubmit={(event) => {
                      event.preventDefault()
                      navigateActiveTab()
                    }}
                  >
                    <div className="flex items-center gap-2 rounded-pill border border-nomi-line bg-nomi-paper p-1.5 pl-5 shadow-nomi-sm transition-[border-color,box-shadow] focus-within:border-nomi-accent focus-within:shadow-nomi-md">
                      <IconSearch size={19} stroke={1.7} className="shrink-0 text-nomi-ink-40" aria-hidden="true" />
                      <input
                        value={addressValue}
                        onFocus={handleAddressFocus}
                        onBlur={handleAddressBlur}
                        onChange={handleAddressChange}
                        placeholder="搜 Bing 或输入网址"
                        aria-label="搜 Bing 或输入网址"
                        className="h-11 min-w-0 flex-1 border-0 bg-transparent text-body leading-[44px] outline-none ring-0 placeholder:text-nomi-ink-30 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                      />
                      <button
                        type="submit"
                        className="h-11 rounded-pill border-0 bg-nomi-ink px-5 text-body-sm font-semibold text-nomi-paper transition-colors hover:bg-nomi-accent"
                      >
                        打开
                      </button>
                    </div>
                  </form>
                  <div>
                    <div className="mb-3 text-caption font-semibold text-nomi-ink-45">常用参考站点</div>
                    <div
                      className="grid gap-2"
                      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
                    >
                      {BROWSER_START_SHORTCUTS.map((site) => {
                        let host = ''
                        try {
                          host = new URL(site.url).hostname
                        } catch {
                          host = ''
                        }
                        const faviconUrl = host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : ''
                        return (
                          <button
                            key={site.url}
                            type="button"
                            className={cn(
                              'group flex items-center gap-2.5 rounded-nomi border border-nomi-line bg-nomi-paper p-2.5 text-left',
                              'cursor-pointer transition-[background,border-color,transform,box-shadow] duration-[var(--nomi-transition-fast)]',
                              'hover:-translate-y-px hover:border-nomi-accent hover:shadow-nomi-md',
                            )}
                            onClick={() => {
                              void createTab(site.url)
                            }}
                            title={site.url}
                          >
                            <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-nomi-sm bg-nomi-ink-05 text-nomi-ink-40 transition-colors group-hover:bg-nomi-accent-soft group-hover:text-nomi-accent">
                              {faviconUrl ? (
                                <img
                                  src={faviconUrl}
                                  alt=""
                                  className="size-4"
                                  draggable={false}
                                  onError={(event) => {
                                    event.currentTarget.style.display = 'none'
                                  }}
                                />
                              ) : (
                                <IconWorld size={15} stroke={1.7} aria-hidden="true" />
                              )}
                            </span>
                            <span className="grid min-w-0 flex-1 gap-0.5">
                              <span className="truncate text-caption font-semibold text-nomi-ink">{site.label}</span>
                              <span className="truncate text-micro text-nomi-ink-45">{site.hint}</span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            {lastError ? (
              <div className="absolute left-1/2 top-4 z-[2] -translate-x-1/2 rounded-pill border border-nomi-line bg-nomi-paper px-3 py-1.5 text-caption text-workbench-danger shadow-nomi-sm">
                {lastError}
              </div>
            ) : null}
            </div>
            {!useNativeBrowserAssetOverlay ? (
              <div
                className={cn(
                  localBrowserAssetPopoverSplit
                    ? 'relative shrink-0 border-l border-nomi-line-soft'
                    : 'absolute inset-0 pointer-events-none',
                )}
                style={localBrowserAssetPopoverSplit ? { width: dockPanelWidth } : undefined}
              >
                <NomiBrowserAssetPopover
                  surface="contained"
                  placement="absolute"
                  opened={browserAssetPopoverOpen}
                  boundsRect={webContentBounds}
                  showTrigger={false}
                  onOpenChange={handleBrowserAssetPopoverOpenChange}
                  onWindowRectChange={handleBrowserAssetPopoverRectChange}
                  onDockModeChange={setBrowserAssetPopoverDockMode}
                  dockPresentation={localBrowserAssetPopoverSplit ? 'split' : 'overlay'}
                  onImportRemoteAsset={importBrowserAssetToAssetPopover}
                  browserCaptureEnabled={browserResourceCaptureEnabled}
                  browserCaptureDisabled={!activeTab?.viewId || !browserBridge?.setResourceCapture}
                  browserCaptureRequest={browserCaptureRequest}
                  browserPromptCaptureRequest={browserPromptCaptureRequest}
                  onBrowserCaptureToggle={toggleBrowserResourceCapture}
                />
                {localBrowserAssetPopoverSplit ? (
                  <div
                    className="absolute -left-1 top-0 z-[570] h-full w-2 cursor-ew-resize touch-none"
                    onPointerDown={handleDockResizeStart}
                    onPointerMove={handleDockResizeMove}
                    onPointerUp={handleDockResizeEnd}
                    onPointerCancel={handleDockResizeEnd}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            ) : null}
          </main>
        </section>
        {promptModePicker ? (
          <div
            ref={promptModePickerRef}
            className="fixed z-[575] w-56 rounded-nomi border border-nomi-line bg-nomi-paper p-1.5 shadow-nomi-lg"
            style={{ left: promptModePicker.x, top: promptModePicker.y }}
            role="menu"
            aria-label="选择提示词提取方式"
            onContextMenu={(event) => event.preventDefault()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <PromptModeOption
              mode="replicate"
              onSelect={(mode) => runBrowserScreenshotPrompt(mode, promptModePicker.tab)}
            />
            <PromptModeOption
              mode="style"
              onSelect={(mode) => runBrowserScreenshotPrompt(mode, promptModePicker.tab)}
            />
          </div>
        ) : null}
        <AnimatePresence>
          {captureFlyouts.map((flyout) => (
            <motion.div
              key={flyout.id}
              data-browser-capture-flyout=""
              className="pointer-events-none fixed left-0 top-0 z-[570] overflow-hidden rounded-nomi border border-nomi-accent bg-nomi-paper shadow-nomi-lg ring-2 ring-nomi-accent ring-offset-2 ring-offset-nomi-paper"
              initial={{
                x: flyout.sourceRect.left,
                y: flyout.sourceRect.top,
                width: flyout.sourceRect.width,
                height: flyout.sourceRect.height,
                opacity: 0.72,
                scale: 0.98,
              }}
              animate={{
                x: [
                  flyout.sourceRect.left,
                  flyout.sourceRect.left,
                  flyout.targetRect.left,
                ],
                y: [
                  flyout.sourceRect.top,
                  flyout.sourceRect.top,
                  flyout.targetRect.top,
                ],
                width: [
                  flyout.sourceRect.width,
                  flyout.sourceRect.width,
                  flyout.targetRect.width,
                ],
                height: [
                  flyout.sourceRect.height,
                  flyout.sourceRect.height,
                  flyout.targetRect.height,
                ],
                opacity: [0.78, 1, 0.08],
                scale: [0.98, 1.02, captureFlyoutScale(flyout.sourceRect, flyout.targetRect)],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.74, times: CAPTURE_FLYOUT_KEYFRAME_TIMES, ease: [0.22, 1, 0.36, 1] }}
              onAnimationComplete={() => removeCaptureFlyout(flyout.id)}
              aria-hidden="true"
            >
              {flyout.mediaType === 'video' ? (
                <>
                  <video src={flyout.url} muted playsInline className="block size-full bg-nomi-ink object-contain" />
                  <span className="absolute right-1 top-1 rounded-pill bg-nomi-accent px-1.5 py-0.5 text-micro font-semibold leading-none text-nomi-paper shadow-nomi-sm">
                    视频
                  </span>
                </>
              ) : (
                <img src={flyout.url} alt="" draggable={false} className="block size-full object-contain" />
              )}
              <span className="absolute inset-0 rounded-nomi ring-1 ring-inset ring-nomi-paper/85" />
              <motion.span
                className="absolute inset-0 rounded-nomi bg-nomi-accent"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.28, 0] }}
                transition={{ duration: 0.42, times: [0, 0.28, 1], ease: 'easeOut' }}
              />
            </motion.div>
          ))}
        </AnimatePresence>
        {contextMenuTab && tabContextMenu ? (
          <div
            ref={tabContextMenuRef}
            className="fixed z-[560] rounded-nomi border border-nomi-line bg-nomi-paper p-1 shadow-nomi-lg"
            style={{ left: tabContextMenu.x, top: tabContextMenu.y, width: TAB_CONTEXT_MENU_WIDTH }}
            role="menu"
            aria-label={`${contextMenuTab.title} 标签菜单`}
            data-nomi-browser-tab-menu="true"
            onContextMenu={(event) => event.preventDefault()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={TAB_CONTEXT_MENU_ITEM_CLASS}
              role="menuitem"
              disabled={!contextMenuTab.url || contextMenuTabBookmarked}
              onClick={() => {
                saveBookmark(contextMenuTab)
                setTabContextMenu(null)
              }}
            >
              {contextMenuTabBookmarked ? (
                <IconStarFilled size={15} aria-hidden="true" className="shrink-0 text-nomi-accent" />
              ) : (
                <IconStar size={15} stroke={1.8} aria-hidden="true" className="shrink-0 text-nomi-ink-40" />
              )}
              <span className="min-w-0 flex-1 truncate">{contextMenuTabBookmarked ? '已收藏' : '收藏'}</span>
            </button>
            <button
              type="button"
              className={TAB_CONTEXT_MENU_ITEM_CLASS}
              role="menuitem"
              onClick={() => {
                closeTab(contextMenuTab.id)
                setTabContextMenu(null)
              }}
            >
              <IconX size={15} stroke={1.9} aria-hidden="true" className="shrink-0 text-nomi-ink-40" />
              <span className="min-w-0 flex-1 truncate">关闭标签</span>
            </button>
            {tabs.length > 1 ? (
              <>
                <div className="my-1 h-px bg-nomi-line-soft" aria-hidden="true" />
                <button
                  type="button"
                  className={cn(TAB_CONTEXT_MENU_ITEM_CLASS, 'text-workbench-danger hover:bg-workbench-danger-soft')}
                  role="menuitem"
                  onClick={closeAllTabs}
                >
                  <IconX size={15} stroke={1.9} aria-hidden="true" className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">关闭全部</span>
                </button>
              </>
            ) : null}
          </div>
        ) : null}
        {contextMenuBookmark && bookmarkContextMenu ? (
          <div
            ref={bookmarkContextMenuRef}
            className="fixed z-[560] rounded-nomi border border-nomi-line bg-nomi-paper p-1 shadow-nomi-lg"
            style={{ left: bookmarkContextMenu.x, top: bookmarkContextMenu.y, width: TAB_CONTEXT_MENU_WIDTH }}
            role="menu"
            aria-label={`${contextMenuBookmark.title} 书签菜单`}
            data-nomi-browser-bookmark-menu="true"
            onContextMenu={(event) => event.preventDefault()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={TAB_CONTEXT_MENU_ITEM_CLASS}
              role="menuitem"
              onClick={() => {
                const bookmark = contextMenuBookmark
                setBookmarkContextMenu(null)
                window.setTimeout(() => renameBookmark(bookmark), 0)
              }}
            >
              <IconPencil size={15} stroke={1.8} aria-hidden="true" className="shrink-0 text-nomi-ink-40" />
              <span className="min-w-0 flex-1 truncate">重命名</span>
            </button>
            <button
              type="button"
              className={cn(TAB_CONTEXT_MENU_ITEM_CLASS, 'text-workbench-danger hover:bg-workbench-danger-soft')}
              role="menuitem"
              onClick={() => {
                removeBookmark(contextMenuBookmark.id)
                setBookmarkContextMenu(null)
              }}
            >
              <IconTrash size={15} stroke={1.8} aria-hidden="true" className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">删除</span>
            </button>
          </div>
        ) : null}
      </div>
    </BodyPortal>
  )
}
