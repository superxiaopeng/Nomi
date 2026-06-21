/**
 * 创作助手输入的意图路由（对话驱动，用户拍板 2026-06-13 删固定 chip 后）。
 *
 * 删掉「拆镜头 / 立角色卡」执行按钮后，这两个跨面板动作只能由自然语言触发，
 * 所以 pattern 的覆盖面就是用户能不能用上功能的唯一保证——抽成纯函数单测锁死。
 * skill 端再按完整 message 判断单层/轨迹（见 SKILL.md「两种模式」）。
 */

export type CreationIntent = 'storyboard' | 'fixation' | null

// 覆盖「只要镜头图」与「要完整轨迹/视频」两类说法；命中即把正文甩给画布 agent。
// 视频类要求「动词 + 视频/短片/片子」（做/弄/变/剪/拍/生成），既接住「做个视频/弄成短片/
// 变成片子/剪成视频」等人话，又不碰裸「片」防「照片」误命中；「下一步」这类太模糊的故意不接。
const STORYBOARD_REQUEST_PATTERN =
  /拆镜头|分镜|拆分|拆成.{0,4}镜头|切.{0,2}镜头|镜头脚本|成片|出片|(?:做|弄|变|剪|拍|生成).{0,3}(?:视频|短片|片子)/
const FIXATION_REQUEST_PATTERN = /立角色卡|角色卡|人物卡|定妆|角色设定|建.{0,2}角色/

/**
 * 把用户输入归类到跨面板动作。storyboard 优先（「分镜」「拆」类词更高频明确）；
 * 都不命中返回 null → 走通用创作 AI（续写/改写文稿）。
 */
export function routeCreationIntent(text: string): CreationIntent {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (STORYBOARD_REQUEST_PATTERN.test(trimmed)) return 'storyboard'
  if (FIXATION_REQUEST_PATTERN.test(trimmed)) return 'fixation'
  return null
}

/**
 * 编辑器为空时，从用户这条对话消息里抠出「故事正文」当拆镜头素材——别让他把已经
 * 敲在对话框里的故事再手动搬去左侧（D1 摩擦）。两种命中：
 *  ①「…拆成镜头：<故事>」式：冒号后的正文即故事；
 *  ② 没冒号但剥掉命令短语后仍有实质内容：把整条消息交给规划师（LLM 自会忽略命令词）。
 * 裸命令（「帮我拆镜头」）剥完不够长 → 返回 ''，维持「先写故事」提示，不拿命令词当故事。
 */
export function extractStoryFromRequest(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  const afterColon = trimmed.split(/[:：]/).slice(1).join('：').trim()
  if (afterColon.length >= 12) return afterColon
  const withoutCommand = trimmed.replace(STORYBOARD_REQUEST_PATTERN, '').replace(/[\s,，。、!！?？]+/g, '')
  return withoutCommand.length >= 12 ? trimmed : ''
}
