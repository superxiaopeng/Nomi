# Nomi 桌面端改造方案

## 一、技术选型：为什么是 Electron

Nomi 的后端是 Node.js（Hono），Electron 主进程本身就是 Node.js 运行时，因此 `apps/hono-api` 的全部代码可以直接在主进程内运行，零语言重写。相比 Tauri（需要 Rust 重写后端或管理 sidecar 子进程），Electron 的改造成本和风险都最低。

**关键约束驱动的选择：**
- `@napi-rs/canvas`、`@webav/av-cliper` 等原生 Node 模块在 Electron 中可直接 rebuild，无需换技术
- 团队只需要 TypeScript，无需引入 Rust
- 现有 Hono + Prisma + BullMQ 代码复用率接近 100%

---

## 二、整体架构

### Monorepo 结构（新增 apps/desktop，原有三个 app 不动）

```
apps/
├── web/            ← 不动，浏览器版继续存在
├── hono-api/       ← 小改（加 SQLite 分支 + 本地存储适配）
├── agents-cli/     ← 不动
└── desktop/        ← 新增
    ├── package.json
    ├── electron-builder.yml
    ├── src/
    │   ├── main/
    │   │   ├── index.ts              # 主进程入口，启动编排
    │   │   ├── api-server.ts         # 内嵌 Hono API
    │   │   ├── agents-bridge.ts      # 启动 agents-cli bridge 子进程
    │   │   ├── storage.ts            # 本地文件存储服务
    │   │   ├── ipc-handlers.ts       # IPC 处理器注册
    │   │   ├── tray.ts               # 托盘图标
    │   │   ├── updater.ts            # 自动更新
    │   │   ├── file-assoc.ts         # .nomi 文件关联
    │   │   └── window.ts             # BrowserWindow 管理
    │   └── preload/
    │       └── index.ts              # contextBridge，暴露系统能力给渲染进程
    └── resources/
        ├── icons/
        └── entitlements.plist        # macOS 权限声明
```

### 进程职责划分

| 进程 | 职责 |
|------|------|
| **主进程（Main）** | 内嵌 Hono API Server、管理子进程、系统集成（托盘/通知/文件关联）、自动更新 |
| **预加载脚本（Preload）** | 通过 contextBridge 安全暴露有限系统能力给渲染进程 |
| **渲染进程（Renderer）** | 加载 `apps/web` 的生产构建产物，API 请求走 HTTP 到本地 Hono |

### 启动顺序

```
Electron 启动
    │
    ├─ 1. 显示 Loading 界面
    ├─ 2. 初始化 SQLite 数据库（prisma db push）
    ├─ 3. 启动 Hono API Server（主进程内调用 createNomiApp）
    ├─ 4. 启动 Agents Bridge（子进程 spawn）
    ├─ 5. 健康检查通过后，加载 web UI
    └─ 6. 就绪，隐藏 Loading 界面
```

---

## 三、数据层迁移

### 3.1 PostgreSQL → SQLite（via libsql + @prisma/adapter-libsql）

选择 libsql 而非 better-sqlite3 的原因：libsql 使用 JS 驱动，绕过了 Prisma Query Engine（Rust 原生二进制），省去 Electron rebuild 的麻烦。

**schema 改动：** 新增 `prisma/schema.desktop.prisma`，与原 schema 的差异只有两处：

1. 移除 6 处 `@db.Real` 注解（PostgreSQL 专用语法）：
   - `edit_ratio Float? @db.Real` → `edit_ratio Float?`
   - `score / score_quality / score_visual / score_conversion Float @db.Real` → 去掉注解
   - `cost Float? @db.Real` → `cost Float?`

2. 修改 datasource：
```prisma
datasource db {
  provider     = "libsql"
  url          = env("DATABASE_URL")   # file:/path/to/nomi.db
  relationMode = "prisma"              # libsql 不支持外键，改为应用层检查
}
```

**node-env.ts 改动：** `createRuntimePrismaClient()` 增加 libsql 分支：
```typescript
if (process.env.PRISMA_DB_PROVIDER === 'libsql') {
  const { createClient } = await import('@libsql/client');
  const { PrismaLibSQL } = await import('@prisma/adapter-libsql');
  const libsql = createClient({ url: process.env.DATABASE_URL! });
  const adapter = new PrismaLibSQL(libsql);
  return new PrismaClient({ adapter });
}
```

**db.ts 改动：** provider 为 libsql 时，`queryAll()` / `execute()` 跳过 `toPgSql()` 转换，直接执行原始 SQLite 语法（历史代码本来就是用 SQLite 语法写的，只是被运行时转换为 PostgreSQL）。

**数据库文件位置：**
- macOS: `~/Library/Application Support/Nomi/nomi.db`
- Windows: `%APPDATA%\Nomi\nomi.db`

### 3.2 Redis / BullMQ — 零改动

Redis 在项目中只有两处使用，且都已有 fallback：
- `auth.service.ts` 的 OTP 存储：`REDIS_URL` 为空时自动 fallback 到数据库表 `email_login_codes`
- `agents-cli` 的会话缓存：Redis 缺失时 fallback 到本地文件存储

BullMQ 在 `package.json` 中列为依赖，但运行时实际未使用（任务队列用 `setTimeout` 模拟）。

### 3.3 S3 → 本地文件系统

在 `asset.hosting.ts` 的 `getStorageOrThrow()` 前增加本地模式判断：
```typescript
if (process.env.ASSET_HOSTING_LOCAL_MODE === '1') {
  return { kind: 'local', root: process.env.ASSET_LOCAL_ROOT! };
}
```

在 Hono 路由中注册 `GET /local-assets/*` 静态文件服务，`publicBase` 设为 `http://127.0.0.1:8788/local-assets`，前端代码无需改动。

### 3.4 Auth 层简化

Desktop 无需登录。复用现有的 `TAPCANVAS_DEV_PUBLIC_BYPASS` 机制，主进程首次启动时自动创建本地用户并生成永久 JWT，渲染进程写入 `localStorage`，用户完全无感知。

---

## 四、进程管理

### Hono API 内嵌主进程

```typescript
// apps/desktop/src/main/api-server.ts
import { createNomiApp } from '@nomi/api/src/app';
import { createNodeWorkerEnv } from '@nomi/api/src/platform/node/node-env';
import { createHonoNodeServer } from '@nomi/api/src/platform/node/hono-node-server';
import { app as electronApp } from 'electron';
import path from 'node:path';

export async function startApiServer(): Promise<{ port: number; close: () => void }> {
  const userData = electronApp.getPath('userData');

  process.env.DATABASE_URL = `file:${path.join(userData, 'nomi.db')}`;
  process.env.PRISMA_DB_PROVIDER = 'libsql';
  process.env.ASSET_HOSTING_LOCAL_MODE = '1';
  process.env.ASSET_LOCAL_ROOT = path.join(userData, 'assets');
  process.env.JWT_SECRET = await getOrCreateJwtSecret(userData);
  process.env.AGENTS_BRIDGE_AUTOSTART = 'false';

  const honoApp = await createNomiApp();
  const env = await createNodeWorkerEnv();
  const server = createHonoNodeServer(honoApp, env);
  const port = await findFreePort(8788);
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return { port, close: () => server.close() };
}
```

### Agents Bridge 子进程

```typescript
// apps/desktop/src/main/agents-bridge.ts
const agentsCliEntry = path.join(process.resourcesPath, 'agents-cli', 'dist', 'cli', 'index.js');
const child = spawn(process.execPath, [agentsCliEntry, 'serve', '--port', '8799'], {
  env: { ...process.env, TAPCANVAS_API_BASE_URL: `http://127.0.0.1:${apiPort}` },
  stdio: ['ignore', 'pipe', 'pipe'],
});
process.env.AGENTS_BRIDGE_BASE_URL = 'http://127.0.0.1:8799';
await waitForHealthy('http://127.0.0.1:8799/health', 15_000);
```

---

## 五、系统集成

### 托盘常驻
```typescript
const tray = new Tray(iconPath);
tray.setContextMenu(Menu.buildFromTemplate([
  { label: '打开 Nomi', click: () => mainWindow.show() },
  { label: '退出', click: () => app.quit() },
]));
mainWindow.on('close', (e) => { e.preventDefault(); mainWindow.hide(); });
app.on('activate', () => mainWindow.show());
```

### 系统通知 / 文件拖拽 / 开机自启
通过 IPC 暴露给渲染进程（`preload/index.ts` 的 `contextBridge`），web 端通过 `window.nomiDesktop` 调用，在非 Electron 环境该对象不存在，功能自动降级。

### .nomi 项目文件关联
在 `electron-builder.yml` 中声明 `fileAssociations`，主进程监听 `open-file`（macOS）和 `process.argv`（Windows）。

---

## 六、打包发布

### electron-builder.yml 核心配置

```yaml
appId: com.nomi.desktop
productName: Nomi

asarUnpack:
  - "**/@napi-rs/canvas/**"      # 原生模块不能进 asar
  - "**/prisma/engines/**"
  - "**/@prisma/engines/**"

extraResources:
  - from: "../agents-cli/dist"
    to: "agents-cli/dist"

mac:
  target: [dmg, zip]
  arch: [x64, arm64]
  hardenedRuntime: true
  notarize:
    teamId: ${APPLE_TEAM_ID}

win:
  target: nsis
  arch: [x64]

publish:
  provider: github
  releaseType: release
```

### 自动更新
```typescript
import { autoUpdater } from 'electron-updater';
autoUpdater.checkForUpdatesAndNotify();
autoUpdater.on('update-downloaded', () => {
  mainWindow.webContents.send('update-ready');
});
```

---

## 七、分阶段实施计划

| Milestone | 目标 | 预计工作量 | 验收标准 |
|-----------|------|-----------|---------|
| **M1** 可运行骨架 | Electron 窗口跑起来 web UI | 2-3 周 | `pnpm desktop:dev` 启动，UI 正常，API 调用通（此阶段仍用外部 PostgreSQL） |
| **M2** 数据层本地化 | PostgreSQL → SQLite，消灭 Docker | 2-3 周 | 双击启动无需任何外部服务，数据读写到本地 `nomi.db` |
| **M3** 文件存储本地化 | S3 → 本地文件系统 | 1 周 | 上传图片/视频后 URL 正常访问，刷新后依然可用 |
| **M4** 系统集成 | 托盘、通知、拖拽、文件关联 | 1-2 周 | 关窗口应用仍在托盘运行；拖拽本地文件可上传；系统通知正常弹出 |
| **M5** Agents 集成 | agents-cli bridge 内嵌 | 1 周 | Desktop 启动后 AI 创作功能全部正常 |
| **M6** 打包发布 | dmg/exe 安装包、签名、自动更新 | 1-2 周 | GitHub Release 发布后现有安装自动检测更新 |

---

## 八、风险点与注意事项

### 风险 1：@napi-rs/canvas 原生模块 Rebuild（最高风险）

`.node` 文件绑定了特定 Node.js ABI 版本，Electron 内置 Node 版本与系统不同，必须 rebuild。

**解决方案：**
- `apps/desktop/scripts/rebuild-natives.js` 使用 `@electron/rebuild` 针对当前 Electron 版本重建
- `electron-builder.yml` 中将 `@napi-rs/canvas` 加入 `asarUnpack`
- `package.json` 增加 `postinstall` 钩子自动执行 rebuild

### 风险 2：Prisma schema 双版本维护同步

PostgreSQL 版和 SQLite 版 schema 可能不同步。

**解决方案：** CI 检查脚本，每次 `schema.prisma` 改动时自动验证 `schema.desktop.prisma` 是否同步更新（脚本自动 diff `@db.*` 注解之外的部分）。

### 风险 3：vite.config.ts 的构建限制

Desktop 构建需要 `VITE_API_BASE=http://127.0.0.1:8788`，但当前 vite 配置会拒绝 localhost。

**解决方案：**
- `apps/web/vite.config.ts` 增加 `mode === 'desktop'` 分支，跳过 localhost 检查和 GitHub OAuth 必填检查
- 同时设置 `ALLOW_LOCALHOST_IN_PROD_BUILD=1`

### 风险 4：渲染进程 API BaseURL 动态化

API 端口动态分配（`findFreePort`），不能在构建时写死。

**解决方案：** 预加载脚本在渲染进程加载前注入 `window.__NOMI_API_BASE__`，`apps/web/src/api/httpClient.ts` 优先读取该变量（这是唯一需要修改的 web 端文件）。

### 风险 5：Windows 路径

SQLite URL 在 Windows 上需要正斜杠（`file:///C:/Users/...`），Node.js 的 `path.join()` 返回反斜杠，需要显式转换。

---

## 关键文件索引

| 文件 | 改动说明 |
|------|---------|
| `apps/hono-api/src/platform/node/node-env.ts` | 增加 libsql 分支 |
| `apps/hono-api/prisma/schema.prisma` | 新增 `schema.desktop.prisma` |
| `apps/hono-api/src/modules/asset/asset.hosting.ts` | 增加本地模式分支 |
| `apps/web/src/api/httpClient.ts` | 优先读取 `window.__NOMI_API_BASE__` |
| `apps/hono-api/src/platform/node/agents-bridge-autostart.ts` | Desktop 模式跳过自动启动 |
| `apps/web/vite.config.ts` | 增加 desktop 构建模式 |
