import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!existsSync(".env")) {
  let text = readFileSync(".env.example", "utf8");
  text = text
    .replace(
      "SESSION_SECRET=replace-with-at-least-32-random-bytes",
      `SESSION_SECRET=${randomBytes(32).toString("hex")}`,
    )
    .replace(
      "API_KEY_PEPPER=replace-with-at-least-32-random-bytes",
      `API_KEY_PEPPER=${randomBytes(32).toString("hex")}`,
    );
  text +=
    "\nENABLE_DEMO=true\nTASKFLOW_SERVICE_TOKEN=" +
    randomBytes(32).toString("hex") +
    "\nDEMO_STRIPE_WEBHOOK_SECRET=whsec_" +
    randomBytes(24).toString("hex") +
    "\n";
  writeFileSync(".env", text, { mode: 0o600 });
  console.log("Development configuration created.");
} else console.log("Existing configuration preserved.");
