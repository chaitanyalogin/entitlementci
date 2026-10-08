import { Queue } from "bullmq";
import { Redis } from "ioredis";

export const connection = new Redis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  { maxRetriesPerRequest: null },
);
export const entitlementQueue = new Queue("entitlementci", { connection });

export async function enqueue(
  name: string,
  data: unknown,
  opts?: { jobId?: string; attempts?: number },
) {
  return entitlementQueue.add(name, data, {
    jobId: opts?.jobId,
    attempts: opts?.attempts ?? 4,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 500 },
  });
}
