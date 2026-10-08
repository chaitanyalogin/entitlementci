import { spawnSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
const root = process.cwd();
const command = process.argv[2];
const map = {
  generate: [root + "/node_modules/prisma/build/index.js", "generate"],
  deploy: [root + "/node_modules/prisma/build/index.js", "migrate", "deploy"],
  migrate: [root + "/node_modules/prisma/build/index.js", "migrate", "dev"],
  seed: ["--import", "tsx", "prisma/seed.ts"],
};
if (!map[command]) throw new Error("Unknown database operation");
const r = spawnSync(process.execPath, map[command], {
  cwd: path.join(root, "apps/api"),
  env: process.env,
  stdio: "inherit",
});
process.exit(r.status ?? 1);
