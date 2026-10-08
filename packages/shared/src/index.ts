export type Role = "OWNER" | "ADMIN" | "DEVELOPER" | "VIEWER";
export type Environment = "DEVELOPMENT" | "STAGING" | "PRODUCTION";
export type ViolationStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "IGNORED";
export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type ObservationDecision = "ALLOW" | "DENY";
export type EntitlementValue = boolean | number | string;

export interface EntitlementState {
  customerId: string;
  plan?: string;
  features: Record<string, EntitlementValue>;
  observedAt?: string;
  source?: string;
  requestId?: string;
}

export interface EntitlementMismatch {
  feature: string;
  expected: EntitlementValue | null;
  observed: EntitlementValue | null;
  reason: string;
  severity: Severity;
}

export interface ComparisonResult {
  customerId: string;
  matches: boolean;
  mismatches: EntitlementMismatch[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export const ROLES: Role[] = ["OWNER", "ADMIN", "DEVELOPER", "VIEWER"];
export const ENVIRONMENTS: Environment[] = [
  "DEVELOPMENT",
  "STAGING",
  "PRODUCTION",
];
export const VIOLATION_STATUSES: ViolationStatus[] = [
  "OPEN",
  "ACKNOWLEDGED",
  "RESOLVED",
  "IGNORED",
];
export const SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
export { compareEntitlements } from "./comparison.js";

export { redactMetadata } from "./redaction.js";
export * from "./sandbox.js";
