#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { cpSync, readdirSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

async function run(cmd, args, opts = {}) {
  const proc = spawn(cmd, args, { stdio: 'inherit', shell: true, ...opts });
  return new Promise((resolve, reject) => {
    proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}`)));
  });
}

// 0. 生成 desktop Prisma client（使用 libsql schema）
await run('pnpm', ['--filter', '@nomi/api', 'prisma:generate:desktop'], { cwd: resolve(root, '../..') });

// 1. 编译主进程：自动收集 src/main/ 下全部 .ts，避免新增文件后忘记登记
const mainSrcDir = resolve(root, 'src/main');
const mainEntries = readdirSync(mainSrcDir)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
  .map((f) => `src/main/${f}`);
if (!mainEntries.includes('src/main/index.ts')) {
  throw new Error('[desktop] src/main/index.ts is missing');
}
console.log(`[desktop] Compiling ${mainEntries.length} main process entries:`, mainEntries.join(', '));
await run('npx', ['esbuild',
  ...mainEntries,
  '--bundle=false', '--platform=node', '--target=node20', '--format=cjs',
  '--outdir=dist/main',
], { cwd: root });

// 1b. 校验：每个 .ts 都应有对应的 .js 产物
const distMainDir = resolve(root, 'dist/main');
const missing = mainEntries
  .map((p) => p.replace(/^src\/main\//, '').replace(/\.ts$/, '.js'))
  .filter((js) => !existsSync(resolve(distMainDir, js)));
if (missing.length > 0) {
  throw new Error(`[desktop] Build verification failed, missing: ${missing.join(', ')}`);
}

// 2. 编译 preload
await run('npx', ['esbuild',
  'src/preload/index.ts',
  '--bundle', '--platform=node', '--target=node20', '--format=cjs',
  '--outfile=dist/preload/index.js',
], { cwd: root });

// 3. 复制 web 构建产物到 renderer 目录
const webDist = resolve(root, '../web/dist');
const rendererDist = resolve(root, 'dist/renderer');
cpSync(webDist, rendererDist, { recursive: true });
console.log('[desktop] Copied web dist to dist/renderer');

console.log('[desktop] Build complete. Run "pnpm dist" to package.');
