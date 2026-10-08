import { test, expect } from "@playwright/test";

test("visitor demo detects a bug, fails regression, fixes access, passes regression and signs out", async ({
  page,
}) => {
  test.skip(
    process.env.ENABLE_HOSTED_E2E !== "true",
    "Requires the hosted sandbox API",
  );
  await page.goto("/login");
  await page
    .getByRole("button", { name: "Try live demo", exact: true })
    .click();
  await expect(
    page.getByText("Live sandbox · Sample data", { exact: true }),
  ).toBeVisible();
  const card = page.locator("article").filter({ hasText: "Break an upgrade" });
  await card
    .getByRole("button", { name: "Trigger failure", exact: true })
    .click();
  const incident = page
    .getByRole("row")
    .filter({ hasText: "sample_upgrade" })
    .filter({ has: page.getByRole("link", { name: "sso", exact: true }) });
  await expect(incident.getByText("OPEN", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page
    .getByRole("button", { name: "Run regression test", exact: true })
    .click();
  await expect(page.getByText("FAILED", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page
    .getByRole("button", { name: "Fix and verify", exact: true })
    .click();
  await expect(incident.getByText("RESOLVED", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByText("PASSED", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText("Live sandbox · Sample data", { exact: true }),
  ).toBeVisible();
  await expect(incident.getByText("RESOLVED", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Test Runs", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "PASSED" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Try live demo", exact: true }),
  ).toBeVisible();
  expect((await page.request.get("/v1/auth/me")).status()).toBe(401);
});
