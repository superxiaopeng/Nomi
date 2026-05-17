import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function writeFileIfMissing(relativePath, content) {
  const filePath = path.join(repoRoot, relativePath);
  if (fs.existsSync(filePath)) {
    console.log(`[setup] keep existing ${relativePath}`);
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content.trimStart(), "utf8");
  console.log(`[setup] created ${relativePath}`);
}

writeFileIfMissing(
  "apps/hono-api/.env",
  `
DATABASE_URL=postgresql://tapcanvas:tapcanvas@localhost:5432/tapcanvas?schema=public
JWT_SECRET=nomi-local-dev-secret
REDIS_URL=redis://localhost:6379
TAPCANVAS_DEV_PUBLIC_BYPASS=true
TAPCANVAS_DEV_PUBLIC_BYPASS_USER_ID=local-dev-user
TAPCANVAS_DEV_PUBLIC_BYPASS_ROLE=admin
`,
);

writeFileIfMissing(
  "apps/agents-cli/agents.config.json",
  `
{
  "maxTurns": 12000,
  "apiBaseUrl": "https://api.deepseek.com/v1",
  "apiKey": "replace-with-your-api-key",
  "maxSubagentDepth": 50,
  "stream": true,
  "model": "deepseek-chat",
  "agentIntro": "你是 Nomi 的 AI 创作助手，帮助用户完成剧本、提示词和生成画布规划。"
}
`,
);

console.log("");
console.log("[setup] local files are ready.");
console.log("[setup] If you want AI chat/Agent features, edit apps/agents-cli/agents.config.json and fill apiKey.");
