import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
const p = new PrismaClient();
const cutoff = (days) =>
  new Date(Date.now() - Math.max(1, Number(days)) * 86400000);
try {
  const observations = await p.observedDecision.deleteMany({
    where: {
      processedAt: { not: null },
      observedAt: { lt: cutoff(process.env.OBSERVATION_RETENTION_DAYS ?? 30) },
    },
  });
  const webhooks = await p.webhookEvent.deleteMany({
    where: {
      status: { in: ["PROCESSED", "IGNORED"] },
      receivedAt: { lt: cutoff(process.env.WEBHOOK_RETENTION_DAYS ?? 30) },
    },
  });
  const sessions = await p.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  console.log(
    JSON.stringify({
      observations: observations.count,
      webhooks: webhooks.count,
      sessions: sessions.count,
    }),
  );
} finally {
  await p.$disconnect();
}
