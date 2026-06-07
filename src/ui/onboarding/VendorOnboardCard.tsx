/**
 * 供应商接入卡（apimart / kie 等已知供应商复用，P4 通用第一）。
 *
 * 形态：[logo] 供应商名 / 副标题 [状态胶囊] · 填一次 key → 解锁该家全部预置模型。
 * - 未接入：key 输入框 + 「解锁」→ upsertVendorApiKey(vendorKey)（后端零改动，模型已 seed）。
 * - 已连通：模型清单点亮（● 已连通）+ 「更换 / 断开」次级操作。
 * - 底部：推广位（话术 + 注册 CTA，外链交系统浏览器）。
 *
 * 模型清单从 catalog 派生（props.models），不在卡片里硬编码。
 */
import React from 'react'
import { Stack, Group, Text, PasswordInput } from '@mantine/core'
import { IconKey, IconCircle, IconCircleCheck, IconExternalLink } from '@tabler/icons-react'
import { DesignButton } from '../../design'
import { getDesktopBridge } from '../../desktop/bridge'
import type { KnownVendor } from '../../config/knownVendors'

export type VendorCardModel = {
  modelKey: string
  labelZh: string
  kind: 'text' | 'image' | 'video' | 'audio'
}

type VendorOnboardCardProps = {
  directory: KnownVendor
  /** catalog 里的供应商显示名（vendor.name）。 */
  vendorName: string
  /** catalog 里的 baseUrlHint（信息展示用）。 */
  baseUrl: string
  /** 该供应商是否已绑定 key（catalog vendor.hasApiKey）。 */
  hasApiKey: boolean
  /** 该供应商的预置模型（从 catalog 派生）。 */
  models: VendorCardModel[]
  /** key 绑定/清除后刷新外层。 */
  onChanged: () => void
}

const KIND_LABEL: Record<VendorCardModel['kind'], string> = {
  text: '文本',
  image: '图片',
  video: '视频',
  audio: '音频',
}

const KIND_ORDER: VendorCardModel['kind'][] = ['text', 'image', 'video', 'audio']

export function VendorOnboardCard({
  directory,
  vendorName,
  baseUrl,
  hasApiKey,
  models,
  onChanged,
}: VendorOnboardCardProps): JSX.Element {
  // 已连通时默认折叠输入；点「更换」展开。未接入时永远展开。
  const [editing, setEditing] = React.useState(!hasApiKey)
  const [keyDraft, setKeyDraft] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    setEditing(!hasApiKey)
  }, [hasApiKey])

  const total = models.length

  const grouped = React.useMemo(() => {
    const map: Record<VendorCardModel['kind'], VendorCardModel[]> = { text: [], image: [], video: [], audio: [] }
    for (const m of models) map[m.kind].push(m)
    return map
  }, [models])

  const handleUnlock = React.useCallback(() => {
    const apiKey = keyDraft.trim()
    if (!apiKey) {
      setError('请先粘贴 API Key。')
      return
    }
    const bridge = getDesktopBridge()
    if (!bridge) return
    setBusy(true)
    setError('')
    try {
      bridge.modelCatalog.upsertVendorApiKey(directory.vendorKey, { apiKey, enabled: true })
      setKeyDraft('')
      setEditing(false)
      onChanged()
    } catch (e) {
      setError(`解锁失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }, [keyDraft, directory.vendorKey, onChanged])

  const handleDisconnect = React.useCallback(() => {
    const bridge = getDesktopBridge()
    if (!bridge) return
    const ok = window.confirm(`断开「${vendorName}」？该家模型会回到"未连通"，需重新填 key。`)
    if (!ok) return
    setBusy(true)
    setError('')
    try {
      bridge.modelCatalog.clearVendorApiKey(directory.vendorKey)
      onChanged()
    } catch (e) {
      setError(`断开失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }, [directory.vendorKey, vendorName, onChanged])

  const openPromo = React.useCallback(() => {
    if (directory.promo) window.open(directory.promo.url, '_blank', 'noopener')
  }, [directory.promo])

  return (
    <Stack
      gap={0}
      style={{
        border: `1px solid var(--nomi-line)`,
        borderRadius: 'var(--nomi-radius)',
        background: 'var(--nomi-paper)',
        overflow: 'hidden',
      }}
    >
      {/* 头部：logo + 名字/副标题 + 状态胶囊 */}
      <Group gap={10} align="center" wrap="nowrap" p="sm" pb={11}>
        <div
          style={{
            width: 30, height: 30, flexShrink: 0,
            borderRadius: 'var(--nomi-radius-sm)',
            background: 'var(--nomi-ink)', color: 'var(--nomi-paper)',
            display: 'grid', placeItems: 'center',
            fontFamily: 'var(--nomi-font-display)', fontWeight: 600, fontSize: 15,
          }}
          aria-hidden
        >
          {directory.glyph}
        </div>
        <Stack gap={1} style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={700} c="var(--nomi-ink)" truncate>{vendorName}</Text>
          <Text size="xs" c="var(--nomi-ink-40)" truncate>
            {hasApiKey ? `已连通 · ${total} 个模型可用` : directory.tagline}
          </Text>
        </Stack>
        <Group
          gap={4}
          wrap="nowrap"
          style={{
            flexShrink: 0,
            padding: '3px 9px',
            borderRadius: 999,
            background: hasApiKey ? 'var(--workbench-success-soft)' : 'var(--nomi-ink-10)',
          }}
        >
          {hasApiKey
            ? <IconCircleCheck size={13} stroke={1.8} color="var(--workbench-success-ink)" />
            : <IconCircle size={13} stroke={1.8} color="var(--nomi-ink-40)" />}
          <Text size="xs" fw={600} c={hasApiKey ? 'var(--workbench-success-ink)' : 'var(--nomi-ink-60)'}>
            {hasApiKey ? '已连通' : '待接入'}
          </Text>
        </Group>
      </Group>

      <Stack gap={11} px="sm" pb="sm">
        {editing ? (
          <Stack gap={6}>
            <Group gap={8} align="flex-start" wrap="nowrap">
              <PasswordInput
                style={{ flex: 1 }}
                size="xs"
                aria-label={`${vendorName} API Key`}
                placeholder="粘贴你的 API Key（sk-…）"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock() }}
                disabled={busy}
              />
              <DesignButton
                size="xs"
                leftSection={<IconKey size={14} stroke={1.6} />}
                onClick={handleUnlock}
                loading={busy}
              >
                解锁
              </DesignButton>
            </Group>
            <Text size="xs" c="var(--nomi-ink-40)">
              填一次即可，密钥本地加密存储、只在调用时使用。
            </Text>
            {hasApiKey ? (
              <Group justify="flex-start">
                <DesignButton size="xs" variant="subtle" color="gray" onClick={() => setEditing(false)} disabled={busy}>
                  取消
                </DesignButton>
              </Group>
            ) : null}
          </Stack>
        ) : (
          <Group justify="space-between" align="center" wrap="nowrap">
            <Text size="xs" c="var(--nomi-ink-60)">API Key 已保存</Text>
            <Group gap={6} wrap="nowrap">
              <DesignButton size="xs" variant="default" onClick={() => setEditing(true)} disabled={busy}>
                更换
              </DesignButton>
              <DesignButton size="xs" variant="subtle" color="gray" onClick={handleDisconnect} disabled={busy}>
                断开
              </DesignButton>
            </Group>
          </Group>
        )}

        {error ? (
          <Text size="xs" c="var(--workbench-danger)">{error}</Text>
        ) : null}

        {baseUrl ? (
          <Text size="xs" c="var(--nomi-ink-30)" truncate>接入地址：{baseUrl}</Text>
        ) : null}

        {/* 模型清单（从 catalog 派生），按 kind 分组，状态点跟随 hasApiKey */}
        {total > 0 ? (
          <Stack gap={8}>
            {KIND_ORDER.map((kind) => {
              const list = grouped[kind]
              if (list.length === 0) return null
              return (
                <Stack key={kind} gap={6}>
                  <Text size="xs" fw={600} c="var(--nomi-ink-60)">
                    {KIND_LABEL[kind]} <span style={{ fontWeight: 400, color: 'var(--nomi-ink-40)' }}>{list.length} 个</span>
                  </Text>
                  <Stack
                    gap={0}
                    style={{
                      border: '1px solid var(--nomi-line)',
                      borderRadius: 'var(--nomi-radius-sm)',
                      overflow: 'hidden',
                    }}
                  >
                    {list.map((m, i) => (
                      <Group
                        key={`${m.modelKey}`}
                        gap={9}
                        align="center"
                        wrap="nowrap"
                        px={11}
                        py={8}
                        style={{
                          background: 'var(--nomi-paper)',
                          borderTop: i === 0 ? undefined : '1px solid var(--nomi-line-soft)',
                        }}
                      >
                        <span
                          style={{
                            width: 7, height: 7, borderRadius: 999, flexShrink: 0,
                            background: hasApiKey ? 'var(--workbench-success)' : 'var(--nomi-ink-20)',
                          }}
                          aria-hidden
                        />
                        <Text size="xs" c={hasApiKey ? 'var(--nomi-ink)' : 'var(--nomi-ink-40)'} fw={500} truncate style={{ flex: 1, minWidth: 0 }}>
                          {m.labelZh}
                        </Text>
                        <Text size="xs" c="var(--nomi-ink-40)" style={{ flexShrink: 0 }}>
                          {hasApiKey ? '已连通' : '未连通'}
                        </Text>
                      </Group>
                    ))}
                  </Stack>
                </Stack>
              )
            })}
          </Stack>
        ) : null}
      </Stack>

      {/* 推广位（不弹窗、不强制，可见即可） */}
      {directory.promo ? (
        <Group
          gap={8}
          align="center"
          wrap="nowrap"
          px="sm"
          py={10}
          style={{ borderTop: '1px dashed var(--nomi-line)' }}
        >
          <Text size="xs" c="var(--nomi-ink-40)" style={{ flex: 1, minWidth: 0, lineHeight: 1.5 }}>
            {directory.promo.text}
          </Text>
          <DesignButton
            size="xs"
            variant="subtle"
            color="gray"
            rightSection={<IconExternalLink size={13} stroke={1.6} />}
            onClick={openPromo}
            style={{ flexShrink: 0 }}
          >
            {directory.promo.ctaLabel}
          </DesignButton>
        </Group>
      ) : null}
    </Stack>
  )
}
