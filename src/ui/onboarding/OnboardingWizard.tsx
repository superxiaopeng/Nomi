/**
 * Onboarding Wizard — Apple-style minimal "add a model".
 *
 * User pastes a docs URL + their API key. The agent reads the docs,
 * extracts parameters with evidence, tests one real call, and persists
 * a verified-working catalog entry. UI never surfaces internal terms
 * like "vendor / mapping / endpoint" — those are implementation details
 * (per Design.md "no decorative complexity").
 *
 * Backed by:
 *   nomiDesktop.onboarding.start  → kicks off main-process agent loop
 *   nomiDesktop.onboarding.onEvent(trialId, cb) → streams milestones
 *
 * Auto-commits to catalog on success (the IPC handler does it).
 */
import React from 'react'
import { Stack, Group, Text, PasswordInput } from '@mantine/core'
import { DesignButton, DesignTextInput } from '../../design'
import { getDesktopBridge } from '../../desktop/bridge'

type Phase = 'input' | 'running' | 'success' | 'error'

type Milestone = {
  id: 'read' | 'kind' | 'identity' | 'fields' | 'test' | 'commit'
  label: string
  status: 'pending' | 'active' | 'done' | 'failed'
}

const INITIAL_MILESTONES: Milestone[] = [
  { id: 'read', label: '读取文档内容', status: 'pending' },
  { id: 'kind', label: '识别类型', status: 'pending' },
  { id: 'identity', label: '识别接口和认证方式', status: 'pending' },
  { id: 'fields', label: '提取参数', status: 'pending' },
  { id: 'test', label: '测试调用', status: 'pending' },
  { id: 'commit', label: '保存到模型库', status: 'pending' },
]

const MILESTONE_BY_TOOL: Record<string, Milestone['id']> = {
  fetch_raw_docs: 'read',
  set_vendor_info: 'identity',
  set_fields: 'fields',
  add_field_with_evidence: 'fields',
  set_mapping_request: 'identity',
  set_mapping_response: 'identity',
  execute_test_curl: 'test',
  commit_model: 'commit',
  check_completeness: 'fields',
}

export function OnboardingWizard({ onCommitted, onCancel }: {
  /** Called once a model is committed to the catalog. */
  onCommitted?: (model: unknown) => void
  /** Optional cancel — shows a button to step out (e.g. close drawer). */
  onCancel?: () => void
}): JSX.Element {
  const bridge = getDesktopBridge()
  const [phase, setPhase] = React.useState<Phase>('input')
  const [docsUrl, setDocsUrl] = React.useState('')
  const [userApiKey, setUserApiKey] = React.useState('')
  const [milestones, setMilestones] = React.useState<Milestone[]>(INITIAL_MILESTONES)
  const [activeMessage, setActiveMessage] = React.useState('正在阅读文档…')
  const [fieldsCount, setFieldsCount] = React.useState(0)
  const [detectedKind, setDetectedKind] = React.useState<string | null>(null)
  const [resultLabel, setResultLabel] = React.useState('')
  const [errorReason, setErrorReason] = React.useState('')
  const [errorHint, setErrorHint] = React.useState('')
  const [traceJson, setTraceJson] = React.useState<unknown>(null)
  const trialIdRef = React.useRef<string | null>(null)
  const unsubRef = React.useRef<(() => void) | null>(null)

  // Clean up event subscription on unmount.
  React.useEffect(() => {
    return () => {
      unsubRef.current?.()
      unsubRef.current = null
      trialIdRef.current = null
    }
  }, [])

  const resetToInput = React.useCallback(() => {
    setPhase('input')
    setMilestones(INITIAL_MILESTONES)
    setFieldsCount(0)
    setDetectedKind(null)
    setResultLabel('')
    setErrorReason('')
    setErrorHint('')
    setTraceJson(null)
  }, [])

  const handleStart = React.useCallback(async () => {
    if (!bridge?.onboarding) {
      setErrorReason('当前环境没有桌面端模块，无法运行。')
      setPhase('error')
      return
    }
    if (!docsUrl.trim() || !userApiKey.trim()) return
    setPhase('running')
    setMilestones(prev => prev.map(m => m.id === 'read' ? { ...m, status: 'active' } : m))
    setActiveMessage('正在阅读文档…')
    try {
      const { trialId } = await bridge.onboarding.start({ docsUrl: docsUrl.trim(), userApiKey: userApiKey.trim() })
      trialIdRef.current = trialId
      unsubRef.current = bridge.onboarding.onEvent(trialId, ev => handleEvent(ev))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Most common cause: missing agent env vars on this machine.
      const isAgentMissing = /Onboarding agent not configured/.test(msg)
      setErrorReason(isAgentMissing ? '还没有配置用来阅读文档的 AI' : '没能启动')
      setErrorHint(isAgentMissing
        ? '请先在系统设置里配置一个 LLM（如 Kimi、GPT-5），它会负责读文档。'
        : msg)
      setPhase('error')
    }
  }, [bridge, docsUrl, userApiKey])

  const handleEvent = React.useCallback((raw: unknown) => {
    const ev = raw as { type: string; [k: string]: unknown }
    if (ev.type === 'tool-call' && typeof ev.toolName === 'string') {
      const milestoneId = MILESTONE_BY_TOOL[ev.toolName]
      if (milestoneId) {
        setMilestones(prev => bumpToActive(prev, milestoneId))
        setActiveMessage(activeMessageFor(milestoneId))
      }
    }
    if (ev.type === 'tool-result' && typeof ev.toolName === 'string') {
      const milestoneId = MILESTONE_BY_TOOL[ev.toolName]
      const result = ev.result as { ok?: boolean; value?: Record<string, unknown> } | undefined
      const ok = result?.ok !== false
      if (milestoneId) {
        setMilestones(prev => markStatus(prev, milestoneId, ok ? 'done' : 'failed'))
      }
      // Side-effects: pick up field count, detected kind from set_fields/set_vendor_info results.
      if (ev.toolName === 'set_fields' && ok) {
        const total = Number(result?.value?.totalFields || 0)
        setFieldsCount(total)
      }
      if (ev.toolName === 'set_vendor_info' && ok) {
        // The agent can't yet declare kind separately; we leave detectedKind null
        // until we ship set_model_kind. UI just skips the "识别类型" detail line then.
      }
    }
    if (ev.type === 'trial-end') {
      const outcome = (ev as { outcome?: { status?: string; failureReason?: string; draft?: { modelDisplayName?: string; targetKind?: string } } }).outcome
      if (outcome?.draft?.targetKind) setDetectedKind(outcome.draft.targetKind)
      if (outcome?.status === 'success') {
        setResultLabel(outcome.draft?.modelDisplayName || '新模型')
      }
    }
    if (ev.type === 'result') {
      const data = ev as { outcome?: { status?: string; failureReason?: string; draft?: { modelDisplayName?: string } }; committedModel?: unknown }
      if (data.outcome?.status === 'success') {
        setMilestones(prev => markStatus(prev, 'commit', 'done'))
        setResultLabel(data.outcome.draft?.modelDisplayName || resultLabel || '新模型')
        setPhase('success')
        if (data.committedModel) onCommitted?.(data.committedModel)
      } else {
        setErrorReason(failureLabelFor(data.outcome?.failureReason))
        setErrorHint(humanHintFor(data.outcome?.failureReason))
        setTraceJson(data.outcome)
        setPhase('error')
      }
    }
    if (ev.type === 'error') {
      const msg = (ev as { message?: string }).message || '出了点问题'
      setErrorReason('运行过程中出错')
      setErrorHint(msg)
      setPhase('error')
    }
  }, [onCommitted, resultLabel])

  const handleCopyLog = React.useCallback(async () => {
    if (!traceJson) return
    try { await navigator.clipboard.writeText(JSON.stringify(traceJson, null, 2)) } catch { /* ignore */ }
  }, [traceJson])

  const canStart = docsUrl.trim().length > 0 && userApiKey.trim().length > 0 && phase === 'input'

  return (
    <Stack gap="md" px="md" py="md">
      <Group justify="space-between" align="center">
        <Text size="sm" fw={700} c="var(--nomi-ink)">添加一个 AI 模型</Text>
        <ProgressDots phase={phase} />
      </Group>
      <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>

        {phase === 'input' && (
          <Stack gap="md">
            <Field label="文档地址" hint="粘贴这个模型的官方 API 文档页">
              <DesignTextInput
                value={docsUrl}
                onChange={e => setDocsUrl(e.currentTarget.value)}
                placeholder="https://docs.example.com/api/..."
                autoFocus
              />
            </Field>
            <Field label="你的 API Key" hint="只存在你的电脑上，加密保存">
              <PasswordInput
                value={userApiKey}
                onChange={e => setUserApiKey(e.currentTarget.value)}
                placeholder="sk-..."
              />
            </Field>
            <Group justify="flex-end">
              <DesignButton onClick={handleStart} disabled={!canStart}>
                开始
              </DesignButton>
            </Group>
          </Stack>
        )}

        {phase === 'running' && (
          <Stack gap="sm">
            <Text size="sm" c="var(--nomi-ink)">{activeMessage}</Text>
            <Stack gap={4}>
              {milestones.map(m => (
                <MilestoneRow
                  key={m.id}
                  milestone={m}
                  detail={m.id === 'kind' && detectedKind ? `已识别为：${kindLabel(detectedKind)}` : m.id === 'fields' && fieldsCount > 0 ? `已提取 ${fieldsCount} 个参数` : undefined}
                />
              ))}
            </Stack>
            <Text size="xs" c="var(--nomi-ink-60)">预计还需 30-60 秒</Text>
            {onCancel && (
              <Group justify="flex-start">
                <DesignButton variant="subtle" onClick={onCancel}>取消</DesignButton>
              </Group>
            )}
          </Stack>
        )}

        {phase === 'success' && (
          <Stack gap="sm" align="flex-start">
            <Text size="xl" c="var(--nomi-ink)">✓</Text>
            <Text size="md" c="var(--nomi-ink)">{resultLabel} 已添加</Text>
            <Text size="sm" c="var(--nomi-ink-60)">现在可以在节点里选择这个模型</Text>
            <Group justify="flex-start" w="100%">
              <DesignButton variant="subtle" onClick={() => { resetToInput(); }}>再添加一个</DesignButton>
            </Group>
          </Stack>
        )}

        {phase === 'error' && (
          <Stack gap="sm">
            <Text size="md" c="var(--nomi-ink)">没能完成添加</Text>
            <Text size="sm" c="var(--nomi-ink)">{errorReason}</Text>
            {errorHint && <Text size="sm" c="var(--nomi-ink-60)">{errorHint}</Text>}
            <Group justify="space-between">
              <DesignButton variant="subtle" onClick={handleCopyLog} disabled={!traceJson}>复制日志</DesignButton>
              <DesignButton variant="subtle" onClick={resetToInput}>改一改重试</DesignButton>
            </Group>
          </Stack>
        )}
      </Stack>
    </Stack>
  )
}

function ProgressDots({ phase }: { phase: Phase }): JSX.Element {
  const stepIdx = phase === 'input' ? 0 : phase === 'running' ? 1 : 2
  return (
    <Group gap={6}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: i <= stepIdx ? 'var(--nomi-ink)' : 'var(--nomi-ink-20)',
          }}
        />
      ))}
    </Group>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }): JSX.Element {
  return (
    <Stack gap={4}>
      <Text size="sm" c="var(--nomi-ink)">{label}</Text>
      {children}
      {hint && <Text size="xs" c="var(--nomi-ink-60)">{hint}</Text>}
    </Stack>
  )
}

function MilestoneRow({ milestone, detail }: { milestone: Milestone; detail?: string }): JSX.Element {
  const icon = milestone.status === 'done' ? '✓'
    : milestone.status === 'failed' ? '✗'
    : milestone.status === 'active' ? '◐'
    : '·'
  const color = milestone.status === 'pending' ? 'var(--nomi-ink-40)' : 'var(--nomi-ink-80)'
  return (
    <Group gap={8} wrap="nowrap">
      <Text size="sm" style={{ width: 14 }} c={color}>{icon}</Text>
      <Text size="sm" c={color}>{detail || milestone.label}</Text>
    </Group>
  )
}

function bumpToActive(milestones: Milestone[], id: Milestone['id']): Milestone[] {
  return milestones.map(m =>
    m.id === id ? { ...m, status: m.status === 'pending' ? 'active' : m.status } : m,
  )
}

function markStatus(milestones: Milestone[], id: Milestone['id'], status: Milestone['status']): Milestone[] {
  return milestones.map(m => m.id === id ? { ...m, status } : m)
}

function activeMessageFor(id: Milestone['id']): string {
  switch (id) {
    case 'read': return '正在阅读文档…'
    case 'kind': return '正在识别模型类型…'
    case 'identity': return '正在识别接口和认证方式…'
    case 'fields': return '正在提取参数…'
    case 'test': return '正在做一次测试调用…'
    case 'commit': return '正在保存到模型库…'
  }
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'image': return '图片生成'
    case 'video': return '视频生成'
    case 'audio': return '音频生成'
    case 'text': return '文本'
    default: return kind
  }
}

function failureLabelFor(reason?: string): string {
  if (!reason) return '出了点问题'
  if (/401|403|auth/i.test(reason)) return 'API Key 被服务器拒绝'
  if (/404/.test(reason)) return '找不到这个接口'
  if (/gave up/i.test(reason)) return '读不懂这份文档'
  if (/No successful test/i.test(reason)) return '测试调用一直没通过'
  if (/fetch/i.test(reason)) return '打不开这个文档链接'
  return '没能完成添加'
}

function humanHintFor(reason?: string): string {
  if (!reason) return ''
  if (/401|403|auth/i.test(reason)) return '可能是 key 拷贝时多了空格，或这个 key 没开通这个模型。'
  if (/404/.test(reason)) return '文档地址可能不完整，或者这个模型已经下线。'
  if (/gave up/i.test(reason)) return '可能文档结构特殊。你可以换个更直接的端点说明页试试。'
  if (/No successful test/i.test(reason)) return '可能是参数不对，或者这个 key 余额不足。'
  if (/fetch/i.test(reason)) return '检查链接是否能在浏览器里打开。'
  return reason
}
