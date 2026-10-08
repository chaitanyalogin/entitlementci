// Sample application behavior. Expected entitlements come independently from the catalog.
export const SANDBOX_PROJECT_NAME = "TaskFlow Sandbox";
export const SANDBOX_KIND = "hosted-sandbox-v1";
export const SANDBOX_CUSTOMERS = [
  { id: "sample_healthy", plan: "pro" },
  { id: "sample_upgrade", plan: "enterprise" },
  { id: "sample_downgrade", plan: "pro" },
  { id: "sample_limit", plan: "enterprise" },
] as const;
export type SandboxPlan = "pro" | "enterprise";
export type SandboxScenario =
  | "healthy"
  | "upgrade-propagation"
  | "downgrade-propagation"
  | "limit-bug"
  | "fix";
export function sandboxFeature(projectId: string, feature: string) {
  return `sample_${projectId}_${feature}`;
}
export function sandboxPlan(projectId: string, plan: SandboxPlan) {
  return `sample_${projectId}_${plan}`;
}
export function sandboxAccess(state: {
  actualPlan: SandboxPlan;
  apiLimit?: number;
}) {
  return {
    analytics: true,
    advanced_reports: state.actualPlan === "enterprise",
    sso: state.actualPlan === "enterprise",
    api_requests:
      state.apiLimit ?? (state.actualPlan === "enterprise" ? 500000 : 50000),
  };
}
export function sandboxState(
  customer: (typeof SANDBOX_CUSTOMERS)[number],
  scenario: SandboxScenario,
) {
  let actualPlan: SandboxPlan = customer.plan;
  let apiLimit: number | undefined;
  if (scenario === "upgrade-propagation" && customer.id === "sample_upgrade")
    actualPlan = "pro";
  if (
    scenario === "downgrade-propagation" &&
    customer.id === "sample_downgrade"
  )
    actualPlan = "enterprise";
  if (scenario === "limit-bug" && customer.id === "sample_limit")
    apiLimit = 50000;
  return {
    kind: SANDBOX_KIND,
    actualPlan,
    ...(apiLimit === undefined ? {} : { apiLimit }),
  };
}
