import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireOrgRole, assertCsrf } from "../auth/context.js";
import { enqueue } from "../jobs.js";
import { AppError, assert } from "../utils/http.js";

export async function testRoutes(app: FastifyInstance) {
  app.get("/v1/tests/scenarios", async (request) => {
    const ctx = await requireOrgRole(request, "VIEWER");
    return prisma.testScenario.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...((request.query as { projectId?: string }).projectId
          ? { projectId: (request.query as { projectId: string }).projectId }
          : {}),
      },
      orderBy: { createdAt: "asc" },
    });
  });
  app.post(
    "/v1/tests/runs",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request) => {
      const ctx = await requireOrgRole(request, "DEVELOPER");
      await assertCsrf(request);
      const b = request.body as { scenarioId?: string };
      assert(
        typeof b.scenarioId === "string",
        400,
        "SCENARIO_REQUIRED",
        "scenarioId is required.",
      );
      const scenario = await prisma.testScenario.findFirst({
        where: { id: b.scenarioId, organizationId: ctx.organizationId },
      });
      if (!scenario)
        throw new AppError(404, "SCENARIO_NOT_FOUND", "Scenario not found.");
      const run = await prisma.testRun.create({
        data: {
          organizationId: ctx.organizationId,
          projectId: scenario.projectId,
          scenarioId: scenario.id,
          status: "QUEUED",
        },
      });
      await enqueue(
        "synthetic-test",
        { testRunId: run.id },
        { jobId: `test-run-${run.id}`, attempts: 1 },
      );
      return run;
    },
  );
  app.get("/v1/tests/runs", async (request) => {
    const ctx = await requireOrgRole(request, "VIEWER");
    return prisma.testRun.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...((request.query as { projectId?: string }).projectId
          ? { projectId: (request.query as { projectId: string }).projectId }
          : {}),
      },
      include: { scenario: true, results: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });
  app.get("/v1/tests/runs/:id", async (request) => {
    const ctx = await requireOrgRole(request, "VIEWER");
    const id = (request.params as { id: string }).id;
    const run = await prisma.testRun.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: { scenario: true, results: { orderBy: { step: "asc" } } },
    });
    if (!run)
      throw new AppError(404, "TEST_RUN_NOT_FOUND", "Test run not found.");
    return run;
  });
}
