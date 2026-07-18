import { describe, expect, it } from 'vitest'
import type { NomiBrowserAsset } from '../assets/browserAssetData'
import {
  browserAssetDisplaySubtitle,
  browserAssetImportErrorMessage,
  isBrowserAssetDraggable,
  readBrowserImageDragPayload,
} from './browserAssetPopoverUtils'

function asset(input: Partial<NomiBrowserAsset> = {}): NomiBrowserAsset {
  return {
    id: 'asset-1',
    type: 'image',
    source: 'my',
    title: '网页图片',
    ...input,
  }
}

describe('browser asset tile status', () => {
  it('shows the concrete failure reason instead of replacing it with 下载失败', () => {
    expect(browserAssetDisplaySubtitle(asset({ status: 'error', subtitle: '被网站拒绝(防盗链)' }))).toBe('被网站拒绝(防盗链)')
    expect(browserAssetDisplaySubtitle(asset({ status: 'error' }))).toBe('下载失败')
  })

  it('keeps loading and failed assets non-draggable while allowing ready assets', () => {
    expect(isBrowserAssetDraggable(asset({ status: 'loading' }), false)).toBe(false)
    expect(isBrowserAssetDraggable(asset({ status: 'error' }), false)).toBe(false)
    expect(isBrowserAssetDraggable(asset({ status: 'ready' }), false)).toBe(true)
    expect(isBrowserAssetDraggable(asset({ status: 'ready' }), true)).toBe(false)
    expect(isBrowserAssetDraggable(asset({ type: 'prompt', status: 'error' }), false)).toBe(false)
  })

  it('preserves the media type supplied by the page drag bridge', () => {
    const payload = JSON.stringify({
      url: 'https://cdn.example.com/clip.webm',
      title: '视频参考',
      mediaType: 'video',
    })
    const dataTransfer = {
      getData: (type: string) => type === 'application/x-nomi-browser-image' ? payload : '',
    } as DataTransfer

    expect(readBrowserImageDragPayload(dataTransfer)).toMatchObject({
      url: 'https://cdn.example.com/clip.webm',
      title: '视频参考',
      mediaType: 'video',
    })
  })

  it('treats a video poster fallback as an image', () => {
    const dataTransfer = {
      getData: (type: string) => type === 'text/html'
        ? '<video poster="https://cdn.example.com/poster.webp" title="封面"></video>'
        : '',
    } as DataTransfer

    expect(readBrowserImageDragPayload(dataTransfer)).toMatchObject({
      url: 'https://cdn.example.com/poster.webp',
      title: '封面',
      mediaType: 'image',
    })
  })

  it('turns download failures into actionable user-facing reasons', () => {
    expect(browserAssetImportErrorMessage('来源页面会话已失效', 'https://cdn.example.com/a.png')).toBe('来源网页已关闭，请重新拖入')
    expect(browserAssetImportErrorMessage('网页素材下载失败（HTTP 403）', 'https://cdn.example.com/a.png')).toBe('网站拒绝下载（可能需要登录）')
    expect(browserAssetImportErrorMessage('网页返回的不是图片或视频（text/html）', 'https://cdn.example.com/a.png')).toBe('网站返回的不是图片或视频')
    expect(browserAssetImportErrorMessage('anything', 'blob:https://example.com/id')).toBe('网页临时资源已失效')
  })
})
