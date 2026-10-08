import type { FastifyReply, FastifyRequest } from "fastify";
import type { ApiErrorBody } from "@entitlementci/shared";

export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;
  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function errorBody(
  error: AppError,
  request: FastifyRequest,
): ApiErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      requestId: request.id,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
}

export function assert(
  condition: unknown,
  status: number,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new AppError(status, code, message);
}

export function getClientIp(request: FastifyRequest): string | undefined {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim();
  return request.ip;
}

export function noContent(reply: FastifyReply) {
  return reply.code(204).send();
}
