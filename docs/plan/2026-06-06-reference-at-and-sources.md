# Plan：参考区重做（tile + @ 引用）+ 三来源统一添加

> 样张：`docs/design/mockups/2026-06-06-reference-at-v4.html`（4 态，已渲染 `tests/ux/shots/MOCKUP-v4.png`）。
> 方向已过设计师 + 真实用户 agent（均「成立 / 好用多了」），并据反馈迭代到 v4.1。用户已认设计方向。
> 规则：Rule 4 执行文档；UI 走 Rule 8 样张 + Rule 7 评审（已做）。

## 1. 目标（用户拍板）

把现状「角色参考 / 参考视频 / 参考音频 三组带标签 + caption + 暴露 character1」改成：
1. **参考图，不叫角色**：统一一排**正方形 tile**；图/视频/音频靠**形态自明**（缩略图 / 缩略图+播放三角+暗蒙层 / 整块波形），不靠右下角小角标。
2. **@ 内联引用**：描述里**点 tile（主路径）或打 @（快捷键）** → 该图缩略图进句子（≈1 字高、基线齐、无数字）；发模型前才把它转成 `character1..N`——**用户永不可见 character1**。
3. **最少文字**：删所有 caption/「顺序对应…」说明；空态只「+ 加参考图（可选）」+「描述你想生成的画面…」。

## 2. 三来源统一添加（研究结论）

现状（Explore 摸底，见 §4 证据）：三来源**互不打通**——目录树拖拽只新建独立 asset 卡、数组槽 meta-only 不连线、上传直写 meta、**节点级 onDrop 没有**。

**方案 = 一个统一入口 + 两条画布原生捷径，全汇到同一条「加参考」管道**（顶尖工具共识：Krea/即梦统一素材抽屉、Figma place image、ComfyUI LoadImage upload+文件夹、Notion Upload/Embed 分栏）：

- **「+」→ 统一选择器**（样张态④）：
  - **画布**：横排画布图卡缩略图，点选即加。
  - **项目素材**：项目文件夹的图/视频/音频，**以缩略图呈现**（比裸文件树优雅），点选即加。
  - **⬆ 上传本地文件**：系统文件框。
  - 选择器接拖入（文件树/桌面拖文件）。
- **连线**：从卡片输出点拉到节点 → 加为参考 tile。**数组保持 meta-only、不持久画 9 条线**（连线是一次"投入"手势，tile 才是持久表示）——既能连又不糊画布，化解 M6。
- **拖到节点上**：目录树/桌面文件拖到节点 → 直接加（**需补节点级 onDrop**）。

## 3. 实现要点 / 改动面（按层）

**渲染层 UI**
- `ReferenceSlots.tsx` / 新 `ReferenceTiles.tsx`：三组分别标签 → **一排统一 tile**；类型形态（image/video/audio）自明；点 tile 插入描述。
- 新 `AddReferencePicker.tsx`：统一选择器（画布卡 + 项目素材缩略图 + 上传 + 拖入），一个入口三来源。
- 描述框：从纯 textarea → 支持**内联引用 chip**（contentEditable 或 textarea + overlay 方案，需调研；Rule 5/6 先查）。@ 唤起 + 点 tile 唤起，同一插入管道。
- 发送前投影：句中引用按出现/放入顺序 → `character1..N`（renderer 侧，发请求前替换；接 archetypeMeta.buildArchetypeInputParams）。

**数据 / 来源接入**
- 项目素材来源：复用 `useWorkspaceFiles` / `workspaceFileIndex`，放开 FileTreeNode 只 image 可拖（视频/音频也要）。
- 节点级 onDrop：BaseGenerationNode 补 drop handler，认 `WORKSPACE_FILE_DRAG_MIME` + OS `Files` → 加到当前 tile row（而非新建画布卡）。
- 连线→参考：`connectToNode` 命中「目标节点有参考槽」时，加到 meta 数组（不强建持久 edge）；沿用 generationReferenceResolver 聚合。

**不动 / 谨慎**
- character1 的模型契约不变（只是从用户眼前藏起来，发送前才出现）。
- 单帧槽（首/尾帧）的 edge+meta 双写沿用；数组槽 meta-only 沿用（M6）。

## 4. 现状证据（Explore 摸底）
- 目录树：`WorkspaceFileExplorerPanel` / `FileTreeNode`（仅 image 可拖，MIME `application/x-nomi-workspace-file`，`nomi-local://` URL）；拖到画布只走 `GenerationCanvas.handleStageDrop` → 新建 asset 节点。
- 连线：自定义两段点击（`store.startConnection`/`connectToNode`），非 React Flow；edge mode 实际只用 reference/first_frame/last_frame（style/character/composition_ref 死代码兜底）。
- 上传：`importWorkbenchLocalAssetFile` → 复制进项目文件夹 + 写 meta（vendor URL）；无素材库 UI。
- 节点级 onDrop：**无**。
- C3「+ 添加」：图片槽接了 上传 + 选画布图节点；视频/音频只上传；目录树/连线均未接。

## 5. 验收门
- Rule 8：样张 v4 已出 + 设计师/用户 agent 过审 + 用户认方向。落地后**真渲染样张并排对账**（Rule 8 AFTER）。
- Rule 13：零额度走查（加图三来源各走一遍 + @ 引用 + 发送前 character 投影快照）。
- CI 五门；character 投影 + 三来源加入的单测。
