#!/usr/bin/env node
// 下载量看板 —— Nomi 的「最小埋点」。
//
// 为什么是它：下载发生在 GitHub Releases，不在用户机器上 → 零隐私足迹、零代码侵入。
// GitHub 为每个 release 资产记了 download_count（累计快照），本脚本把它聚合成人看得懂的表。
//
// 两种用法（一份代码，不开并行实现）：
//   node ./scripts/stats-downloads.mjs            打印当前下载看板（总量/平台/分版本）
//   node ./scripts/stats-downloads.mjs --snapshot 追加今日快照到 docs/stats/downloads-history.json
//                                                 （供每日 Action 调用，攒出趋势曲线）
//
// 口径：只数真人下载的安装包（.dmg / .exe），剔除 .blockmap / latest*.yml / .zip
//       —— 那些是 electron 自动更新机制拉的，不是人。
// 诚实边界：下载 ≠ 安装 ≠ 活跃用户；重复点/爬虫都会计数。它给的是「触达与平台分布」信号，
//           不是激活信号。要知道「下载后有没有创作出片」，得另上 App 内激活漏斗（本脚本不碰）。

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HISTORY_PATH = path.join(ROOT, "docs", "stats", "downloads-history.json");

/** 从 GITHUB_REPOSITORY（Action 注入）或 git remote 推断 owner/repo。 */
function resolveRepo() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const url = execSync("git remote get-url origin", { cwd: ROOT }).toString().trim();
  const m = url.match(/github\.com[/:]([^/]+)\/(.+?)(?:\.git)?$/);
  if (!m) throw new Error(`无法从 origin 推断仓库：${url}`);
  return `${m[1]}/${m[2]}`;
}

/** 拉全部 release（翻页）。公开仓库读 download_count 无需 token；有 token 则提速率限。 */
async function fetchReleases(repo) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "nomi-stats" };
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const all = [];
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

/** 是否真人安装包：.dmg / .exe，且非 .blockmap。 */
function isInstaller(name) {
  return /\.(dmg|exe)$/i.test(name) && !/blockmap/i.test(name);
}

/** 资产名 → 平台。按扩展名定平台，不靠命名习惯（早期资产名不带 win/arch 字样），保证每个安装包必落一类、账永远平。 */
function platformOf(name) {
  if (/\.exe$/i.test(name)) return "windows"; // .exe 只存在于 Windows
  if (/arm64/i.test(name)) return "macArm"; // .dmg 带 arm64 = Apple 芯
  return "macIntel"; // 其余 .dmg（x64 / intel / 早期不带架构的裸 dmg）= Mac Intel/通用
}

function aggregate(releases) {
  const byPlatform = { windows: 0, macArm: 0, macIntel: 0 };
  const byVersion = {};
  for (const rel of releases) {
    let verTotal = 0;
    for (const asset of rel.assets ?? []) {
      if (!isInstaller(asset.name)) continue;
      const n = asset.download_count ?? 0;
      byPlatform[platformOf(asset.name)] += n;
      verTotal += n;
    }
    byVersion[rel.tag_name] = { dl: verTotal, published: rel.published_at };
  }
  const total = Object.values(byPlatform).reduce((a, b) => a + b, 0);
  return { total, byPlatform, byVersion };
}

const todayISO = () => new Date().toISOString().slice(0, 10);

function readHistory() {
  if (!fs.existsSync(HISTORY_PATH)) return { snapshots: [] };
  return JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
}

/** 写今日快照（同日幂等覆盖）。返回与上一份不同日快照的总量差，供打印「自上次 +N」。 */
function writeSnapshot(agg) {
  const hist = readHistory();
  const date = todayISO();
  const flatVersions = Object.fromEntries(Object.entries(agg.byVersion).map(([k, v]) => [k, v.dl]));
  const snap = { date, total: agg.total, byPlatform: { ...agg.byPlatform }, byVersion: flatVersions };

  const prior = hist.snapshots.filter((s) => s.date !== date);
  const lastDifferentDay = prior[prior.length - 1];
  hist.snapshots = [...prior, snap]; // 同日只留最新一份

  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(hist, null, 2) + "\n");
  return lastDifferentDay ? agg.total - lastDifferentDay.total : null;
}

function pct(n, total) {
  return total === 0 ? "0%" : `${Math.round((n / total) * 100)}%`;
}

function printDashboard(agg, sinceLast) {
  const { total, byPlatform, byVersion } = agg;
  const bar = (n, max, width = 24) => "█".repeat(Math.round((n / Math.max(max, 1)) * width));

  console.log(`\n  Nomi 下载看板 · ${todayISO()}`);
  console.log("  " + "─".repeat(46));
  console.log(`  真人安装包下载总计   ${total}` + (sinceLast != null ? `   (自上次快照 ${sinceLast >= 0 ? "+" : ""}${sinceLast})` : ""));
  console.log("");
  console.log(`  Windows      ${String(byPlatform.windows).padStart(5)}  ${pct(byPlatform.windows, total).padStart(4)}  ${bar(byPlatform.windows, total)}`);
  console.log(`  Mac Apple芯  ${String(byPlatform.macArm).padStart(5)}  ${pct(byPlatform.macArm, total).padStart(4)}  ${bar(byPlatform.macArm, total)}`);
  console.log(`  Mac Intel    ${String(byPlatform.macIntel).padStart(5)}  ${pct(byPlatform.macIntel, total).padStart(4)}  ${bar(byPlatform.macIntel, total)}`);

  const versions = Object.entries(byVersion)
    .filter(([, v]) => v.published)
    .sort((a, b) => new Date(b[1].published) - new Date(a[1].published))
    .slice(0, 12);
  const maxVer = Math.max(...versions.map(([, v]) => v.dl), 1);
  console.log("\n  近 12 个版本");
  console.log("  " + "─".repeat(46));
  for (const [tag, v] of versions) {
    console.log(`  ${tag.padEnd(11)} ${String(v.dl).padStart(4)}  ${bar(v.dl, maxVer, 28)}`);
  }
  console.log("");
}

async function main() {
  const snapshot = process.argv.includes("--snapshot");
  const repo = resolveRepo();
  const releases = await fetchReleases(repo);
  const agg = aggregate(releases);

  let sinceLast = null;
  if (snapshot) {
    sinceLast = writeSnapshot(agg);
    console.log(`  已记录今日快照 → ${path.relative(ROOT, HISTORY_PATH)}`);
  } else {
    const hist = readHistory();
    const prior = hist.snapshots.filter((s) => s.date !== todayISO());
    const last = prior[prior.length - 1];
    if (last) sinceLast = agg.total - last.total;
  }
  printDashboard(agg, sinceLast);
}

main().catch((err) => {
  console.error(`\n  ✗ 拉取下载数据失败：${err.message}\n`);
  process.exit(1);
});
