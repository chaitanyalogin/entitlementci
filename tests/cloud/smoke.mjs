import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";

if (process.env.ENABLE_CLOUD_WRITE_TESTS !== "true") {
  throw new Error(
    "Set ENABLE_CLOUD_WRITE_TESTS=true to create isolated cloud test organizations.",
  );
}
const base = new URL(process.env.TEST_API_URL).origin;
assert.equal(new URL(base).protocol, "https:", "Cloud tests require HTTPS");
const results = [];
const fixtures = [];
const check = async (name, fn) => {
  await fn();
  results.push({ name, status: "PASS" });
  console.log(`PASS ${name}`);
};
const jsonRequest = async (path, method = "GET", body, headers = {}) => {
  const response = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  return { response, data: await response.json().catch(() => null) };
};
async function client() {
  const email = `cloud-check-${randomUUID()}@verification.entitlementci.test`;
  const password = randomUUID() + randomUUID();
  const registered = await jsonRequest("/v1/auth/register", "POST", {
    email,
    password,
    organizationName: "Cloud verification fixture",
  });
  assert.equal(registered.response.status, 201, "Account registration");
  fixtures.push({
    organizationId: registered.data.organization.id,
    userId: registered.data.user.id,
  });
  const cookies = registered.response.headers.getSetCookie();
  assert.ok(
    cookies.some(
      (c) =>
        c.startsWith("entitlementci_session=") &&
        /;\s*Secure/i.test(c) &&
        /;\s*HttpOnly/i.test(c),
    ),
  );
  const cookie = cookies.map((c) => c.split(";")[0]).join("; ");
  const csrf = cookies
    .find((c) => c.startsWith("entitlementci_csrf="))
    ?.split(";")[0]
    .split("=")[1];
  const request = (path, method = "GET", body, headers = {}) =>
    jsonRequest(path, method, body, {
      cookie,
      "x-csrf-token": csrf,
      ...headers,
    });
  return { request, email, password };
}
async function poll(fn) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const result = await fn();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Worker did not reach the expected state within 30 seconds");
}

try {
  await check("HTTPS API, database and Redis readiness", async () => {
    const { response, data } = await jsonRequest("/ready");
    assert.equal(response.status, 200);
    assert.equal(data.database, "ok");
    assert.equal(data.redis, "ok");
  });
  await check("Dashboard and deep links served on API origin", async () => {
    for (const path of ["/", "/violations"]) {
      const response = await fetch(base + path, {
        headers: { accept: "text/html" },
      });
      assert.equal(response.status, 200);
      assert.match(await response.text(), /<div id="root"><\/div>/);
    }
    assert.equal((await jsonRequest("/v1/not-a-route")).response.status, 404);
  });
  let owner;
  await check("New organization has secure session cookies", async () => {
    owner = await client();
  });
  const request = owner.request;
  await check("Sign in with new credentials", async () => {
    const login = await jsonRequest("/v1/auth/login", "POST", {
      email: owner.email,
      password: owner.password,
    });
    assert.equal(login.response.status, 200);
    // End the additional login session. The registration session remains in use.
    const cookie = login.response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const csrf = login.response.headers
      .getSetCookie()
      .find((c) => c.startsWith("entitlementci_csrf="))
      ?.split(";")[0]
      .split("=")[1];
    assert.equal(
      (
        await jsonRequest(
          "/v1/auth/logout",
          "POST",
          {},
          { cookie, "x-csrf-token": csrf },
        )
      ).response.status,
      204,
    );
  });
  let project;
  let sdkKey;
  await check("Subscription catalog and scoped SDK key creation", async () => {
    const created = await request("/v1/projects", "POST", {
      name: "Cloud verification",
      environment: "PRODUCTION",
    });
    assert.equal(created.response.status, 201);
    project = created.data;
    assert.equal(
      (
        await request("/v1/features", "POST", {
          key: "sso",
          name: "Single sign on",
          type: "BOOLEAN",
        })
      ).response.status,
      200,
    );
    assert.equal(
      (
        await request("/v1/plans", "POST", {
          key: "enterprise",
          name: "Enterprise",
          entitlements: { sso: true },
        })
      ).response.status,
      200,
    );
    assert.equal(
      (
        await request("/v1/customers", "POST", {
          projectId: project.id,
          customerId: "cloud_fixture",
          plan: "enterprise",
        })
      ).response.status,
      200,
    );
    const key = await request("/v1/api-keys", "POST", {
      projectId: project.id,
      label: "Cloud verification",
      environment: "PRODUCTION",
    });
    assert.equal(key.response.status, 201);
    sdkKey = key.data;
  });
  const observe = async (allowed) => {
    const result = await jsonRequest(
      "/v1/decisions",
      "POST",
      { customerId: "cloud_fixture", feature: "sso", allowed },
      { authorization: `Bearer ${sdkKey.secret}` },
    );
    assert.equal(result.response.status, 200);
    assert.equal(result.data.accepted, true);
    return result.data;
  };
  let incident;
  await check("Live worker detects denied Enterprise access", async () => {
    await observe(false);
    incident = await poll(async () => {
      const { data } = await request(`/v1/violations?projectId=${project.id}`);
      return data.find((item) => item.status === "OPEN");
    });
  });
  await check("Repeated failures group into one incident", async () => {
    await observe(false);
    await poll(async () => {
      const { data } = await request(`/v1/violations/${incident.id}`);
      return data.occurrences.length >= 2;
    });
    const { data } = await request(`/v1/violations?projectId=${project.id}`);
    assert.equal(data.length, 1);
  });
  await check("Corrected access automatically resolves incident", async () => {
    await observe(true);
    await poll(
      async () =>
        (await request(`/v1/violations/${incident.id}`)).data.status ===
        "RESOLVED",
    );
  });
  await check("Tenant isolation denies another organization", async () => {
    const outsider = await client();
    assert.equal(
      (await outsider.request(`/v1/violations/${incident.id}`)).response.status,
      404,
    );
    assert.equal(
      (await outsider.request("/v1/auth/logout", "POST", {})).response.status,
      204,
    );
  });
  await check("CSRF rejection and disabled demo controls", async () => {
    assert.equal(
      (
        await request(
          "/v1/projects",
          "POST",
          { name: "Rejected", environment: "STAGING" },
          { "x-csrf-token": "invalid" },
        )
      ).response.status,
      403,
    );
    assert.equal(
      (
        await request("/v1/demo/run", "POST", {
          scenario: "upgrade-propagation",
        })
      ).response.status,
      403,
    );
  });
  await check("Revoked SDK key cannot submit events", async () => {
    assert.equal(
      (await request(`/v1/api-keys/${sdkKey.id}/revoke`, "POST", {})).response
        .status,
      204,
    );
    assert.equal(
      (
        await jsonRequest(
          "/v1/decisions",
          "POST",
          { customerId: "cloud_fixture", feature: "sso", allowed: true },
          { authorization: `Bearer ${sdkKey.secret}` },
        )
      ).response.status,
      401,
    );
  });
  await check("Sign out invalidates server session", async () => {
    assert.equal(
      (await request("/v1/auth/logout", "POST", {})).response.status,
      204,
    );
    assert.equal((await request("/v1/auth/me")).response.status, 401);
  });
  const report = {
    date: new Date().toISOString(),
    base,
    conclusion: "PASS",
    checks: results,
    fixtures,
    fixturePolicy:
      "Two synthetic organizations remain as verification evidence. Passwords are discarded, SDK key revoked and sessions ended.",
  };
  await fs.mkdir("docs/evidence", { recursive: true });
  await fs.writeFile(
    "docs/evidence/cloud-smoke.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(`Cloud verification passed: ${results.length} checks`);
} catch (error) {
  console.error(
    `Cloud verification failed after ${results.length} checks: ${error.message}`,
  );
  process.exitCode = 1;
}
