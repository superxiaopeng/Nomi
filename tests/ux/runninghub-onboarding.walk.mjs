// RunningHub 接入 + 模型选择器去重 R13 走查 —— Playwright _electron 驱动 dist（绕 OS 点击多屏问题）。
// 用法: RH_KEY=xxx node tests/ux/runninghub-onboarding.walk.mjs
// 验:接入卡展开/key 输入+Enterprise 提示/连接/模型下拉是否「N家」去重(不重复糊一片)。
import { _electron as electron } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const shotsDir = path.join(repoRoot, 'tests/ux/shots/runninghub')
fs.mkdirSync(shotsDir, { recursive: true })
const userData = path.join(repoRoot, '.tmp', 'nomi-rh-userdata')
fs.mkdirSync(userData, { recursive: true })
const KEY = process.env.RH_KEY || ''

let n = 0
const snap = async (win, name) => { n += 1; const t = `${String(n).padStart(2, '0')}-${name}`; await win.screenshot({ path: path.join(shotsDir, `${t}.png`) }); console.log(`  · ${t}`) }
const click = async (win, locator, label) => {
  try { const el = typeof locator === 'string' ? win.locator(locator).first() : locator; if (await el.count()) { await el.click({ timeout: 3500 }); console.log(`  ✓ click ${label}`); return true } } catch (e) { console.log(`  ✗ click ${label}: ${e.message.split('\n')[0]}`) }
  return false
}

const app = await electron.launch({ executablePath: require('electron'), args: ['.', `--user-data-dir=${userData}`], cwd: repoRoot, env: { ...process.env } })
const win = await app.firstWindow()
await win.waitForTimeout(1500)
await win.evaluate(() => { for (const k of ['nomi:splash:v1', 'nomi:journey-tour:v1', 'nomi:canvas-gesture-hint:v1', 'nomi-onboarding-checklist:v1']) localStorage.setItem(k, 'seen') })
await win.reload(); await win.waitForTimeout(1500)

// 进项目（库页有则进，否则已在项目里）
await click(win, win.locator('button:has-text("示例"), button:has-text("修好"), button:has-text("新建项目")'), 'open-project')
await win.waitForTimeout(1200)
await click(win, win.locator('button:has-text("生成")'), 'gen-tab'); await win.waitForTimeout(700)
// 新建画面（空项目需要先有 board）
await click(win, win.locator('button:has-text("新建画面")'), 'new-board'); await win.waitForTimeout(900)
await snap(win, 'canvas-ready')

// ── 接入 RunningHub ──
await click(win, win.locator('[aria-label="打开模型接入"]'), 'open-onboarding'); await win.waitForTimeout(900)
await click(win, win.locator('text=接入生成模型'), 'expand-group'); await win.waitForTimeout(600)
await snap(win, 'onboarding-group-expanded')
await click(win, win.locator('text=RunningHub'), 'expand-rh-card'); await win.waitForTimeout(700)
await snap(win, 'rh-card-expanded')
if (KEY) {
  const keyInput = win.locator('input[placeholder*="API Key"], input[placeholder*="RunningHub"], input[type="password"]').first()
  try { if (await keyInput.count()) { await keyInput.fill(KEY); console.log('  ✓ key filled') } } catch (e) { console.log('  ✗ key fill', e.message.split('\n')[0]) }
  await snap(win, 'rh-key-filled')
  await click(win, win.locator('button:has-text("连接"), button:has-text("解锁"), button:has-text("保存")'), 'connect')
  await win.waitForTimeout(2000)
  await snap(win, 'rh-connected')
}
await win.keyboard.press('Escape'); await win.waitForTimeout(600)

// ── 加视频节点 → 开模型下拉看去重 ──
await click(win, win.locator('[aria-label="添加节点菜单"]'), 'add-menu'); await win.waitForTimeout(500)
await click(win, win.locator('[aria-label="添加视频节点"]'), 'add-video'); await win.waitForTimeout(1000)
await snap(win, 'video-node')
// 选中节点
await click(win, win.locator('text=视频').last(), 'select-node'); await win.waitForTimeout(800)
// 点模型选择器（param bar 里当前模型名按钮）—— 试多种命中
for (const sel of ['button:has-text("Seedance")', 'button:has-text("可灵")', 'button:has-text("即梦")', 'text=Seedance 2.0', '[aria-label*="模型"]']) {
  if (await click(win, win.locator(sel), `model-select(${sel})`)) { await win.waitForTimeout(800); break }
}
await snap(win, 'model-dropdown')
// dump 下拉里所有可见文本，机器核对有无重复
const items = await win.locator('[role="option"], [role="listbox"] *, .nomi-select__option').allInnerTexts().catch(() => [])
console.log('  下拉项:', JSON.stringify(items.filter(Boolean).slice(0, 40)))

await app.close()
console.log('DONE — tests/ux/shots/runninghub/')
