import "dotenv/config";
import { Worker, Queue } from "bullmq";
import { Redis } from "ioredis";
import { createServer } from "node:http";
import { prisma } from "./db.js";
import { compareObservation, processWebhook } from "@entitlementci/engine";
import { runSynthetic } from "./synthetic.js";
const connection = new Redis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  { maxRetriesPerRequest: null },
);
const queue = new Queue("entitlementci", { connection });
const worker = new Worker(
  "entitlementci",
  async (job) => {
    switch (job.name) {
      case "compare-observation":
        return compareObservation(prisma, job.data.observationId);
      case "stripe-webhook":
        return processWebhook(prisma, job.data.webhookEventId);
      case "synthetic-test":
        return runSynthetic(prisma, job.data.testRunId);
      case "notification":
        return prisma.notification.update({
          where: { id: job.data.notificationId },
          data: { status: "SENT", sentAt: new Date() },
        });
      default:
        throw new Error(`Unknown job ${job.name}`);
    }
  },
  { connection, concurrency: Number(process.env.WORKER_CONCURRENCY ?? 5) },
);
let recovering = false;
async function recoverInbox() {
  if (recovering) return;
  recovering = true;
  try {
    const before = new Date(Date.now() - 10000);
    const observations = await prisma.observedDecision.findMany({
      where: { processedAt: null, receivedAt: { lt: before } },
      take: 100,
    });
    for (const o of observations)
      await queue.add(
        "compare-observation",
        { observationId: o.id },
        {
          jobId: `observation-${o.id}`,
          attempts: 4,
          backoff: { type: "exponential", delay: 1000 },
          removeOnComplete: 500,
          removeOnFail: 500,
        },
      );
    const events = await prisma.webhookEvent.findMany({
      where: { status: "RECEIVED", receivedAt: { lt: before } },
      take: 100,
    });
    for (const e of events)
      await queue.add(
        "stripe-webhook",
        { webhookEventId: e.id },
        {
          jobId: `stripe-${e.providerEventId}`,
          attempts: 4,
          backoff: { type: "exponential", delay: 1000 },
          removeOnComplete: 500,
          removeOnFail: 500,
        },
      );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "inbox.recovery_failed",
        message: error instanceof Error ? error.message : "failed",
      }),
    );
  } finally {
    recovering = false;
  }
}
const recovery = setInterval(() => void recoverInbox(), 5000);
worker.on("completed", (job) =>
  console.log(
    JSON.stringify({ event: "job.completed", id: job.id, name: job.name }),
  ),
);
worker.on("failed", (job, error) =>
  console.error(
    JSON.stringify({
      event: "job.failed",
      id: job?.id,
      name: job?.name,
      message: error.message,
    }),
  ),
);
const health = createServer(async (req, res) => {
  if (req.url !== "/health" && req.url !== "/ready") {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    if (req.url === "/ready") {
      await prisma.$queryRaw`SELECT 1`;
      await connection.ping();
      if (!worker.isRunning()) throw new Error("worker stopped");
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "worker" }));
  } catch {
    res.writeHead(503);
    res.end(JSON.stringify({ status: "not_ready" }));
  }
});
health.listen(Number(process.env.WORKER_HEALTH_PORT ?? 4200), "0.0.0.0");
async function close() {
  clearInterval(recovery);
  health.close();
  await worker.close();
  await queue.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void close());
process.on("SIGINT", () => void close());
