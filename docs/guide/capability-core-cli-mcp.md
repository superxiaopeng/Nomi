# 用 Claude Code / Codex 在本地驱动 Nomi（CLI + MCP）

> 让你电脑上的 AI 编程助手（Claude Code、Codex、Cursor…）直接操作你的 Nomi：建项目、往画布加镜头、改提示词、用你配好的模型**真生成图/视频/文本**。
> 实现见 `docs/plan/2026-06-20-capability-core-headless-exposure.md`。

## 这是什么

Nomi 主进程内置了一个**能力核**，把「建工程 / 改画布 / 真生成」做成可被外部调用的接口，两种用法：

- **CLI**：`node scripts/nomi.mjs <命令>`，最适合 Claude Code 用 Bash 直接调。
- **MCP**：把 Nomi 挂成一个 MCP server，Claude Code / Codex 当成工具来用。

**开着关着都能用，自动适配**：
- Nomi **开着** → 走它内部的本地服务（A 模式）。
- Nomi **关着** → 自动拉起一个无窗口的后台 Nomi 把活干完落盘（B 模式）。
- 你不用选模式，命令一样，区别只是「你在不在场看」。

## 一、前置：拿到 token（一次性）

外部调用要凭证，防止任意程序偷偷用你的额度。**启动一次 Nomi**（正常打开 app 即可），它会自动在这里生成 token：

```
~/.nomi/capability-core/token
```

有了这个文件，CLI / MCP 才能调。删掉它下次启动会重新生成。

> 安全：本地服务只监听 `127.0.0.1`（外网/局域网够不着）+ token 校验。**生成会花你的额度**，目前只过 token 这道门——别把 token 文件给不信任的程序。

## 二、CLI 用法

在 Nomi 仓库目录下跑（`node scripts/nomi.mjs ...`）。所有输出是 JSON。

| 命令 | 作用 |
|---|---|
| `node scripts/nomi.mjs status` | 看 Nomi 开没开、token 有没有 |
| `node scripts/nomi.mjs models` | 列出你已接入、可用的模型（vendor / modelKey / 能力 / 名称） |
| `node scripts/nomi.mjs projects` | 列出所有项目 |
| `node scripts/nomi.mjs project create "我的项目"` | 新建项目，返回 id |
| `node scripts/nomi.mjs canvas read <projectId>` | 读画布的节点与连线 |
| `node scripts/nomi.mjs canvas add <projectId> <kind> "提示词"` | 加节点（kind=text/image/video/shot/character/scene/audio） |
| `node scripts/nomi.mjs canvas connect <projectId> <源节点id> <目标节点id> [mode]` | 连线（参考关系，mode 缺省 reference） |
| `node scripts/nomi.mjs canvas prompt <projectId> <节点id> "新提示词"` | 改某节点提示词 |
| `node scripts/nomi.mjs canvas delete <projectId> <节点id> [更多id...]` | 删节点（连带删边） |
| `node scripts/nomi.mjs generate <projectId> <vendor> <modelKey> <intent> "提示词"` | **真生成**（intent=image/video/text/audio） |

### 一个完整例子：建项目 → 加镜头 → 出图

```bash
# 1. 看有哪些图模型可用
node scripts/nomi.mjs models

# 2. 建项目（记下返回的 id）
node scripts/nomi.mjs project create "产品宣传片"
# → { "id": "workspace-xxxx", "name": "产品宣传片" }

# 3. 直接在项目里真出一张图（会花额度，自动建好节点 + 轮询到出图）
node scripts/nomi.mjs generate workspace-xxxx modelscope "Tongyi-MAI/Z-Image-Turbo" image "一只戴墨镜的柴犬，赛博朋克霓虹街道"
# → { "nodeId": "...", "status": "succeeded", "assets": [{ "url": "nomi-local://...png", "providerUrl": "https://..." }] }
```

生成的图会落进项目的 `assets/` 目录，下次在 Nomi 里打开这个项目就能看到。

## 三、接进 Claude Code（MCP）

在 Claude Code 的 MCP 配置里（项目级 `.mcp.json` 或全局 `~/.claude.json`）加：

```json
{
  "mcpServers": {
    "nomi": {
      "command": "node",
      "args": ["/你的路径/Nomi/scripts/nomi-mcp.mjs"]
    }
  }
}
```

重启 Claude Code 后，它就有这些工具（直接对它说人话即可，它自己挑工具）：

| 工具 | 作用 |
|---|---|
| `nomi_list_projects` / `nomi_create_project` | 列 / 建项目 |
| `nomi_list_models` | 列可用模型 |
| `nomi_read_canvas` | 读画布 |
| `nomi_add_nodes` / `nomi_connect_nodes` | 加节点 / 连线 |
| `nomi_set_node_prompt` / `nomi_delete_nodes` | 改提示词 / 删节点 |
| `nomi_generate` | 真生成（花额度） |

例如你可以直接对 Claude Code 说：「在 Nomi 里新建一个项目叫『咖啡广告』，拆 3 个镜头加到画布，每个镜头写好提示词。」它会自己调上面的工具完成。

## 四、Nomi 开着时的一个限制

如果 Nomi **正开着、而且正好打开着你要改的那个项目**，外部的「改画布」命令会被**拒绝**（返回提示），因为那一刻 app 内存里的状态才是真相，外部直接改文件会被它覆盖掉。

应对：要么在 app 里手动改，要么先关掉那个项目再用外部命令。读取、列模型、生成不受影响。（「外部改动实时反映到打开着的画布」是后续要做的。）

## 五、已知边界（诚实标注）

- **真实视频生成**：图、文已端到端验证过；视频走同一条路但还没真跑一次（更慢更贵）。
- **打包版**：CLI 的「Nomi 关着自动拉后台」目前走 dev（仓库 + node_modules 里的 Electron）；打包安装版的等价入口是后续切片。
- **付费门**：外部生成目前只过 token 校验，还没接 app 内「真人确认才花钱」的令牌机制——别把 token 交给不信任的程序。
