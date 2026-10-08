import { test, expect } from "@playwright/test";

test("sign in, detect an upgrade failure, resolve the evidence, sign out", async ({
  page,
}) => {
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill("owner@demo.entitlementci.test");
  await page.getByLabel("Password", { exact: true }).fill("DemoPassword!123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Drift Lab", exact: true }).click();
  const card = page.locator("article").filter({ hasText: "Break an upgrade" });
  await card.getByRole("button", { name: "Trigger failure" }).click();
  const matchingIncidents = page
    .getByRole("row")
    .filter({ hasText: "cus_demo_upgrade_bug" })
    .filter({ hasText: "sso" });
  const openIncident = matchingIncidents.filter({
    has: page.getByText("OPEN", { exact: true }),
  });
  await expect(openIncident).toHaveCount(1, {
    timeout: 30000,
  });
  const incidentHref = await openIncident
    .getByRole("link", { name: "sso", exact: true })
    .getAttribute("href");
  expect(incidentHref).toMatch(/^\/violations\//);
  const incident = matchingIncidents.filter({
    has: page.locator(`a[href="${incidentHref}"]`),
  });
  await page.getByRole("button", { name: "Fix and verify" }).click();
  await expect(incident.getByText("RESOLVED", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  expect((await page.request.get("/v1/auth/me")).status()).toBe(401);
  await page.reload();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
});
