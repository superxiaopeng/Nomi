# 多窗口同时运行（#4-a）

> 2026-06-19 · 状态：调研 + 方案待拍板（R5 Electron 官方 + R6 Nomi 现架构）
> 来源：用户希望「像 Nody 一样多窗口同时运行」（同时开多个项目/同时生成）。

## 0. 结论先行：Nomi 离多窗口比想象近

Electron 每个 `BrowserWindow` = **独立 renderer 进程 + 独立 JS 上下文**（官方 process-model）。所以 Nomi 的
渲染层状态**天然按窗口隔离**（zustand `useWorkbenchStore` 每窗口一份）。而且 Nomi **已经用 URL hash 路由项目**
（真机实测 `#/studio?projectId=workspace-xxx`）—— 新窗口带不同 projectId 打开就是不同项目。
主进程 `createWindow()` 也已可多次调用（[main.ts:136](electron/main.ts)，无单实例锁拦）。

**所以这不是从零造，是补 3 个缺口。**

## 1. 三个真缺口（R6 摸出来的）

| 缺口 | 现状 | 风险 |
|---|---|---|
| ⚠️ **activeProjectId 走共享 localStorage** | [activeProject.ts:14](src/desktop/activeProject.ts) `localStorage.getItem(LAST_ACTIVE_PROJECT_KEY)` | localStorage **按 origin 共享、跨窗口** → 窗口 A/B 抢「最后活动项目」，冷启动可能认错项目 |
| ⚠️ **部分 IPC 事件广播给所有窗口** | update 等用 `for (win of getAllWindows()) win.webContents.send(...)` | 项目相关事件可能漏到别的窗口 |
| ❌ **没有「开新窗口/项目开到新窗口」入口** | 只在启动建 1 个窗口 | 用户无从开第二个 |

> 注：task/agent/onboarding 事件已按 sessionId/streamId/trialId 过滤（每窗口订自己的 id），这部分**天然安全**，不用改。

## 2. 方案

### 2.1 窗口身份：projectId 随窗口走，不靠共享 localStorage
- 新窗口创建时把 projectId 写进 **URL hash**（`#/studio?projectId=X`，复用现有路由）——窗口自包含，不读共享 localStorage。
- `getDesktopActiveProjectId()` 优先级改：**URL hash 当前 projectId > 内存 > localStorage 兜底**（hash 已是真相源，localStorage 只剩冷启动「上次开的」便利，且只在无 hash 时用）。
- preload 暴露 `window.nomiDesktop.windowId`（`win.id`），需要时给事件做窗口级路由。

### 2.2 IPC 事件路由：项目相关事件只发给「该项目所在窗口」
- 审计所有 `getAllWindows().send` 广播点（update/asset-library-updated/review/...），区分：
  - **全局事件**（如版本更新可用）→ 仍广播，OK。
  - **项目相关事件** → 只发给 hash 里是该 projectId 的窗口（主进程维护 `windowId → projectId` 映射，渲染层 setActiveProject 时上报）。
- 任务/agent 事件已按 id 过滤，不动。

### 2.3 窗口管理入口
- AppBar/菜单加「**新窗口**」+ 项目卡「**在新窗口打开**」→ IPC `nomi:window:open`（payload projectId）→ 主进程 `createWindow({ projectId })`。
- 单实例锁（可选）：加 `requestSingleInstanceLock` + `second-instance` → 不退出、改为**开新窗口**（macOS 重开 app/deep-link 行为更顺）。当前无锁也能跑，按需。

### 2.4 共享后端（不隔离、本就该共享）
- 主进程 catalog / 任务 runner / 文件系统 = **单份共享**，多窗口并发生成各跑各的（task 按 id 独立，已验）。**不复制后端**（违 P1）。
- 资源：N 个 renderer = N 份内存（three/tiptap 等重）。文档提示用户量力开窗；不做硬限制。

## 3. 不动什么
- 不复制主进程后端 / catalog / 任务系统（共享是对的）。
- 不动 task/agent/onboarding 的 id 过滤事件（已隔离）。
- 不引入第二套状态管理（zustand 每窗口一份已够）。

## 4. 回滚
增量：窗口入口 + hash 优先级 + 事件路由映射。撤掉入口即回单窗口；hash 优先级改动对单窗口无影响（hash 本就存在）。

## 5. 验收门
1. 五门全过。
2. 真机：开 2 个窗口各开不同项目 → ① 项目数据不串（A 改 prompt 不影响 B）② 同时各自生成互不干扰 ③ A 的任务事件不漏到 B ④ 关一个窗口不拖垮另一个。
3. activeProjectId 解析优先级单测（hash > 内存 > localStorage）。

## 6. 开放问题（拍板）
- 单实例锁加不加？（加 = macOS 重开 app 行为更顺，但要处理 second-instance 开窗）
- 「新窗口」默认开**空项目库**还是**复制当前项目**？
- 要不要窗口数软上限提示（防用户开 10 个 three.js 窗口卡死）？
