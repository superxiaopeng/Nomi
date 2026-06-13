/**
 * 分镜规划师的技能标识 + 用户消息构造。
 *
 * 触发入口在创作区 AI 助手（说「拆镜头」）→ 调 runStoryboardPlanner 就地跑（流程 A：不切区）。
 * 原先经 window CustomEvent 把请求甩到生成区助手面板的「事件桥」已删除——规划改在创作区原地完成，
 * 产出 propose_storyboard_plan 落创作 store，编辑器随即在创作区主列展开。
 */

export const STORYBOARD_PLANNER_SKILL = {
  key: 'workbench.storyboard.planner',
  name: '故事板规划师',
} as const

/**
 * 构造交给分镜规划师的用户消息。技能体（SKILL.md）已含完整方法论，这里只把剧本正文
 * 包好递进去，附一句指令。
 */
export function buildStoryboardPlanningMessage(storyText: string): string {
  const trimmed = storyText.trim()
  return [
    '请把下面这段故事规划成一份「分镜方案」（跨镜头要一致的角色/场景/道具/风格 + 每个镜头），通过 propose_storyboard_plan 产出结构化方案对象——先给用户在创作区审阅、修改，不要直接写画布。',
    '',
    '--- 故事正文 ---',
    trimmed,
    '--- 故事正文结束 ---',
  ].join('\n')
}
