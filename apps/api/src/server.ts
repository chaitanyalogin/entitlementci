import "dotenv/config";
import { buildApp } from "./app.js";
import { loadConfig } from "@entitlementci/config";
loadConfig();
import { closeDatabase } from "./db.js";
import { connection, entitlementQueue } from "./jobs.js";

const app = await buildApp();
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
await app.listen({ port, host: process.env.BIND_HOST ?? "0.0.0.0" });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await entitlementQueue.close();
  await connection.quit();
  await closeDatabase();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
