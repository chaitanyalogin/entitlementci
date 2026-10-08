import { spawnSync } from "node:child_process";
const r = spawnSync(
  process.execPath,
  [
    "../../node_modules/vite/bin/vite.js",
    "build",
    "--outDir",
    "../../review-dist",
    "--emptyOutDir",
  ],
  {
    cwd: "apps/web",
    env: { ...process.env, VITE_REVIEW_MODE: "true" },
    stdio: "inherit",
  },
);
process.exit(r.status ?? 1);
