// 技能库单卡（画廊式，对齐提示词库的卡片语言）。token-only：颜色/圆角/字号全走设计系统。
// 用户技能可删；内置技能只读（删除位显「内置 · 只读」）。能力缺口用 ⚠️ 标，点「在创作区用」锁定该技能。
import React from 'react'
import { IconAlertTriangle, IconCheck, IconDownload, IconMovie, IconTrash } from '@tabler/icons-react'
import { cn } from '../../utils/cn'
import {
  providerLabel,
  skillCapabilityFor,
  type SkillListItemDto,
  type SkillProviderKind,
} from '../api/skillApi'

export function SkillCard({
  skill,
  available,
  onUse,
  onExport,
  onDelete,
}: {
  skill: SkillListItemDto
  available: ReadonlySet<SkillProviderKind>
  onUse: (skill: SkillListItemDto) => void
  onExport: (skill: SkillListItemDto) => void
  onDelete: (skill: SkillListItemDto) => void
}): JSX.Element {
  const cap = skillCapabilityFor(skill, available)
  const isUser = skill.origin === 'user'

  return (
    <div className={cn('flex flex-col gap-2 rounded-nomi border border-nomi-line bg-nomi-paper p-3')}>
      <div className={cn('flex items-center gap-2')}>
        <IconMovie size={15} stroke={1.5} className={cn('shrink-0 text-nomi-ink-60')} />
        <span className={cn('flex-1 min-w-0 truncate text-body-sm font-medium text-nomi-ink')}>{skill.label}</span>
        {skill.isPlaybook ? (
          <span className={cn('shrink-0 rounded-full bg-nomi-accent-soft px-2 py-0.5 text-micro text-nomi-accent')}>
            playbook · {skill.stageLabels.length} 段
          </span>
        ) : (
          <span className={cn('shrink-0 rounded-full bg-nomi-ink-05 px-2 py-0.5 text-micro text-nomi-ink-60')}>助手</span>
        )}
      </div>

      {skill.description ? (
        <p className={cn('text-caption text-nomi-ink-60 line-clamp-2')}>{skill.description}</p>
      ) : (
        <p className={cn('text-caption text-nomi-ink-40')}>暂无说明</p>
      )}

      {skill.neededProviders.length > 0 && (
        <div className={cn('flex flex-wrap items-center gap-2')}>
          {skill.neededProviders.map((kind) => {
            const ok = !cap.missing.includes(kind)
            return (
              <span
                key={kind}
                className={cn('inline-flex items-center gap-0.5 text-micro', ok ? 'text-workbench-success' : 'text-nomi-ink-40')}
              >
                {ok ? <IconCheck size={11} stroke={2} /> : <IconAlertTriangle size={11} stroke={2} />}
                {providerLabel(kind)}
              </span>
            )
          })}
        </div>
      )}

      <div className={cn('mt-0.5 flex items-center gap-1 border-t border-nomi-line-soft pt-2')}>
        <button
          type="button"
          onClick={() => onUse(skill)}
          className={cn('rounded-nomi-sm px-1.5 py-1 text-caption text-nomi-accent hover:bg-nomi-accent-soft transition-colors')}
        >
          在创作区用
        </button>
        <button
          type="button"
          onClick={() => onExport(skill)}
          title="导出技能包"
          aria-label={`导出 ${skill.label}`}
          className={cn('inline-flex items-center gap-1 rounded-nomi-sm px-1.5 py-1 text-caption text-nomi-ink-60 hover:bg-nomi-ink-05 transition-colors')}
        >
          <IconDownload size={13} stroke={1.7} />导出
        </button>
        <span className={cn('flex-1')} />
        {isUser ? (
          <button
            type="button"
            onClick={() => onDelete(skill)}
            title="删除技能"
            aria-label={`删除 ${skill.label}`}
            className={cn('inline-flex items-center gap-1 rounded-nomi-sm px-1.5 py-1 text-caption text-workbench-danger hover:bg-nomi-ink-05 transition-colors')}
          >
            <IconTrash size={13} stroke={1.7} />删除
          </button>
        ) : (
          <span className={cn('px-1.5 py-1 text-micro text-nomi-ink-40')}>内置 · 只读</span>
        )}
      </div>
    </div>
  )
}
