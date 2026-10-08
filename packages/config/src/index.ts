import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z.string().default("info"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  PUBLIC_WEB_URL: z.string().url().default("http://localhost:5173"),
  PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
  TASKFLOW_URL: z.string().url().default("http://localhost:4100"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_COOKIE_NAME: z.string().default("entitlementci_session"),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  SESSION_SECRET: z.string().min(32),
  API_KEY_PEPPER: z.string().min(32),
  CORS_ORIGIN: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid configuration: ${details}`);
  }
  return parsed.data;
}
