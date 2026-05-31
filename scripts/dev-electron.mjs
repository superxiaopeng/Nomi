import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.dirname(fileURLToPath(new URL("..", import.meta.url)));

/**
 * Make the onboarding agent work in `pnpm dev` without manual `export`s.
 *
 * The onboarding agent LLM (dm-fox gpt-5.5) is configured via NOMI_ONBOARDING_AGENT_*
 * env vars. Before this, a plain restart that forgot the exports left the wizard
 * showing "还没有配置用来阅读文档的 AI" even though the key file was sitting right
 * there. We auto-load `.secrets/agent.key` and apply the documented dm-fox defaults.
 * An already-exported env var always wins, so manual overrides still work.
 */
function loadOnboardingAgentEnv() {
  const out = {};
  const keyPath = path.join(repoRoot, ".secrets", "agent.key");
  let key = process.env.NOMI_ONBOARDING_AGENT_KEY || "";
  if (!key && fs.existsSync(keyPath)) {
    try { key = fs.readFileSync(keyPath, "utf8").trim(); } catch { /* ignore */ }
  }
  if (!key) {
    console.warn("⚠  No onboarding agent key (.secrets/agent.key missing and NOMI_ONBOARDING_AGENT_KEY unset). Model onboarding will be disabled.");
    return out;
  }
  out.NOMI_ONBOARDING_AGENT_KEY = key;
  out.NOMI_ONBOARDING_AGENT_BASE_URL = process.env.NOMI_ONBOARDING_AGENT_BASE_URL || "https://dm-fox.rjj.cc/codex/v1";
  out.NOMI_ONBOARDING_AGENT_MODEL = process.env.NOMI_ONBOARDING_AGENT_MODEL || "gpt-5.5";
  out.NOMI_ONBOARDING_AGENT_PROVIDER = process.env.NOMI_ONBOARDING_AGENT_PROVIDER || "openai-compatible";
  console.log(`▶  Onboarding agent: ${out.NOMI_ONBOARDING_AGENT_MODEL} via ${out.NOMI_ONBOARDING_AGENT_BASE_URL}`);
  return out;
}
const electron = require("electron");
const vitePackagePath = require.resolve("vite/package.json");
const viteBin = path.join(path.dirname(vitePackagePath), "bin", "vite.js");
const tscPackagePath = require.resolve("typescript/package.json");
const tscBin = path.join(path.dirname(tscPackagePath), "bin", "tsc");

function electronEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function compileElectronMain() {
  const result = spawnSync(process.execPath, [tscBin, "-p", "electron/tsconfig.json"], {
    stdio: "inherit",
    env: electronEnv(),
  });
  if (result.signal) process.kill(process.pid, result.signal);
  if (typeof result.status === "number" && result.status !== 0) process.exit(result.status);
}

function start(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else if (typeof code === "number" && code !== 0) process.exit(code);
  });
  return child;
}

function startElectron(options = {}) {
  return start(electron, ["."], options);
}

async function waitForRenderer(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60000) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await response.arrayBuffer();
        return;
      }
      await response.arrayBuffer();
    } catch {
      // retry until Vite is ready
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Renderer did not become ready: ${url}`);
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function findRendererPort(preferredPort) {
  for (let port = preferredPort; port < preferredPort + 20; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available renderer port found from ${preferredPort}`);
}

const rendererPort = await findRendererPort(5173);
const rendererUrl = `http://127.0.0.1:${rendererPort}`;
compileElectronMain();
const vite = start(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(rendererPort), "--strictPort"], {
  env: electronEnv(),
});

const shutdown = () => {
  vite.kill();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", shutdown);

await waitForRenderer(rendererUrl);

const app = startElectron({
  env: electronEnv({
    NOMI_DESKTOP_DEV: "1",
    VITE_DEV_SERVER_URL: rendererUrl,
    ...loadOnboardingAgentEnv(),
  }),
});

app.on("exit", () => {
  vite.kill();
});
