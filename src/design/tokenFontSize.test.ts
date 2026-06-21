import { execSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

// L1 回归：禁止非 token 的半 px 字号（text-[N.5px]），R8 token-only。
// 字号 token 只有 11/12/13/14/16/20/24（text-micro/caption/body-sm/body/title…）。
// 两处文档化例外（spec §4.3 派生角标 10.5 / 时间轴 snap-tag 9.5）按「文件 → 允许条数」
// 列白名单——按文件计数而非行号，避免无关编辑挪行就误报。棘轮只减不增。
const ALLOWED_PER_FILE: Record<string, number> = {
  'src/workbench/generationCanvas/nodes/BaseGenerationNode.tsx': 1, // §4.3 独立副本派生角标 10.5
  'src/workbench/timeline/TimelinePanel.tsx': 1, // 时间轴 snap-tag 9.5，低于 token 下限
}

describe('字号 token 合规（R8）', () => {
  it('src 内无超出白名单的半 px 字号 text-[N.5px]', () => {
    let raw = ''
    try {
      // grep 命中返回 0，无命中返回 1（抛错）→ 无命中即视为通过
      raw = execSync(String.raw`grep -rn "text-\[[0-9]*\.5px\]" src/`, { encoding: 'utf8' })
    } catch {
      raw = ''
    }
    const countByFile = new Map<string, number>()
    for (const line of raw.split('\n').filter(Boolean)) {
      const file = line.split(':')[0]
      countByFile.set(file, (countByFile.get(file) ?? 0) + 1)
    }
    const offenders = [...countByFile.entries()]
      .filter(([file, count]) => count > (ALLOWED_PER_FILE[file] ?? 0))
      .map(([file, count]) => `${file}: ${count} 处（白名单允许 ${ALLOWED_PER_FILE[file] ?? 0}）`)
    expect(offenders, `发现超白名单的非 token 半 px 字号（应换 text-micro/caption/body-sm 等 token）：\n${offenders.join('\n')}`).toEqual([])
  })
})
