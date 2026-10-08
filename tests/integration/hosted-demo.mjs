import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";

if (process.env.ENABLE_HOSTED_WRITE_TESTS !== "true")
  throw new Error(
    "Set ENABLE_HOSTED_WRITE_TESTS=true to create isolated sample workspaces.",
  );
const base = new URL(process.env.TEST_API_URL ?? "http://127.0.0.1:4001")
  .origin;
const results = [];
const clients = [];
async function check(name, fn) {
  await fn();
  results.push({ name, status: "PASS" });
  console.log("PASS " + name);
}
async function request(path, method = "GET", body, headers = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  return { res, data: await res.json().catch(() => null) };
}
function session(result) {
  const cookies = result.res.headers.getSetCookie();
  assert.ok(
    cookies.some(
      (c) => c.startsWith("entitlementci_session=") && /HttpOnly/i.test(c),
    ),
  );
  if (new URL(base).protocol === "https:")
    assert.ok(cookies.every((c) => /;\s*Secure/i.test(c)));
  const cookie = cookies.map((c) => c.split(";")[0]).join("; ");
  const csrf = cookies
    .find((c) => c.startsWith("entitlementci_csrf="))
    ?.split(";")[0]
    .split("=")[1];
  const client = {
    request: (path, method, body, extra = {}) =>
      request(path, method, body, { cookie, "x-csrf-token": csrf, ...extra }),
    organizationId: result.data.organization.id,
  };
  clients.push(client);
  return client;
}
async function guest() {
  const r = await request("/v1/auth/demo", "POST", {});
  assert.equal(r.res.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.expiresIn, 3600);
  assert.equal(r.data.password, undefined);
  return session(r);
}
async function poll(fn) {
  for (let i = 0; i < 120; i++) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Worker did not finish within 30 seconds");
}
async function run(client, scenario, extra = {}) {
  const r = await client.request("/v1/demo/run", "POST", {
    scenario,
    ...extra,
  });
  assert.equal(r.res.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.accepted, true);
  return r.data;
}
let a, b, status, incident;
try {
  await check(
    "Hosted mode ready, authenticated controls, and origin protection",
    async () => {
      assert.equal((await request("/ready")).res.status, 200);
      assert.equal((await request("/v1/demo/config")).data.hosted, true);
      assert.equal(
        (await request("/v1/demo/run", "POST", { scenario: "fix" })).res.status,
        401,
      );
      assert.equal(
        (
          await request(
            "/v1/auth/demo",
            "POST",
            {},
            { origin: "https://unrelated.invalid" },
          )
        ).res.status,
        403,
      );
    },
  );
  await check(
    "Visitor gets a private workspace without a shared password",
    async () => {
      a = await guest();
      status = (await a.request("/v1/demo/status")).data;
      assert.equal(status.mode, "hosted");
      assert.equal(status.ready, true);
      const projects = (await a.request("/v1/projects")).data;
      assert.equal(projects.length, 1);
      assert.equal(projects[0].environment, "STAGING");
      assert.equal(
        (await a.request(`/v1/customers?projectId=${status.projectId}`)).data
          .length,
        4,
      );
    },
  );
  await check(
    "Repeated setup is idempotent and invalid CSRF is rejected",
    async () => {
      const first = await a.request("/v1/demo/setup", "POST", {});
      const second = await a.request("/v1/demo/setup", "POST", {});
      assert.equal(first.data.projectId, status.projectId);
      assert.equal(second.data.projectId, status.projectId);
      assert.equal((await a.request("/v1/projects")).data.length, 1);
      assert.equal(
        (
          await a.request(
            "/v1/demo/run",
            "POST",
            { scenario: "fix" },
            { "x-csrf-token": "invalid" },
          )
        ).res.status,
        403,
      );
    },
  );
  await check("Healthy sample observations create no violations", async () => {
    const result = await run(a, "healthy");
    assert.equal(result.observationIds.length, 4);
    const customer = (
      await a.request(`/v1/customers?projectId=${status.projectId}`)
    ).data.find((c) => c.externalCustomerId === "sample_healthy");
    await poll(async () => {
      const data = (await a.request(`/v1/customers/${customer.id}`)).data;
      return (
        data.observedDecisions?.length >= 4 &&
        data.observedDecisions.every((o) => o.processedAt)
      );
    });
    assert.equal(
      (await a.request(`/v1/violations?projectId=${status.projectId}`)).data
        .length,
      0,
    );
  });
  await check("Live SDK and worker detect the upgrade bug", async () => {
    await run(a, "upgrade-propagation");
    const violations = await poll(async () => {
      const v = (
        await a.request(`/v1/violations?projectId=${status.projectId}`)
      ).data;
      return v.filter((x) => x.status === "OPEN").length === 3 && v;
    });
    incident = violations.find((v) => v.featureKey.endsWith("_sso"));
    assert.equal(incident.expectedValue, true);
    assert.equal(incident.observedValue, false);
    assert.equal(incident.source, "SDK");
  });
  await check("Repeated bug reports group into the same incident", async () => {
    await run(a, "upgrade-propagation");
    await poll(
      async () =>
        (await a.request(`/v1/violations/${incident.id}`)).data
          .occurrenceCount >= 2,
    );
    assert.equal(
      (await a.request(`/v1/violations?projectId=${status.projectId}`)).data
        .length,
      3,
    );
  });
  let failedRun;
  await check("Regression fails on actual broken sample state", async () => {
    const queued = await a.request("/v1/tests/runs", "POST", {
      scenarioId: status.scenarioId,
    });
    assert.equal(queued.res.status, 200);
    failedRun = await poll(async () => {
      const t = (await a.request(`/v1/tests/runs/${queued.data.id}`)).data;
      return t.status === "FAILED" && t;
    });
    assert.equal(failedRun.results.length, 16);
    assert.equal(
      failedRun.results.filter((r) => r.status === "FAIL").length,
      3,
    );
  });
  await check(
    "Visitors cannot read each other's incidents or test results",
    async () => {
      b = await guest();
      assert.notEqual(b.organizationId, a.organizationId);
      assert.equal(
        (await b.request(`/v1/violations/${incident.id}`)).res.status,
        404,
      );
      assert.equal(
        (await b.request(`/v1/tests/runs/${failedRun.id}`)).res.status,
        404,
      );
      assert.equal(
        (await b.request(`/v1/violations?projectId=${status.projectId}`)).data
          .length,
        0,
      );
    },
  );
  await check(
    "Downgrade and numeric limit bugs are also detected",
    async () => {
      await run(a, "downgrade-propagation");
      await run(a, "limit-bug");
      await poll(
        async () =>
          (
            await a.request(`/v1/violations?projectId=${status.projectId}`)
          ).data.filter((v) => v.status === "OPEN").length === 7,
      );
    },
  );
  await check(
    "Fix resolves all incidents and passes sixteen regression checks",
    async () => {
      const result = await run(a, "fix", {
        projectId: (await b.request("/v1/demo/status")).data.projectId,
      });
      assert.equal(result.projectId, status.projectId);
      assert.equal(result.observationIds.length, 16);
      const passed = await poll(async () => {
        const t = (await a.request(`/v1/tests/runs/${result.testRunId}`)).data;
        return t.status === "PASSED" && t;
      });
      assert.equal(passed.results.length, 16);
      assert.ok(passed.results.every((r) => r.status === "PASS"));
      await poll(async () =>
        (
          await a.request(`/v1/violations?projectId=${status.projectId}`)
        ).data.every((v) => v.status === "RESOLVED"),
      );
    },
  );
  await check(
    "Existing organization can create sandbox without changing its real project",
    async () => {
      const r = await request("/v1/auth/register", "POST", {
        email: `sandbox-check-${randomUUID()}@verification.entitlementci.test`,
        password: randomUUID() + randomUUID(),
        organizationName: "Sandbox isolation fixture",
      });
      assert.equal(r.res.status, 201);
      const owner = session(r);
      const project = (
        await owner.request("/v1/projects", "POST", {
          name: "Real project fixture",
          environment: "PRODUCTION",
        })
      ).data;
      await owner.request("/v1/features", "POST", {
        key: "sso",
        name: "Real SSO",
        type: "BOOLEAN",
      });
      await owner.request("/v1/plans", "POST", {
        key: "enterprise",
        name: "Real Enterprise",
        entitlements: { sso: true },
      });
      const customer = (
        await owner.request("/v1/customers", "POST", {
          projectId: project.id,
          customerId: "real_fixture",
          plan: "enterprise",
        })
      ).data;
      const before = (await owner.request(`/v1/customers/${customer.id}`)).data;
      assert.equal(
        (await owner.request("/v1/demo/setup", "POST", {})).res.status,
        200,
      );
      assert.equal(
        (await owner.request(`/v1/customers/${customer.id}`)).data
          .expectedEntitlements[0].value,
        before.expectedEntitlements[0].value,
      );
      assert.equal(
        (await owner.request(`/v1/customers?projectId=${project.id}`)).data
          .length,
        1,
      );
      assert.equal(
        (await owner.request(`/v1/violations?projectId=${project.id}`)).data
          .length,
        0,
      );
    },
  );
  await check("Signing out invalidates the visitor session", async () => {
    for (const c of clients) {
      assert.equal(
        (await c.request("/v1/auth/logout", "POST", {})).res.status,
        204,
      );
      assert.equal((await c.request("/v1/auth/me")).res.status, 401);
    }
  });
  await fs.mkdir("docs/evidence", { recursive: true });
  const reportPath =
    process.env.HOSTED_REPORT_PATH ?? "docs/evidence/hosted-demo-smoke.json";
  await fs.writeFile(
    reportPath,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        base,
        conclusion: "PASS",
        checks: results,
        fixtureOrganizations: clients.map((c) => c.organizationId),
        fixturePolicy:
          "Isolated synthetic organizations contain only sample data; test sessions ended. No passwords, session tokens, or SDK secrets recorded.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Hosted demo verification passed: ${results.length} checks`);
} catch (error) {
  console.error(
    `Hosted demo verification failed after ${results.length} checks: ${error.message}`,
  );
  process.exitCode = 1;
}
