import { spawn } from "node:child_process";
import path from "node:path";
process.loadEnvFile(".env");
const root = process.cwd();
const children = [];
function start(label, args, cwd) {
  const p = spawn(process.execPath, args, {
    cwd: path.join(root, cwd),
    env: process.env,
    stdio: "inherit",
  });
  children.push(p);
  p.on("exit", (code) => {
    if (code) console.error(label + " exited " + code);
  });
}
start("API", ["--watch", "--import", "tsx", "src/server.ts"], "apps/api");
start(
  "Worker",
  ["--watch", "--import", "tsx", "src/worker.ts"],
  "workers/entitlement-worker",
);
start(
  "TaskFlow",
  ["--watch", "--import", "tsx", "src/server.ts"],
  "apps/demo-taskflow",
);
start(
  "Dashboard",
  [root + "/node_modules/vite/bin/vite.js", "--host", "127.0.0.1"],
  "apps/web",
);
start(
  "TaskFlow web",
  [
    root + "/node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "4101",
  ],
  "apps/demo-taskflow",
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    for (const p of children) p.kill(signal);
  });
