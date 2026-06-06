import React from 'react'
import { IconSearch, IconUpload } from '@tabler/icons-react'
import { cn } from '../../utils/cn'
import { AssetThumb } from './AssetTile'
import { useAssetPool } from './useAssetPool'
import { filterAssets, type AssetKind, type AssetRef } from './assetTypes'

// 统一选择器(P0.3,样张 v4 态④)。定位 = **快速取**(搜索 + 最近),不是全量浏览器。
// 三来源一套:画布行 + 项目素材最近网格(可滚) + 上传;另说明拖入/连线两条画布捷径。
// 想翻全部 → 「浏览全部」去素材面板。消费 useAssetPool(一处真相源),不自存素材。

type AssetPickerProps = {
  projectId: string | null
  /** 限定可选种类(如单图槽传 ['image']);不传 = 图/视频/音频都可。 */
  accept?: AssetKind[]
  onPick: (asset: AssetRef) => void
  onUpload: (file: File) => void
  /** 传了才显示「浏览全部 →」(去素材面板)。 */
  onBrowseAll?: () => void
  uploading?: boolean
  className?: string
}

const ACCEPT_ATTR: Record<AssetKind, string> = { image: 'image/*', video: 'video/*', audio: 'audio/*' }

function PickerItem({ asset, onPick }: { asset: AssetRef; onPick: (asset: AssetRef) => void }): JSX.Element {
  return (
    <button
      type="button"
      aria-label={asset.name}
      onClick={() => onPick(asset)}
      className={cn('relative w-12 h-12 rounded-nomi-sm overflow-hidden border border-nomi-line bg-nomi-ink-05 flex items-center justify-center cursor-pointer hover:outline hover:outline-2 hover:outline-offset-1 hover:outline-nomi-accent')}
    >
      <AssetThumb asset={asset} playSize={18} />
    </button>
  )
}

export default function AssetPicker({ projectId, accept, onPick, onUpload, onBrowseAll, uploading, className }: AssetPickerProps): JSX.Element {
  const { assets } = useAssetPool(projectId)
  const [query, setQuery] = React.useState('')

  const filtered = React.useMemo(() => filterAssets(assets, { query, accept }), [assets, query, accept])
  const canvasAssets = filtered.filter((a) => a.source === 'canvas')
  const projectAssets = filtered.filter((a) => a.source === 'project')

  const acceptAttr = (accept && accept.length ? accept : (['image', 'video', 'audio'] as AssetKind[]))
    .map((kind) => ACCEPT_ATTR[kind])
    .join(',')

  return (
    <div data-testid="asset-picker" className={cn('flex flex-col gap-[10px] w-[300px] max-w-[300px] p-[10px] rounded-nomi border border-nomi-line bg-nomi-paper shadow-nomi-md', className)}>
      <label className={cn('flex items-center gap-[6px] h-[30px] px-[8px] rounded-nomi-sm border border-nomi-line bg-nomi-ink-05')}>
        <IconSearch size={13} stroke={2} className={cn('text-nomi-ink-40 shrink-0')} />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索素材名…"
          aria-label="搜索素材名"
          className={cn('flex-1 min-w-0 bg-transparent border-0 outline-none text-xs text-nomi-ink placeholder:text-nomi-ink-40')}
        />
      </label>

      {canvasAssets.length ? (
        <div className={cn('flex flex-col gap-[6px]')}>
          <span className={cn('text-nomi-ink-40 text-micro')}>画布</span>
          <div className={cn('flex gap-[6px] flex-wrap')}>
            {canvasAssets.map((asset) => <PickerItem key={asset.id} asset={asset} onPick={onPick} />)}
          </div>
        </div>
      ) : null}

      {projectAssets.length ? (
        <div className={cn('flex flex-col gap-[6px]')}>
          <div className={cn('flex items-baseline justify-between')}>
            <span className={cn('text-nomi-ink-40 text-micro')}>项目素材 · 最近</span>
            {onBrowseAll ? (
              <button type="button" onClick={onBrowseAll} className={cn('text-nomi-accent text-micro cursor-pointer')}>浏览全部 →</button>
            ) : null}
          </div>
          <div className={cn('grid grid-cols-[repeat(5,48px)] gap-[6px] max-h-[108px] overflow-auto pb-[2px]')}>
            {projectAssets.map((asset) => <PickerItem key={asset.id} asset={asset} onPick={onPick} />)}
          </div>
        </div>
      ) : null}

      {!canvasAssets.length && !projectAssets.length ? (
        <div className={cn('text-nomi-ink-40 text-micro text-center py-[6px]')}>
          {query ? '没有匹配的素材' : '还没有素材,上传或拖入开始'}
        </div>
      ) : null}

      <label className={cn('relative flex items-center justify-center gap-[6px] h-[34px] rounded-nomi-sm border border-dashed border-nomi-ink-20 bg-nomi-paper text-nomi-ink-60 text-xs cursor-pointer hover:border-nomi-accent hover:text-nomi-accent')}>
        <IconUpload size={15} stroke={2} />
        {uploading ? '上传中…' : '上传本地文件'}
        <input
          type="file"
          accept={acceptAttr}
          aria-label="上传本地文件"
          disabled={uploading}
          className={cn('absolute w-px h-px opacity-0 overflow-hidden')}
          onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) onUpload(file); event.currentTarget.value = '' }}
        />
      </label>

      <div className={cn('text-nomi-ink-40 text-micro text-center')}>或把文件拖进来 · 从卡片拉条线 · 从素材面板拖到节点</div>
    </div>
  )
}
