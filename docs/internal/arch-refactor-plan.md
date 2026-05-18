# Nomi 架构重构计划

> 背景：仓库从"Web SaaS + Docker 自部署"迁移到"桌面优先本地工作台"后，
> 整体目录/命名/抽象层仍停留在旧心智模型里。本文档记录四阶段重构计划与进度。

---

## 核心矛盾

仓库假设的是"一个 Web SaaS"，但产品实际是"一个本地桌面工作台"。

---

## 阶段 1：清死代码 ✅/🔄

**目标**：让仓库长得像它实际是什么。零风险，机械删除。

- [ ] 删除 `wrangler.toml`（Cloudflare Workers 残留）
- [ ] 删除 `.github/workflows/cloudflare-deploy.yml`
- [ ] 将 `site/` 营销站移到 `marketing/` 或删除
- [ ] 删除 `apps/hono-api/schema.sql`（古早手写 SQL）
- [ ] 删除 `hono-api/scripts/{backup,bootstrap,seed,migrate}-postgres.mjs`（服务端专用）
- [ ] 根 `package.json`：`build → build:desktop`、`dev → dev:desktop`，删 `compose:up/down`

---

## 阶段 2：重命名 + 重排目录

**目标**：让目录结构表达产品意图。机械工作，约 1 天。

### 目录调整

```
apps/
├── desktop/         ← Electron 壳（不变）
├── backend/         ← 原 hono-api 改名
│   └── src/
│       ├── core/       ← project, chapter, storyboard, flow, draft, material, memory
│       ├── generation/ ← ai, dreamina, model, model-catalog, agents, agents-bridge, execution, task
│       ├── identity/   ← auth, apiKey, user, user-admin
│       ├── admin/      ← observability, stats, project-admin, internal
│       └── platform/   ← 平台适配
├── web/             ← 渲染层（不变）
├── agents/          ← 原 agents-cli，删双 lockfile
└── marketing/       ← 原 site/
```

### 环境变量重命名

| 旧名 | 新名 | 说明 |
|------|------|------|
| `TAPCANVAS_DEV_PUBLIC_BYPASS` | `NOMI_SINGLE_USER_MODE` | 桌面端单用户模式开关 |
| `TAPCANVAS_*` 其余 | `NOMI_*` | 统一品牌 |

---

## 阶段 3：合并双 Prisma Schema

**目标**：消除 1200 行复制粘贴维护负担。约 2 天，需要两套环境测试。

方案：只保留一个 `schema.prisma`，写成 SQLite 兼容子集：
- 移除 `@db.Real`、`@db.Text` 等 PG-only annotations（SQLite 无视，PG 不影响）
- `NoAction` → `Restrict`（SQLite + relationMode=prisma 要求）
- `provider` 通过构建时脚本切换（或用 Prisma 6 env 变量）

CI 加 diff 检查：确保 schema 同步。

---

## 阶段 4：定义 Platform 接口

**目标**：把散落的 `if (isLibSqlMode())` / `if (ASSET_HOSTING_LOCAL_MODE)` 替换成统一抽象。

```typescript
interface Platform {
  db: PrismaClient;         // adapter 后面已实现
  storage: AssetStorage;    // S3 | LocalFilesystem
  identity: IdentityProvider; // SaaSAuth | SingleUser
  notifier?: Notifier;      // desktop: system tray; server: undefined
  jobQueue?: JobQueue;      // desktop: inline; server: BullMQ
}
```

完成后桌面端可物理删除 `identity/` 和 `admin/`，安装包瘦身。

---

## 执行记录

| 日期 | 阶段 | 完成内容 |
|------|------|---------|
| TBD  | 1    | 清死代码 |
| TBD  | 2    | 重命名/重排 |
| TBD  | 3    | 合并 schema |
| TBD  | 4    | Platform 接口 |
