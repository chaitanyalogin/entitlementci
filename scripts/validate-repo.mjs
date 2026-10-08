import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "README.md",
  ".env.example",
  "docker-compose.yml",
  "apps/api/prisma/schema.prisma",
  "apps/api/prisma/migrations/20260924_init/migration.sql",
  "apps/api/src/server.ts",
  "apps/web/src/app.tsx",
  "apps/demo-taskflow/src/server.ts",
  "packages/node-sdk/src/index.ts",
  "workers/entitlement-worker/src/worker.ts",
  "docs/security/threat-model.md",
  "docs/architecture.md",
  "docs/deployment.md",
  "docs/operations/runbook.md",
  "docs/demo.md",
];
const missing = required.filter((x) => !fs.existsSync(path.join(root, x)));
if (missing.length) {
  console.error("Missing required files:", missing.join(", "));
  process.exit(1);
}
const packageFiles = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist", "coverage"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === "package.json") packageFiles.push(p);
  }
}
walk(root);
for (const file of packageFiles) JSON.parse(fs.readFileSync(file, "utf8"));
const env = fs.readFileSync(path.join(root, ".env.example"), "utf8");
for (const key of [
  "DATABASE_URL",
  "REDIS_URL",
  "SESSION_SECRET",
  "API_KEY_PEPPER",
  "CORS_ORIGIN",
])
  if (!env.includes(`${key}=`))
    throw new Error(`Missing ${key} in .env.example`);
const source = JSON.stringify(
  packageFiles.map((f) => fs.readFileSync(f, "utf8")),
);
for (const marker of [
  "sk_live_",
  "BEGIN RSA PRIVATE KEY",
  "password=postgres",
  "TODO: implement",
  "FIXME: implement",
])
  if (source.includes(marker))
    throw new Error(`Potential secret/placeholder marker found: ${marker}`);
console.log(
  `Repository validation passed: ${packageFiles.length} package manifests parsed and required assets present.`,
);
