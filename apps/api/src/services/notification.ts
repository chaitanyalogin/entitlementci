import { prisma } from "../db.js";
import { enqueue } from "../jobs.js";
export async function enqueueCriticalViolationNotification(input: {
  organizationId: string;
  violationId: string;
  feature: string;
  customerId: string;
  requestId?: string;
}) {
  const notification = await prisma.notification.create({
    data: {
      organizationId: input.organizationId,
      type: "CRITICAL_ENTITLEMENT_VIOLATION",
      status: "PENDING",
      channel: process.env.EMAIL_TRANSPORT ?? "console",
      subject: "Critical entitlement violation detected",
      body: `Feature ${input.feature} for customer ${input.customerId} has diverged from expected entitlement.`,
      metadata: { violationId: input.violationId, requestId: input.requestId },
    },
  });
  await enqueue(
    "notification",
    { notificationId: notification.id },
    { jobId: `notification:${notification.id}`, attempts: 3 },
  );
  return notification;
}
