import "dotenv/config";
import fs from "node:fs";
if (
  !process.env.TASKFLOW_API_KEY &&
  fs.existsSync(process.env.TASKFLOW_KEY_FILE ?? "../../.taskflow-api-key")
)
  process.env.TASKFLOW_API_KEY = fs
    .readFileSync(
      process.env.TASKFLOW_KEY_FILE ?? "../../.taskflow-api-key",
      "utf8",
    )
    .trim();
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { pool, migrate } from "./db.js";
import { EntitlementCI } from "@entitlementci/node";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
const app = Fastify({ logger: true });
await app.register(cors, { origin: true, credentials: true });
if (
  process.env.NODE_ENV === "production" ||
  process.env.SERVE_STATIC === "true"
) {
  await app.register(fastifyStatic, {
    root: path.resolve(process.cwd(), "dist-web"),
    prefix: "/",
  });
  app.setNotFoundHandler(async (req, reply) => {
    if (req.raw.url?.startsWith("/api/") || req.raw.url === "/health")
      return reply.code(404).send({ error: "not found" });
    return reply.sendFile("index.html");
  });
}
await migrate();
app.addHook("preHandler", async (req, reply) => {
  if (["POST", "PATCH", "DELETE"].includes(req.method)) {
    const origin = req.headers.origin;
    if (
      origin &&
      ![
        process.env.TASKFLOW_WEB_ORIGIN ?? "http://localhost:4101",
        process.env.TASKFLOW_URL ?? "http://localhost:4100",
      ].includes(origin)
    )
      return reply.code(403).send({ error: "origin rejected" });
  }
});
function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function passwordHash(password: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64url")}$${scryptSync(password, salt, 64).toString("base64url")}`;
}
function verifyPassword(password: string, stored: string) {
  const [scheme, salt64, hash64] = stored.split("$");
  if (scheme !== "scrypt" || !salt64 || !hash64) return false;
  const actual = scryptSync(password, Buffer.from(salt64, "base64url"), 64);
  const expected = Buffer.from(hash64, "base64url");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
async function ensureDemoUser() {
  const { rows } = await pool.query("select id from tf_users where email=$1", [
    "demo@taskflow.test",
  ]);
  if (!rows[0])
    await pool.query(
      "insert into tf_users(id,email,password_hash) values($1,$2,$3)",
      ["tf_user_demo", "demo@taskflow.test", passwordHash("DemoPassword!123")],
    );
}
await ensureDemoUser();
async function requireAuth(req: any, reply: any) {
  if (
    process.env.TASKFLOW_SERVICE_TOKEN &&
    req.headers["x-service-token"] === process.env.TASKFLOW_SERVICE_TOKEN &&
    req.url.startsWith("/api/demo/")
  ) {
    return true;
  }
  const token = req.cookies?.tf_session;
  if (!token) {
    reply.code(401).send({ error: "authentication required" });
    return false;
  }
  const { rows } = await pool.query(
    "select u.id,u.email from tf_sessions s join tf_users u on u.id=s.user_id where s.token_hash=$1 and s.expires_at>now()",
    [hash(token)],
  );
  if (!rows[0]) {
    reply.code(401).send({ error: "session expired" });
    return false;
  }
  req.taskflowUser = rows[0];
  return true;
}
function bugScenario() {
  return String(
    (globalThis as any).__bugScenario ??
      process.env.TASKFLOW_BUG_SCENARIO ??
      "none",
  );
}
function actualPlan(base: string, customerId: string) {
  const mode = bugScenario();
  if (mode === "upgrade-propagation" && customerId === "cus_demo_upgrade_bug")
    return "pro";
  if (
    mode === "downgrade-propagation" &&
    customerId === "cus_demo_downgrade_bug"
  )
    return "enterprise";
  return base;
}
function actualFeatures(plan: any, customerId: string) {
  const mode = bugScenario();
  const base = {
    analytics: { allowed: plan.analytics },
    advanced_reports: { allowed: plan.advanced_reports },
    sso: { allowed: plan.sso },
    api_requests: { allowed: true, limit: plan.api_limit },
  } as any;
  if (mode === "limit-bug" && customerId === "cus_demo_limit_bug")
    base.api_requests.limit = 50000;
  return base;
}
async function seedTask() {
  const { rows } = await pool.query(
    "select count(*)::int as count from tf_tasks",
  );
  if (rows[0].count === 0)
    await pool.query(
      "insert into tf_tasks(organization_id,customer_id,title) values($1,$2,$3),($1,$2,$4)",
      [
        "tf_org_demo",
        "cus_demo_healthy",
        "Prepare quarterly report",
        "Deploy production build",
      ],
    );
}
await seedTask();
await app.register(cookie);
app.get("/health", async () => ({ status: "ok", service: "taskflow" }));
app.post("/api/auth/login", async (req, reply) => {
  const b = req.body as { email?: string; password?: string };
  const { rows } = await pool.query(
    "select id,email,password_hash from tf_users where email=$1",
    [(b.email ?? "").toLowerCase().trim()],
  );
  if (!rows[0] || !verifyPassword(b.password ?? "", rows[0].password_hash))
    return reply.code(401).send({ error: "invalid credentials" });
  const raw = randomBytes(32).toString("base64url");
  await pool.query(
    "insert into tf_sessions(id,user_id,token_hash,expires_at) values($1,$2,$3,now()+interval '7 days')",
    [`sess_${randomBytes(10).toString("hex")}`, rows[0].id, hash(raw)],
  );
  reply.setCookie("tf_session", raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 604800,
  });
  return { user: { email: rows[0].email } };
});
app.post("/api/auth/logout", async (req, reply) => {
  const token = req.cookies?.tf_session;
  if (token)
    await pool.query("delete from tf_sessions where token_hash=$1", [
      hash(token),
    ]);
  reply.clearCookie("tf_session", { path: "/" });
  return { ok: true };
});
app.get("/api/auth/me", async (req, reply) => {
  if (!(await requireAuth(req, reply))) return;
  return { user: (req as any).taskflowUser };
});
app.get("/api/demo/state", async (req, reply) => {
  if (!(await requireAuth(req, reply))) return;
  return { bugScenario: bugScenario() };
});
app.post("/api/demo/scenario", async (req, reply) => {
  if (!(await requireAuth(req, reply))) return;
  const b = req.body as { scenario?: string };
  (globalThis as any).__bugScenario = b.scenario ?? "none";
  return { bugScenario: bugScenario() };
});
app.get("/api/demo/customers", async (req, reply) => {
  if (!(await requireAuth(req, reply))) return;
  const { rows } = await pool.query(
    "select c.external_id,c.plan_key,p.name as plan_name from tf_customers c join tf_plans p on p.key=c.plan_key order by c.external_id",
  );
  return rows;
});
app.post("/api/demo/customers/:id/subscription", async (req, reply) => {
  if (!(await requireAuth(req, reply))) return;
  const id = (req.params as { id: string }).id;
  const plan = (req.body as { plan?: string }).plan;
  if (!plan) return reply.code(400).send({ error: "plan is required" });
  await pool.query(
    "update tf_customers set plan_key=$1,updated_at=now() where external_id=$2",
    [plan, id],
  );
  return {
    customerId: id,
    commercialPlan: plan,
    actualPlan: actualPlan(plan, id),
  };
});
app.get("/api/demo/customers/:id/entitlements", async (req, reply) => {
  if (!(await requireAuth(req, reply))) return;
  const id = (req.params as { id: string }).id;
  const { rows } = await pool.query(
    "select c.plan_key,p.* from tf_customers c join tf_plans p on p.key=c.plan_key where c.external_id=$1",
    [id],
  );
  if (!rows[0]) return reply.code(404).send({ error: "customer not found" });
  const row = rows[0];
  const effective = actualPlan(row.plan_key, id);
  const { rows: planRows } = await pool.query(
    "select * from tf_plans where key=$1",
    [effective],
  );
  const plan = planRows[0];
  return {
    customerId: id,
    commercialPlan: row.plan_key,
    actualPlan: effective,
    features: actualFeatures(plan, id),
  };
});
app.get("/api/demo/customers/:id/access/:feature", async (req, reply) => {
  if (!(await requireAuth(req, reply))) return;
  const id = (req.params as { id: string }).id;
  const { rows } = await pool.query(
    "select c.plan_key from tf_customers c where c.external_id=$1",
    [id],
  );
  if (!rows[0]) return reply.code(404).send({ error: "customer not found" });
  const effective = actualPlan(rows[0].plan_key, id);
  const { rows: plans } = await pool.query(
    "select * from tf_plans where key=$1",
    [effective],
  );
  const f = actualFeatures(plans[0], id)[(req.params as any).feature];
  if (!f?.allowed)
    return reply
      .code(403)
      .send({ allowed: false, feature: (req.params as any).feature });
  return { allowed: true, feature: (req.params as any).feature };
});
app.get("/api/demo/customers/:id/limit/:feature", async (req, reply) => {
  if (!(await requireAuth(req, reply))) return;
  const id = (req.params as { id: string }).id;
  const state = await app.inject({
    method: "GET",
    url: `/api/demo/customers/${id}/entitlements`,
    headers: { cookie: req.headers.cookie ?? "" },
  });
  const body = state.json();
  const f = body.features?.[(req.params as any).feature];
  if (!f?.limit) return reply.code(404).send({ error: "limit not found" });
  return { limit: f.limit };
});
app.get("/api/demo/tasks", async (req, reply) => {
  if (!(await requireAuth(req, reply))) return;
  const { rows } = await pool.query(
    "select id,title,completed,customer_id from tf_tasks order by id desc",
  );
  return rows;
});
app.post("/api/demo/observe", async (req, reply) => {
  if (!(await requireAuth(req, reply))) return;
  const b = req.body as { customerId: string };
  const state = await (
    await fetch(
      `http://localhost:${process.env.TASKFLOW_PORT ?? 4100}/api/demo/customers/${encodeURIComponent(b.customerId)}/entitlements`,
      {
        headers: {
          cookie: req.headers.cookie ?? "",
          "x-service-token": process.env.TASKFLOW_SERVICE_TOKEN ?? "",
        },
      },
    )
  ).json();
  if (process.env.TASKFLOW_API_KEY) {
    const ent = new EntitlementCI({
      apiKey: process.env.TASKFLOW_API_KEY,
      baseUrl: process.env.PUBLIC_API_URL ?? "http://localhost:4000",
      failureMode: "fail_closed",
    });
    for (const [feature, value] of Object.entries(
      (state as any).features ?? {},
    )) {
      const v: any = value;
      await ent.recordDecision({
        customerId: b.customerId,
        feature,
        allowed: Boolean(v.allowed),
        limit: v.limit,
        plan: (state as any).commercialPlan,
      });
    }
  }
  if (!process.env.TASKFLOW_API_KEY)
    return reply.code(503).send({ error: "SDK key is not configured" });
  return { observed: true, state };
});
await app.listen({
  host: process.env.BIND_HOST ?? "0.0.0.0",
  port: Number(process.env.TASKFLOW_PORT ?? 4100),
});
process.on("SIGTERM", async () => {
  await app.close();
  await pool.end();
  process.exit(0);
});
process.on("SIGINT", async () => {
  await app.close();
  await pool.end();
  process.exit(0);
});
