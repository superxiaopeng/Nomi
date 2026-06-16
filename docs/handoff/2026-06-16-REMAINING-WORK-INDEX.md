# 剩余工作总索引（交给下一个 AI）

> 2026-06-16。本轮已修一批 bug + 做了 B-clean（分镜→视频）并合并 main。此文件汇总**所有没做完的**，每项指向详细交接。**先读 CLAUDE.md 工程纪律**，再按下面挑一块开工。工作树 `/Users/aoqimin/Desktop/Nomi/` main 分支。

## 已完成（在 main，背景）
- ② 数组参考图「×」按来源分流（边断边/上传删 meta）— `f57bd7b`
- ① 批量生成不弹模态 + 缺啥提示啥 — `3d96628`
- ③④ B-clean：分镜镜头落画布改视频节点 + 分镜可选视频模型（推翻 image-first）— `81caa8b`，**真机验过**
- 分镜镜卡参考 chip 加「×」防误删 — `e52beec`
- apimart Seedance：全能参考(omni) + Fast 变体 — `e2e2143`

## 待做（按优先级/依赖）

### 1. 视频抽帧（首/尾帧）+ 重新支持镜头视频接力 ★核心基建
→ **详见 [docs/handoff/2026-06-16-video-frame-extraction.md](2026-06-16-video-frame-extraction.md)**
一并根治：批量那个潜伏 bug、重新接上 shot→shot 视频连贯、喂 Seedance 首尾帧。electron 抽帧 IPC（ffmpeg 现成）+ runner 消费 relayFromVideoUrl + storyboard 重连 first_frame 边。需真实 E2E。

### 2. Seedance 2.0 apimart「完整做完」★用户强调
→ **详见 [docs/handoff/2026-06-16-seedance-apimart-complete.md](2026-06-16-seedance-apimart-complete.md)**
剩：**首尾帧 image_with_roles**（构造层组装，最硬）、face/fast-face 变体、seed/return_last_frame 参数、与官方文档逐项对账打钩、真实 E2E。首尾帧的视频源帧 = 上面第 1 项的抽帧。

### 3. ①② 的 Playwright E2E 回归锁
本轮 ①②（批量不弹模态 / 参考×断边）受工具 + 额度限制**没做交互级真机走查**（只过单测；③④ 真机验过了）。补一个带状态注入的 Playwright E2E（`tests/ux/`），把这两条钉成可复跑回归：
- **难点**：UI 驱动不支持框选多选、参考×需先有"已生成的边来源缩略图"。解法：用 `electronApp.evaluate` / 渲染层 eval **程序化注入画布状态**（建多节点 + 连边 + 给节点塞 result url），绕过手动操作。参考 `evals/lib/isoApp.mjs`（隔离实例取证）+ `tests/ux/design-fidelity.e2e.mjs`（computed-style 断言）的写法。
- **断言**：① 框选多节点点"生成 N 个"→ **无模态弹层**（BatchPlanOverlay 不出现）+ blocked 时有人话 toast；② 节点参考槽里边来源缩略图点「×」→ 边被断开（store edges 少一条）、重渲染不复活。
- 坑：注入故事到 ProseMirror 编辑器要 `execCommand('insertText')`；助手输入是 React 受控要 nativeValueSetter + dispatch input（本轮真机走查踩过，见 memory launch-video-script 的"坑"）。

### 4. （可选）storyboard 视频接力做完后的回归
第 1 项重连 shot→shot 后，更新 `agent/storyboardPlan.test.ts` 的边断言（B-clean 改成"不连"，接力做好后改回"视频镜头连 first_frame 边"）。

## 验收门（每项都要）
五门（filesize/lint/typecheck/test/build）+ **真实生成 E2E**（接入/生成类必跑，烧额度，用户已授权"走真实额度"）+ 用户可见改动过 R13 真机走查。

## 相关已有文档
- `docs/plan/2026-06-16-storyboard-video-and-batch-fixes.md`（B-clean + 批量 + B-full 视频接力方案）
- `docs/plan/2026-06-16-seedance-apimart-completeness.md`（Seedance 对账）
- `docs/workflow/2026-06-06-real-generation-e2e-loop.md`（接入即验证回路）
- memory：`model-onboarding-must-cover-full-api-doc`、`ffprobe-exec-bit-packaging-trap`、`connection-reference-bugs-2026-06-14`
