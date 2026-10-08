import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { registerDashboard } from "../../apps/api/src/dashboard.js";

describe("same origin dashboard hosting", () => {
  let root: string;
  let app: FastifyInstance;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "entitlementci-web-"));
    await mkdir(path.join(root, "assets"));
    await writeFile(path.join(root, "index.html"), "<h1>Dashboard</h1>");
    await writeFile(
      path.join(root, "assets", "app-123.js"),
      "console.log('app')",
    );
    app = Fastify();
    app.get("/v1/example", async () => ({ ok: true }));
    await registerDashboard(app, root);
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });
  it("serves navigation and preserves API routes", async () => {
    const page = await app.inject({
      method: "GET",
      url: "/violations/example",
      headers: { accept: "text/html" },
    });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("Dashboard");
    expect(page.headers["cache-control"]).toBe("no-cache");
    const api = await app.inject("/v1/example");
    expect(api.json()).toEqual({ ok: true });
  });
  it("keeps unknown API routes and missing assets as 404 responses", async () => {
    for (const url of ["/v1/missing", "/ready/missing", "/assets/missing.js"]) {
      const response = await app.inject({
        method: "GET",
        url,
        headers: { accept: "text/html" },
      });
      expect(response.statusCode).toBe(404);
      expect(response.body).not.toContain("Dashboard");
    }
    expect(
      (await app.inject({ method: "POST", url: "/unknown" })).statusCode,
    ).toBe(404);
  });
  it("caches fingerprinted assets and does not turn JSON clients into HTML", async () => {
    const asset = await app.inject("/assets/app-123.js");
    expect(asset.statusCode).toBe(200);
    expect(asset.headers["cache-control"]).toContain("immutable");
    expect((await app.inject("/unknown")).statusCode).toBe(404);
  });
});
