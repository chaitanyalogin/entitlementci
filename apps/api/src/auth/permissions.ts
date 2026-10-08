import type { Role } from "@prisma/client";
import { AppError } from "../utils/http.js";

const hierarchy: Record<Role, number> = {
  OWNER: 4,
  ADMIN: 3,
  DEVELOPER: 2,
  VIEWER: 1,
};

export function requireRole(actual: Role, minimum: Role): void {
  if (hierarchy[actual] < hierarchy[minimum])
    throw new AppError(
      403,
      "FORBIDDEN",
      `Role ${actual} cannot perform this action.`,
    );
}
