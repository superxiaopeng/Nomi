// L3b:VLM 客观缺陷二元判定(D4 拍板:只评谁看都是错的硬伤,"美"不评——
// pairwise 选优留给 harness V-b 的 k=2 场景)。报告型脚本:不写事件(单写者
// 纪律),产出 JSONL+摘要供人复核;真实生成 E2E 后抽样用。
//
// 配置复用 evals/judge.config.json,可加 "visionModel" 字段(缺省用 model)。
// 用法: pnpm eval:review-images <项目目录> [--limit 10]
import fs from "node:fs";
import path from "node:path";
import { loadJudgeConfig } from "../evals/lib/judge.mjs";

const args = process.argv.slice(2);
const projectDir = args.find((a) => !a.startsWith("--"));
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? Math.max(1, Number(args[limitIdx + 1]) || 10) : 10; // 评审后端#7:抽样硬上限
if (!projectDir || !fs.existsSync(projectDir)) {
  console.error("用法: pnpm eval:review-images <项目目录> [--limit 10]");
  process.exit(2);
}
const cfg = loadJudgeConfig();
if (!cfg) {
  console.error("缺 evals/judge.config.json({ baseUrl, apiKey, model, visionModel? })——VLM 判定需要额度(D2/D4),配好再来");
  process.exit(2);
}
const model = cfg.visionModel || cfg.model;

const DEFECT_RUBRIC = `只判断图片是否存在以下「客观硬伤」(任一存在即 defect=true):
1. 人物肢体/手指/面部结构崩坏(多指、扭曲、错位);
2. 文字乱码或无意义字符(招牌/UI/包装上的假字);
3. 主体被构图截断到无法辨认;
4. 明显生成伪影(重影/扭曲网格/物体融化)。
风格、审美、好不好看一律不评。输出 JSON: {"defect": boolean, "reason": string}。`;

function findImages(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(png|jpe?g|webp)$/i.test(e.name)) out.push(p);
    }
  };
  const assetsDir = path.join(dir, "assets", "generated");
  if (fs.existsSync(assetsDir)) walk(assetsDir);
  return out.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

const images = findImages(projectDir).slice(0, limit);
if (!images.length) {
  console.log("该项目没有生成图片(assets/generated 为空)。");
  process.exit(0);
}
console.log(`VLM 客观缺陷判定:${images.length} 张(上限 ${limit}),模型 ${model}`);

const results = [];
for (const file of images) {
  const b64 = fs.readFileSync(file).toString("base64");
  const mime = file.endsWith(".png") ? "image/png" : "image/jpeg";
  try {
    const res = await fetch(`${String(cfg.baseUrl).replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: DEFECT_RUBRIC },
              { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const parsed = JSON.parse(json?.choices?.[0]?.message?.content || "{}");
    if (typeof parsed.defect !== "boolean") throw new Error("VLM 输出缺 defect 字段");
    results.push({ file: path.relative(projectDir, file), defect: parsed.defect, reason: String(parsed.reason || "") });
    console.log(`  ${parsed.defect ? "⚠️ " : "✓"} ${path.basename(file)}${parsed.defect ? ` — ${parsed.reason.slice(0, 80)}` : ""}`);
  } catch (error) {
    results.push({ file: path.relative(projectDir, file), error: error instanceof Error ? error.message : String(error) });
    console.log(`  ✗ ${path.basename(file)} — ${results.at(-1).error}`);
  }
}

const outPath = path.join(projectDir, ".nomi", "vlm-review.jsonl");
fs.appendFileSync(outPath, results.map((r) => JSON.stringify({ ...r, at: new Date().toISOString(), model })).join("\n") + "\n");
const defects = results.filter((r) => r.defect).length;
console.log(`\n${defects}/${results.length} 张有客观硬伤。明细: ${outPath}`);
