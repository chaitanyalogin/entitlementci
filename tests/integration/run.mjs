import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
const base = process.env.TEST_API_URL ?? "http://127.0.0.1:4000";
const results = [];
async function check(name, fn) {
  await fn();
  results.push({ name, status: "PASS" });
  console.log("PASS " + name);
}
async function client(
  email = "owner@demo.entitlementci.test",
  password = "DemoPassword!123",
  register = false,
) {
  let cookie = "",
    csrf = "";
  const request = async (path, method = "GET", body, extra = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        "content-type": "application/json",
        cookie,
        "x-csrf-token": csrf,
        ...extra,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json().catch(() => null);
    return { res, data };
  };
  const login = await request(
    register ? "/v1/auth/register" : "/v1/auth/login",
    "POST",
    { email, password, organizationName: "Isolation Test" },
  );
  assert.equal(
    login.res.status,
    register ? 201 : 200,
    JSON.stringify(login.data),
  );
  const cookies = login.res.headers.getSetCookie();
  cookie = cookies.map((c) => c.split(";")[0]).join("; ");
  csrf =
    cookies
      .find((c) => c.startsWith("entitlementci_csrf="))
      ?.split(";")[0]
      .split("=")[1] ?? "";
  return request;
}
async function poll(fn, limit = 150) {
  for (let i = 0; i < limit; i++) {
    const x = await fn();
    if (x) return x;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Timed out waiting for background work");
}
const owner = await client();
const dev = await client("developer@demo.entitlementci.test");
const outsider = await client(
  `tenant-${randomUUID()}@test.local`,
  "IsolationPassword!123",
  true,
);
const projects = (await owner("/v1/projects")).data;
const project = projects[0];
await check("Cross tenant read returns 404", async () => {
  assert.equal(
    (
      await outsider(
        `/v1/customers/${(await owner("/v1/customers")).data[0].id}`,
      )
    ).res.status,
    404,
  );
});
await check("Cross tenant API key creation denied", async () => {
  assert.equal(
    (
      await outsider("/v1/api-keys", "POST", {
        projectId: project.id,
        label: "bad",
        environment: project.environment,
      })
    ).res.status,
    404,
  );
});
await check("Developer cannot create projects", async () => {
  assert.equal(
    (
      await dev("/v1/projects", "POST", {
        name: "denied",
        environment: "STAGING",
      })
    ).res.status,
    403,
  );
});
await check("CSRF mismatch denied", async () => {
  assert.equal(
    (
      await owner(
        "/v1/projects",
        "POST",
        { name: "denied", environment: "STAGING" },
        { "x-csrf-token": "invalid" },
      )
    ).res.status,
    403,
  );
});
await check("Malformed SDK key denied", async () => {
  assert.equal(
    (
      await owner(
        "/v1/decisions",
        "POST",
        { customerId: "x", feature: "sso", allowed: true },
        { authorization: "Bearer invalid" },
      )
    ).res.status,
    401,
  );
});
let key;
await check("API key creation returns secret once", async () => {
  const r = await owner("/v1/api-keys", "POST", {
    projectId: project.id,
    label: "Integration test",
    environment: project.environment,
  });
  assert.equal(r.res.status, 201);
  key = r.data;
  assert.ok(key.secret);
  assert.ok(
    !(await owner("/v1/api-keys")).data.some((k) => k.secret || k.secretHash),
  );
});
await check("SDK event reaches queue", async () => {
  const r = await owner(
    "/v1/decisions",
    "POST",
    { customerId: "cus_demo_healthy", feature: "sso", allowed: false },
    { authorization: `Bearer ${key.secret}` },
  );
  assert.equal(r.res.status, 200);
  assert.equal(r.data.accepted, true);
});
await check("Revoked key cannot ingest", async () => {
  await owner(`/v1/api-keys/${key.id}/revoke`, "POST", {});
  assert.equal(
    (
      await owner(
        "/v1/decisions",
        "POST",
        { customerId: "cus_demo_healthy", feature: "sso", allowed: true },
        { authorization: `Bearer ${key.secret}` },
      )
    ).res.status,
    401,
  );
});
await check("Upgrade bug creates real violations", async () => {
  const r = await owner("/v1/demo/run", "POST", {
    scenario: "upgrade-propagation",
  });
  assert.equal(r.res.status, 200, JSON.stringify(r.data));
  const rows = await poll(async () => {
    const x = (await owner("/v1/violations")).data;
    return x.some(
      (v) =>
        v.customer.externalCustomerId === "cus_demo_upgrade_bug" &&
        v.featureKey === "sso" &&
        v.status === "OPEN",
    )
      ? x
      : null;
  });
  assert.ok(
    rows.some(
      (v) =>
        v.featureKey === "api_requests" &&
        v.expectedValue === 500000 &&
        v.observedValue === 50000,
    ),
  );
});
await check("Repeated observations group incidents", async () => {
  await owner("/v1/demo/run", "POST", { scenario: "upgrade-propagation" });
  await poll(async () => {
    const x = (await owner("/v1/violations")).data.filter(
      (v) =>
        v.customer.externalCustomerId === "cus_demo_upgrade_bug" &&
        v.featureKey === "sso" &&
        v.status === "OPEN",
    );
    assert.equal(x.length, 1);
    return x[0].occurrenceCount >= 2;
  });
});
const scenarios = (await owner("/v1/tests/scenarios")).data;
async function runTest(name) {
  const s = scenarios.find((s) => s.key === name);
  assert.ok(s);
  const r = await owner("/v1/tests/runs", "POST", { scenarioId: s.id });
  assert.equal(r.res.status, 200);
  return poll(async () => {
    const x = (await owner(`/v1/tests/runs/${r.data.id}`)).data;
    return ["PASSED", "FAILED", "ERROR"].includes(x.status) ? x : null;
  });
}
await check("Regression detects actual broken SSO", async () => {
  const r = await runTest("pro-to-enterprise");
  assert.equal(r.status, "FAILED");
  assert.ok(r.results.some((x) => x.status === "FAIL"));
});
await check("Fix auto resolves incidents", async () => {
  const r = await owner("/v1/demo/run", "POST", { scenario: "fix" });
  assert.equal(r.res.status, 200);
  await poll(
    async () =>
      !(await owner("/v1/violations")).data.some(
        (v) =>
          v.customer.externalCustomerId === "cus_demo_upgrade_bug" &&
          ["OPEN", "ACKNOWLEDGED"].includes(v.status),
      ),
  );
});
await check("Regression passes after real fix", async () => {
  assert.equal((await runTest("pro-to-enterprise")).status, "PASSED");
});
await check("Duplicate signed webhook preserves version", async () => {
  assert.equal((await runTest("duplicate-webhook")).status, "PASSED");
});
await check("Older signed webhook preserves newer state", async () => {
  assert.equal((await runTest("out-of-order-webhook")).status, "PASSED");
});
await check("Forged webhook rejected", async () => {
  const r = await owner(
    `/v1/webhooks/stripe/${project.id}`,
    "POST",
    { id: "forged" },
    { "stripe-signature": "t=1,v1=invalid" },
  );
  assert.equal(r.res.status, 400);
});
await check("Tenant cannot modify another customer", async () => {
  const id = (await owner("/v1/customers")).data[0].id;
  assert.equal(
    (
      await outsider(`/v1/customers/${id}/expected`, "POST", {
        feature: "sso",
        value: true,
      })
    ).res.status,
    404,
  );
});
await check("Readiness verifies database and Redis", async () => {
  const r = await fetch(base + "/ready");
  assert.equal(r.status, 200);
});
await fs.mkdir("docs/evidence", { recursive: true });
await fs.writeFile(
  "docs/evidence/integration-results.json",
  JSON.stringify(
    {
      date: new Date().toISOString(),
      database: process.env.TEST_DATABASE_DESCRIPTION ?? "PostgreSQL",
      results,
    },
    null,
    2,
  ),
);
console.log(`${results.length} integration checks passed`);
