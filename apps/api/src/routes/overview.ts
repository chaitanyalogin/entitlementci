import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireOrgRole } from "../auth/context.js";

export async function overviewRoutes(app: FastifyInstance) {
  app.get("/v1/overview", async (request) => {
    const ctx = await requireOrgRole(request, "VIEWER");
    const projectId = (request.query as { projectId?: string }).projectId;
    const scope = {
      organizationId: ctx.organizationId,
      ...(projectId ? { projectId } : {}),
    };
    const [
      customers,
      openViolations,
      critical,
      recentViolations,
      recentRuns,
      integrations,
      changes,
    ] = await Promise.all([
      prisma.customer.count({ where: { ...scope } }),
      prisma.violation.count({
        where: { ...scope, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
      }),
      prisma.violation.count({
        where: {
          ...scope,
          severity: "CRITICAL",
          status: { in: ["OPEN", "ACKNOWLEDGED"] },
        },
      }),
      prisma.violation.findMany({
        where: { ...scope },
        include: { customer: true, feature: true, project: true },
        orderBy: { lastDetectedAt: "desc" },
        take: 10,
      }),
      prisma.testRun.findMany({
        where: { ...scope },
        include: { scenario: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.integration.findMany({
        where: { ...scope },
        select: {
          id: true,
          provider: true,
          status: true,
          environment: true,
          accountIdentifier: true,
          lastWebhookAt: true,
          webhookFailures: true,
          lastSyncAt: true,
        },
      }),
      prisma.customerSubscription.findMany({
        where: { customer: { ...scope } },
        include: { customer: true, plan: true },
        orderBy: { effectiveAt: "desc" },
        take: 10,
      }),
    ]);
    return {
      customersMonitored: customers,
      openViolations,
      criticalViolations: critical,
      recentViolations,
      recentTestRuns: recentRuns,
      connectedBillingProviders: integrations,
      recentEntitlementChanges: changes,
    };
  });
}
