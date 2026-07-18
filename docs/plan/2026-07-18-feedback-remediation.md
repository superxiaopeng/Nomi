# 2026-07-18 用户反馈分级与串行修复计划

> **执行要求：** REQUIRED SUB-SKILL: 使用 `executing-plans` 串行执行；每个 bug 使用 `systematic-debugging` + `test-driven-development`。不并行改共享入口，不把未复现反馈直接写成修复。

**目标：** 把 2026-07-18 微信/GitHub/B站反馈从“原话清单”变成有证据、有优先级、有回归保护的修复队列，并逐项关闭。

**架构原则：** 每一项先在输入、持久化、状态、渲染四层追数据流；只有根因已定位且能稳定复现才进入实现。每项形成独立提交并通过针对性测试，全部关闭后再跑五门与真实用户旅程。

**技术栈：** Electron、React 18、Zustand、Vitest、Playwright。

---

## 1. 分级口径

| 级别 | 判断口径 | 本轮处理方式 |
|---|---|---|
| P0 | 结果已产生但用户无法取得，核心产出链断裂 | 立即修；独立红测、真机截图、独立提交 |
| P1 | 主流程被阻断、状态丢失、应用级交互被破坏，或多人稳定复现 | P0 后逐项复现并修；复现失败就补诊断证据，不猜 |
| P2 | 能力声明与真实协议不一致，或错误只在特定模型/中继组合发生 | 先校准能力契约，再决定隐藏不支持能力还是补正确传输 |
| P3 | 不阻断任务，但明显增加操作成本的体验需求 | 去重、验证使用频率，再按 D1 的真实摩擦逐项做 |

## 2. 串行队列

### P0-1：3D 参考视频已生成但节点不可播放

**用户摩擦：** 用户录完 take，底部只出现“参考视频已生成”，卡面仍是 3D 空态；真正的 mp4 无入口。

**已确认根因：**

1. `CameraMoveCaptureHost` 把结果写入 `node.meta.cameraMoveVideo.url`。
2. `readTakeCaptureStatus()` 读取同一 URL，所以成功徽标会出现。
3. `Scene3DEditor` 的卡面只读取 `scene3dState.lastThumbnail`，从未读取 `cameraMoveVideo.url`。
4. 因此数据、持久化与状态层都已成功，断点唯一落在预览选择器。

**设计决定（用户已要求按计划直接推进）：**

- 生成中：保留底部“参考视频生成中…”状态。
- 生成完成：mp4 取代空态/旧截图，整张卡直接显示原生可播放视频。
- 完成态不再保留遮挡控制条的成功横条；视频本身就是完成证据（P1 加新删旧）。
- 右上角“打开 3D 编辑器”仍保留；视频优先级高于 `lastThumbnail`，截图仅在无视频时显示。
- 播放 URL、延迟加载和错误诊断复用普通视频节点的既有实现，不建立第二套媒体管线。

**同类参考图结论：** `handleScreenshot()` 已创建标准 image 节点，写入 `result.url`、`status=success`、history、尺寸并连接 reference 边；标准图片节点已有预览实现。当前没有证据表明它与视频是同一断点，需用 E2E 验证“首帧/尾帧图片节点可见”，不做无证据代码改动。

**验收：**

- 同时存在 `cameraMoveVideo.url` 与旧 `lastThumbnail` 时，卡面显示视频。
- 仅有 `lastThumbnail` 时继续显示截图。
- 空白/缺失视频 URL 不误判完成。
- 真机录 take 后，卡内出现可播放 `<video controls>`；成功横条消失；右上角 3D 入口可用。
- 首/尾帧截图产生的 image 节点都可见且连线仍存在。

### P1-1：Cmd/Ctrl 缩放破坏整个应用且无法恢复

**证据：** Electron 主窗口没有 `before-input-event` 的页面缩放守卫；默认 Chromium 页面缩放会把整个工作台缩小。画布自身缩放是独立交互，不能被一起禁掉。

**目标：** 只拦截主窗口的 Cmd/Ctrl `+`、`-`、`0` 页面缩放快捷键，并把主窗口 zoom factor 固定为 1；不影响画布滚轮/手势缩放，不影响内嵌浏览视图。

**进入实现的门：** 先以 Electron E2E 证明当前快捷键能改变 `webContents.getZoomFactor()`，再写纯函数快捷键判定红测。

**精确文件与验收：**

- 新增：`electron/windowInput.ts`，只负责识别主窗口页面缩放快捷键与安装 zoom factor 守卫。
- 新增：`electron/windowInput.test.ts`，覆盖 macOS Meta、Windows/Linux Ctrl、主键区/小键盘 `+ - 0`，并证明无修饰键、Alt、普通按键不被拦。
- 修改：`electron/main.ts`，创建主窗口后安装守卫；不挂到应用内浏览器 `WebContentsView`。
- 新增：`tests/ux/app-page-zoom.e2e.mjs`，真实发送 Cmd/Ctrl `-`、`+`、`0` 并断言主窗口 `getZoomFactor()` 始终为 1。
- 验收：页面快捷键不再改变应用壳尺寸；画布滚轮/工具栏缩放仍改变 canvas transform；浏览器视图不受影响。

### P1-2：ComfyUI 已出图/视频但 Nomi 未回收

**现状：** 最新代码已覆盖标准 `/history/{prompt_id}` 的 image、gif、video 输出，群内至少三人报告真实工作流仍失败。仅凭文字无法判断是自定义节点输出形状、路径编码、子图结构还是轮询时序。

**处理顺序：**

1. 收集本机/反馈样本中的真实 history JSON（只读，脱敏）。
2. 用现有解析器跑样本，定位第一个丢失字段。
3. 把该 JSON 缩成最小 fixture，先写失败测试。
4. 只扩展统一输出解析器；不为具体工作流硬编码节点名。
5. fake ComfyUI E2E 验证图片与视频都能落成标准节点结果。

**无样本时的处理：** 不写猜测性 fallback；补足结构化诊断日志，让下一次失败能打印“找到了哪些 output 节点/媒体字段、为何被过滤”。

### P1-3：脚本生成后创作区消失或回退

**现状：** 反馈缺少项目状态、入口与版本，尚未稳定复现。

**处理顺序：** 从创建项目→生成脚本→切换工作区→保存/恢复走真实旅程，记录 Zustand 状态、持久化 manifest 与路由选择三层变化；复现后把最小状态迁移写成红测，再修唯一状态真相源。复现不了只补可观测证据，不改 UI 猜症状。

### P2-1：中继把 Grok 参考图发往错误端点

**已确认：** 当前 relay 层统一把 image edit 映射到 `/v1/chat/completions`，同时又对所有 relay 图片模型声明 `supportsReferenceImages: true`。这是能力声明与传输协议的系统性缺口，不是单个按钮问题。

**目标：** 以模型级能力档案声明真实 image generation/edit 端点与 multipart/JSON 编码；只有档案和 transport 都支持时 UI 才暴露参考图。不为 Grok 写供应商专属 UI。

**进入实现的门：** 逐项对账所接模型的真实官方 API 文档；若中继不提供 edits 协议，先诚实撤销该模型的参考图支持声明，而不是继续发错误请求。

### P3：效率型需求

候选：图片点击放大、画布直接改名、多创作文档、更广的自定义模型。先查最新 main 与历史 digest 去重；已完成的不重复做。剩余项按“频次 × 对主链路节省的操作数 × 维护面”排序，每项单独走样张与实现计划。

## 3. 每项共同验收门

1. **RED：** 最小回归测试必须先因目标行为缺失而失败。
2. **GREEN：** 最小实现让定向测试通过，随后跑相关测试集。
3. **根因复核：** 明确输入→持久化→状态→渲染/传输的断点，回答“同类入口为何不会再复发”。
4. **P1 清理：** 新行为替代旧行为时，同提交删除旧状态条、错误声明或重复分支。
5. **体验证据：** 用户可见项必须跑生产构建的 Playwright 真实旅程，产出截图并人工查看。
6. **提交：** 每个可独立回滚的问题一个提交；全部完成后跑 `check:filesize`、`check:tokens`、`lint:ci`、`typecheck`、`test`、`build`，再推送 main。

## 4. P0-1 精确实施步骤

**文件：**

- 修改：`src/workbench/generationCanvas/nodes/Scene3DEditor.tsx`
- 新增：`src/workbench/generationCanvas/nodes/scene3d/scene3dCardPreview.ts`
- 修改：`src/workbench/generationCanvas/nodes/Scene3DEditor.test.ts`
- 修改：`tests/ux/scene3d-take-record.walk.mjs`
- 修改：`tests/ux/scene3d-reference-pack.walk.mjs`
- 新增样张：`docs/design/mockups/scene3d-reference-video-preview.html`

- [ ] **步骤 1：为预览优先级写红测**

  导出纯函数 `readScene3DCardPreview(node)`，期望返回：有效 `cameraMoveVideo.url` → `video`；否则有效 `lastThumbnail` → `image`；否则 `empty`。测试必须先因函数不存在而失败。

- [ ] **步骤 2：运行红测**

  运行：`pnpm exec vitest run src/workbench/generationCanvas/nodes/Scene3DEditor.test.ts`

  预期：FAIL，明确指出 `readScene3DCardPreview` 尚未导出。

- [ ] **步骤 3：实现单一预览选择器**

  在 `Scene3DEditor.tsx` 中从节点 meta 读取并 trim 视频 URL；视频优先，图片回退，空值不进入媒体组件。渲染视频时复用 `DeferredNodeVideo`、`buildVideoPlaybackUrl`、`diagnoseVideoPlaybackFailure`。

- [ ] **步骤 4：删除完成横条的旧实现**

  `Scene3DTakeStatusOverlay` 只接受 `generating`；完成态由可播放视频表达。`readTakeCaptureStatus` 仍可返回 `done` 供领域测试，但渲染入口只在 `generating` 时挂状态条。

- [ ] **步骤 5：运行绿测与相关单测**

  运行：`pnpm exec vitest run src/workbench/generationCanvas/nodes/Scene3DEditor.test.ts src/workbench/generationCanvas/nodes/DeferredNodeMedia.test.tsx`

  预期：全部 PASS。

- [ ] **步骤 6：补真实旅程断言**

  `scene3d-take-record.walk.mjs` 首次进入编辑器时跳过 coach marks；出片后断言 `[data-scene3d-take-video="true"]` 可见且有 `controls`，截图卡面。`scene3d-reference-pack.walk.mjs` 同样处理 coach marks，并断言首/尾帧标准 image 节点各自渲染图片。

- [ ] **步骤 7：生产构建真机走查**

  运行 `pnpm build` 后执行两个 walk；人工查看“出片前/出片后/参考图”截图，确认视频控制条无遮挡、3D 入口仍在、图片节点无裂图。

- [ ] **步骤 8：定向提交**

  只暂存本项的实现、测试、计划与样张文件，提交后进入 P1-1。

## 5. 回滚

每项独立提交，可按问题单独 revert。P0-1 不迁移数据结构，只改变既有 `cameraMoveVideo.url` 的消费方式；回滚不会损坏已经生成的 mp4。
