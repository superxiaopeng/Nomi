// 冷启动 J3 走查（全新安装模拟）——隔离 userData + 空 NOMI_PROJECTS_DIR 启动，验证：
//   CS1：首页（项目库）有没有「模型接入」入口？新用户零模型时能不能自己找到去接入的地方？
//   CS2：全新安装零文本模型预置 → 点「30 秒体验」会不会第一步就死（Agent 拆镜头需要文本模型）？
// 这是已知 P0 断路点（见 docs/plan backlog #D）。本脚本只暴露/取证，不修。
//
// 用法：node tests/ux/cold-start.e2e.mjs
import { _electron as electron } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// 每次跑都用全新的隔离目录（带时间戳），确保是「全新安装」状态，不被上次残留污染。
const stamp = `${Date.now()}`;
const userDataDir = path.join(os.tmpdir(), `nomi-cold-userdata-${stamp}`);
const projectsDir = path.join(os.tmpdir(), `nomi-cold-projects-${stamp}`);
fs.mkdirSync(userDataDir, { recursive: true });
fs.mkdirSync(projectsDir, { recursive: true });
console.log(`隔离 userData: ${userDataDir}`);
console.log(`隔离 projects: ${projectsDir}`);

const shotsDir = path.join(repoRoot, "tests/ux/shots");
fs.mkdirSync(shotsDir, { recursive: true });

const app = await electron.launch({
  executablePath: require("electron"),
  args: [".", `--user-data-dir=${userDataDir}`],
  cwd: repoRoot,
  env: { ...process.env, NOMI_PROJECTS_DIR: projectsDir },
});
const win = await app.firstWindow();
await win.waitForLoadState("domcontentloaded");
await win.waitForTimeout(2000);

let passed = 0;
const findings = [];
function check(label, ok, detail) {
  if (ok) { passed += 1; console.log(`  ✓ ${label}`); }
  else { findings.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

try {
  // 取证 1：冷启动首页快照
  await win.screenshot({ path: path.join(shotsDir, "cold-01-library.png") });

  // CS0：确认确实是全新安装——项目库为空、模型目录为空
  const initial = await win.evaluate(async () => {
    let textModels = -1;
    try {
      const bridge = window.desktopBridge || window.nomiDesktop || null;
      // 经渲染层 API 读模型目录（与 tryExample 用的同一条）
      const mod = await import("/src/workbench/api/modelCatalogApi.ts").catch(() => null);
      if (mod?.listWorkbenchModelCatalogModels) {
        const list = await mod.listWorkbenchModelCatalogModels({ kind: "text", enabled: true }).catch(() => []);
        textModels = list.length;
      }
      void bridge;
    } catch { /* ignore */ }
    const cards = document.querySelectorAll('[role="button"]');
    const projectCards = Array.from(cards).filter((el) => el.querySelector(".aspect-video")).length;
    return { textModels, projectCards };
  });
  console.log(`\n── 冷启动初始状态 ──\n  文本模型数=${initial.textModels}，项目卡数=${initial.projectCards}`);

  // CS1：首页有没有「模型接入」入口（新用户能自己找到去配模型的地方）？
  const entryProbe = await win.evaluate(() => {
    const all = Array.from(document.querySelectorAll("button, a, [role=button]"));
    const hit = all.find((el) => /模型接入|接入模型|连接模型|配置模型|模型目录|添加模型/.test(el.textContent || ""));
    return { hasEntry: Boolean(hit), entryText: hit?.textContent?.trim().slice(0, 30) || "" };
  });
  console.log("\n── CS1：首页模型接入入口 ──");
  check("首页可见「模型接入」入口（新用户能自助接入）", entryProbe.hasEntry, `entry="${entryProbe.entryText}"`);

  // CS2：点「30 秒体验」第一个示例 → 会不会第一步就死（零文本模型）？
  const tryBtn = win.locator('[data-try-now-example-id]').first();
  const hasTry = await tryBtn.count();
  if (hasTry > 0) {
    await tryBtn.click().catch(() => {});
    await win.waitForTimeout(2500);
    await win.screenshot({ path: path.join(shotsDir, "cold-02-after-try.png") });
    // 体验成功的判定：进入 studio（出现画布或工作台），而不是停在首页弹个 toast。
    const after = await win.evaluate(() => {
      const inStudio = Boolean(document.querySelector(".nomi-studio-app, .generation-canvas-v2, [aria-label='Nomi Studio']"));
      const toast = Array.from(document.querySelectorAll("*")).find((el) => /先接入一个文本模型/.test(el.textContent || "") && el.children.length === 0);
      const onboardingOpen = Boolean(document.querySelector('[aria-label="模型设置"], [aria-label="模型接入"]'));
      return { inStudio, toastShown: Boolean(toast), onboardingOpen };
    });
    // 全新安装零模型 + 无 key → 本就无法真生成；成功标准是「不死路」：弹引导 toast + 打开模型接入面板，
    // 让用户当场能填 key 往下走（而不是 toast 进虚空、首页又没接入入口）。
    console.log("\n── CS2：30 秒体验零模型时是否给出可走的下一步 ──");
    check("「30 秒体验」零模型时打开模型接入面板（不死路）", after.onboardingOpen,
      `inStudio=${after.inStudio} / toast=${after.toastShown} / onboarding=${after.onboardingOpen}`);
  } else {
    findings.push("首页找不到「30 秒体验」示例按钮（data-try-now-example-id）");
    console.log("  ✗ 首页找不到「30 秒体验」示例按钮");
  }

  console.log(`\n冷启动 J3：${passed} 项达标，${findings.length} 项断路/缺口`);
  if (findings.length) {
    console.log("断路/缺口清单：\n - " + findings.join("\n - "));
    console.log("（这些是已知 P0，取证完用于决定怎么修）");
  } else {
    console.log("✅ 冷启动 J3 全通");
  }
} catch (error) {
  console.error(`\nERROR: ${error?.message || error}`);
  process.exitCode = 1;
} finally {
  await app.close().catch(() => {});
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.rmSync(projectsDir, { recursive: true, force: true });
}
