import { z } from "zod";

export const decisionSchema = z.object({
  customerId: z.string().min(1).max(256),
  feature: z.string().min(1).max(128),
  allowed: z.boolean(),
  plan: z.string().max(128).optional(),
  limit: z.number().int().nonnegative().optional(),
  used: z.number().int().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const usageSchema = z.object({
  customerId: z.string().min(1).max(256),
  feature: z.string().min(1).max(128),
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const identifyCustomerSchema = z.object({
  customerId: z.string().min(1).max(256),
  emailHash: z.string().max(256).optional(),
  plan: z.string().max(128).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const projectCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  environment: z.enum(["DEVELOPMENT", "STAGING", "PRODUCTION"]),
});

export const apiKeyCreateSchema = z.object({
  environment: z.enum(["DEVELOPMENT", "STAGING", "PRODUCTION"]),
  label: z.string().trim().min(1).max(120),
});
