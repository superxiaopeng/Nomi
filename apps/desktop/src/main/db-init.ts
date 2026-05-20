import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function findNodePath(): string {
  // Prefer explicit NODE env var (set by electron-builder or dev scripts),
  // then well-known system locations. Never use process.execPath which is
  // the Electron binary, not Node.js.
  const candidates = [
    process.env.NODE,
    '/usr/local/bin/node',
    '/usr/bin/node',
    '/opt/homebrew/bin/node',
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  // Fallback: hope `node` is in PATH
  return 'node';
}

function findPrismaCliPath(): string {
  // Use the Prisma CLI JS entry point so it can be invoked via `node`.
  // The packaged app bundles prisma under extraResources/prisma-cli.
  const candidates = [
    path.join(process.resourcesPath || '', 'prisma-cli', 'node_modules', 'prisma', 'build', 'index.js'),
    path.resolve(__dirname, '../../../../node_modules/prisma/build/index.js'),
    path.resolve(__dirname, '../../../backend/node_modules/prisma/build/index.js'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  // Fallback: hope prisma is in PATH (will be used as the executable itself)
  return 'prisma';
}

function findDesktopSchemaPath(): string {
  // Prefer the SQLite-specific desktop schema, fall back to main schema.
  const candidates = [
    path.join(process.resourcesPath || '', 'prisma', 'schema.desktop.prisma'),
    path.join(process.resourcesPath || '', 'prisma', 'schema.prisma'),
    path.resolve(__dirname, '../../../backend/prisma/schema.desktop.prisma'),
    path.resolve(__dirname, '../../../backend/prisma/schema.prisma'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    'Cannot find schema.desktop.prisma or schema.prisma. ' +
    'Searched: ' + candidates.join(', ')
  );
}

function execFileAsync(
  file: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { env, timeout: 60_000 },
      (error, _stdout, stderr) => {
        if (error) {
          reject(Object.assign(new Error(error.message), { stderr }));
        } else {
          resolve();
        }
      }
    );
  });
}

export async function initDatabase(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || process.env.PRISMA_DB_PROVIDER !== 'libsql') {
    // 非 libsql 模式（e.g. PostgreSQL），跳过
    return;
  }

  // 提取 SQLite 文件路径（去掉 "file:" 前缀）
  const dbFilePath = dbUrl.replace(/^file:/, '');

  const isFirstRun = !fs.existsSync(dbFilePath);
  if (isFirstRun) {
    console.log('[db-init] First run detected, creating SQLite database...');
  } else {
    console.log('[db-init] Existing database found, checking for schema updates...');
  }

  const prismaPath = findPrismaCliPath();
  const schemaPath = findDesktopSchemaPath();
  const nodePath = findNodePath();

  console.log(`[db-init] node=${nodePath} prisma=${prismaPath} schema=${schemaPath}`);

  // If prismaPath is a .js file, invoke via node; otherwise call directly.
  const isPrismaJs = prismaPath.endsWith('.js');
  const execBin = isPrismaJs ? nodePath : prismaPath;
  const execArgs = isPrismaJs
    ? [prismaPath, 'db', 'push', '--schema', schemaPath, '--accept-data-loss', '--skip-generate']
    : ['db', 'push', '--schema', schemaPath, '--accept-data-loss', '--skip-generate'];

  try {
    await execFileAsync(execBin, execArgs, { ...process.env, DATABASE_URL: dbUrl });
    console.log('[db-init] Schema applied successfully');
  } catch (err: unknown) {
    const stderr = err instanceof Error && 'stderr' in err
      ? String((err as NodeJS.ErrnoException & { stderr?: string }).stderr || '')
      : '';
    console.error('[db-init] prisma db push failed:', stderr || err);

    if (isFirstRun) {
      throw new Error(
        `Failed to initialize SQLite database. ` +
        `Error: ${err instanceof Error ? err.message : err}`
      );
    }
    // 非首次运行时，push 失败不是致命的（可能是 schema 已是最新）
  }
}
