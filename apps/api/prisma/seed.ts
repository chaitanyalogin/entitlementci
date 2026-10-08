import "dotenv/config";
import {
  PrismaClient,
  EntitlementType,
  Environment,
  Role,
} from "@prisma/client";
import { hashPassword, sha256 } from "../src/utils/crypto.js";
import { encryptSecret } from "../src/utils/crypto.js";
import { createApiKey } from "../src/utils/api-key.js";
import fs from "node:fs/promises";
import path from "node:path";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Demo seed is disabled in production");
  const passwordHash = await hashPassword("DemoPassword!123");
  const owner = await prisma.user.upsert({
    where: { email: "owner@demo.entitlementci.test" },
    update: { passwordHash },
    create: { email: "owner@demo.entitlementci.test", passwordHash },
  });
  const developer = await prisma.user.upsert({
    where: { email: "developer@demo.entitlementci.test" },
    update: { passwordHash },
    create: { email: "developer@demo.entitlementci.test", passwordHash },
  });

  const organization = await prisma.organization.upsert({
    where: { slug: "demo-acme" },
    update: {},
    create: { name: "Demo Acme", slug: "demo-acme" },
  });
  await prisma.membership.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: owner.id,
      },
    },
    update: { role: Role.OWNER },
    create: {
      organizationId: organization.id,
      userId: owner.id,
      role: Role.OWNER,
    },
  });
  await prisma.membership.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: developer.id,
      },
    },
    update: { role: Role.DEVELOPER },
    create: {
      organizationId: organization.id,
      userId: developer.id,
      role: Role.DEVELOPER,
    },
  });

  const project = await prisma.project.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: "TaskFlow Production",
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: "TaskFlow Production",
      environment: Environment.PRODUCTION,
    },
  });
  const existingSdkKey = await prisma.apiKey.findFirst({
    where: { projectId: project.id, label: "TaskFlow SDK Demo" },
  });
  let taskflowApiKey = process.env.TASKFLOW_API_KEY ?? "";
  if (
    !existingSdkKey ||
    !(await fs
      .access(
        process.env.TASKFLOW_KEY_FILE ??
          path.resolve(process.cwd(), "../../.taskflow-api-key"),
      )
      .then(() => true)
      .catch(() => false))
  ) {
    const generated = createApiKey("PRODUCTION");
    taskflowApiKey = generated.secret;
    await prisma.apiKey.create({
      data: {
        organizationId: organization.id,
        projectId: project.id,
        label: "TaskFlow SDK Demo",
        prefix: generated.secret.slice(0, 20),
        secretHash: sha256(
          `${process.env.API_KEY_PEPPER ?? "development-only"}:${generated.secret}`,
        ),
        fingerprint: sha256(generated.secret).slice(0, 16),
        environment: "PRODUCTION",
      },
    });
    await fs.writeFile(
      process.env.TASKFLOW_KEY_FILE ??
        path.resolve(process.cwd(), "../../.taskflow-api-key"),
      generated.secret,
      { mode: 0o600 },
    );
  }

  const definitions = [
    ["analytics", "Analytics", EntitlementType.BOOLEAN],
    ["advanced_reports", "Advanced Reports", EntitlementType.BOOLEAN],
    ["sso", "SSO", EntitlementType.BOOLEAN],
    ["api_requests", "API Requests", EntitlementType.LIMIT],
  ] as const;
  const features: Record<string, { id: string }> = {};
  for (const [key, name, type] of definitions) {
    features[key] = await prisma.feature.upsert({
      where: { organizationId_key: { organizationId: organization.id, key } },
      update: { name, type },
      create: { organizationId: organization.id, key, name, type },
    });
  }

  const plans = {
    free: {
      name: "Free",
      values: {
        analytics: false,
        advanced_reports: false,
        sso: false,
        api_requests: 1000,
      },
    },
    pro: {
      name: "Pro",
      values: {
        analytics: true,
        advanced_reports: false,
        sso: false,
        api_requests: 50000,
      },
    },
    enterprise: {
      name: "Enterprise",
      values: {
        analytics: true,
        advanced_reports: true,
        sso: true,
        api_requests: 500000,
      },
    },
  } as const;
  const planRecords: Record<string, { id: string }> = {};
  for (const [key, p] of Object.entries(plans)) {
    const record = await prisma.plan.upsert({
      where: { organizationId_key: { organizationId: organization.id, key } },
      update: { name: p.name },
      create: { organizationId: organization.id, key, name: p.name },
    });
    planRecords[key] = record;
    for (const [featureKey, value] of Object.entries(p.values)) {
      await prisma.planEntitlement.upsert({
        where: {
          planId_featureId: {
            planId: record.id,
            featureId: features[featureKey]!.id,
          },
        },
        update: { value },
        create: {
          planId: record.id,
          featureId: features[featureKey]!.id,
          value,
        },
      });
    }
  }

  const customers = [
    { id: "cus_demo_healthy", plan: "pro" },
    { id: "cus_demo_upgrade_bug", plan: "enterprise" },
    { id: "cus_demo_downgrade_bug", plan: "pro" },
    { id: "cus_demo_limit_bug", plan: "enterprise" },
  ];
  for (const c of customers) {
    const customer = await prisma.customer.upsert({
      where: {
        projectId_externalCustomerId: {
          projectId: project.id,
          externalCustomerId: c.id,
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        projectId: project.id,
        externalCustomerId: c.id,
      },
    });
    const plan = planRecords[c.plan]!;
    await prisma.customerSubscription.upsert({
      where: { customerId: customer.id },
      update: { planId: plan.id, status: "active", effectiveAt: new Date() },
      create: {
        customerId: customer.id,
        planId: plan.id,
        status: "active",
        effectiveAt: new Date(),
        provider: "manual",
      },
    });
    for (const [featureKey, value] of Object.entries(
      plans[c.plan as keyof typeof plans].values,
    )) {
      await prisma.expectedEntitlement.upsert({
        where: {
          customerId_featureId: {
            customerId: customer.id,
            featureId: features[featureKey]!.id,
          },
        },
        update: { value, planId: plan.id, source: "seed" },
        create: {
          customerId: customer.id,
          featureId: features[featureKey]!.id,
          planId: plan.id,
          value,
          source: "seed",
        },
      });
    }
  }

  await prisma.integration.upsert({
    where: {
      organizationId_provider_environment: {
        organizationId: organization.id,
        provider: "STRIPE",
        environment: "PRODUCTION",
      },
    },
    update: {
      secretCiphertext: encryptSecret(
        process.env.SESSION_SECRET!,
        JSON.stringify({
          webhookSecret: process.env.DEMO_STRIPE_WEBHOOK_SECRET,
          projectId: project.id,
        }),
      ),
      status: "CONNECTED",
    },
    create: {
      organizationId: organization.id,
      provider: "STRIPE",
      environment: "PRODUCTION",
      status: "CONNECTED",
      accountIdentifier: "local-signed-fixture",
      secretCiphertext: encryptSecret(
        process.env.SESSION_SECRET!,
        JSON.stringify({
          webhookSecret: process.env.DEMO_STRIPE_WEBHOOK_SECRET,
          projectId: project.id,
        }),
      ),
    },
  });
  const scenarios = [
    {
      key: "pro-to-enterprise",
      name: "Pro → Enterprise upgrade",
      definition: {
        steps: [
          { action: "setSubscription", plan: "enterprise" },
          { action: "observe", feature: "analytics", allowed: true },
          { action: "observe", feature: "advanced_reports", allowed: true },
          { action: "observe", feature: "sso", allowed: true },
          {
            action: "observe",
            feature: "api_requests",
            allowed: true,
            limit: 500000,
          },
        ],
      },
    },
    {
      key: "enterprise-to-pro",
      name: "Enterprise → Pro downgrade",
      definition: {
        steps: [
          { action: "setSubscription", plan: "pro" },
          { action: "observe", feature: "sso", allowed: false },
        ],
      },
    },
    {
      key: "duplicate-webhook",
      name: "Duplicate webhook",
      definition: {
        steps: [
          {
            action: "sendDuplicateWebhook",
            eventType: "customer.subscription.updated",
          },
        ],
      },
    },
    {
      key: "out-of-order-webhook",
      name: "Out-of-order webhook",
      definition: { steps: [{ action: "sendOutOfOrderWebhooks" }] },
    },
  ];
  for (const scenario of scenarios) {
    await prisma.testScenario.upsert({
      where: { projectId_key: { projectId: project.id, key: scenario.key } },
      update: { definition: scenario.definition },
      create: {
        organizationId: organization.id,
        projectId: project.id,
        key: scenario.key,
        name: scenario.name,
        definition: scenario.definition,
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        organization: organization.slug,
        project: project.name,
        demoUsers: [owner.email, developer.email],
        taskflowBase: "http://localhost:4100",
        sdkKeyCreated: Boolean(taskflowApiKey),
      },
      null,
      2,
    ),
  );
}

main().finally(() => prisma.$disconnect());
