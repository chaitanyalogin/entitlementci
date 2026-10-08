import { prisma } from "../db.js";

export async function audit(input: {
  organizationId: string;
  projectId?: string;
  actorUserId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  ipAddress?: string;
  requestId?: string;
  metadata?: unknown;
}) {
  await prisma.auditLog.create({
    data: { ...input, metadata: input.metadata as object | undefined },
  });
}
