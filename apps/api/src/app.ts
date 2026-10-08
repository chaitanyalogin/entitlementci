import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import rawBody from "fastify-raw-body";
import { demoRoutes } from "./routes/demo.js";
import { authRoutes } from "./routes/auth.js";
import { organizationRoutes } from "./routes/organizations.js";
import { projectRoutes } from "./routes/projects.js";
import { apiKeyRoutes } from "./routes/api-keys.js";
import { decisionRoutes } from "./routes/decisions.js";
import { customerRoutes } from "./routes/customers.js";
import { violationRoutes } from "./routes/violations.js";
import { overviewRoutes } from "./routes/overview.js";
import { catalogRoutes } from "./routes/catalog.js";
import { auditRoutes } from "./routes/audit.js";
import { integrationRoutes } from "./routes/integrations.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { testRoutes } from "./routes/tests.js";
import { AppError, errorBody } from "./utils/http.js";
import { prisma } from "./db.js";
import { connection } from "./jobs.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.body.password",
        "req.body.secretKey",
        "req.body.webhookSecret",
      ],
    },
    requestIdHeader: "x-request-id",
  });
  await app.register(cookie);
  await app.register(cors, {
    origin: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(","),
    credentials: true,
  });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(rawBody, {
    field: "rawBody",
    global: false,
    encoding: "utf8",
    runFirst: true,
    routes: ["/v1/webhooks/stripe/:projectId"],
  });
  if ((process.env.NODE_ENV ?? "development") !== "production") {
    await app.register(swagger, {
      openapi: {
        info: { title: "EntitlementCI API", version: "1.0.0" },
        servers: [{ url: `http://localhost:${process.env.API_PORT ?? 4000}` }],
      },
    });
    await app.register(swaggerUi, { routePrefix: "/docs" });
  }
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError)
      return reply.code(error.statusCode).send(errorBody(error, request));
    if ((error as any).statusCode === 429)
      return reply.code(429).send({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests",
          requestId: request.id,
        },
      });
    if ((error as any).name === "ZodError")
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed.",
          requestId: request.id,
          details: (error as any).issues,
        },
      });
    if ((error as any).code === "P2002")
      return reply
        .code(409)
        .send({
          error: {
            code: "ALREADY_EXISTS",
            message: "This record already exists",
            requestId: request.id,
          },
        });
    request.log.error({ err: error }, "request failed");
    return reply.code(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal error occurred.",
        requestId: request.id,
      },
    });
  });
  app.get("/health", async () => ({ status: "ok", service: "api" }));
  app.get("/ready", async () => {
    await prisma.$queryRaw`SELECT 1`;
    await connection.ping();
    return { status: "ready", database: "ok", redis: "ok" };
  });
  await demoRoutes(app);
  await authRoutes(app);
  await organizationRoutes(app);
  await projectRoutes(app);
  await apiKeyRoutes(app);
  await decisionRoutes(app);
  await customerRoutes(app);
  await violationRoutes(app);
  await overviewRoutes(app);
  await catalogRoutes(app);
  await auditRoutes(app);
  await integrationRoutes(app);
  await webhookRoutes(app);
  await testRoutes(app);
  return app;
}
