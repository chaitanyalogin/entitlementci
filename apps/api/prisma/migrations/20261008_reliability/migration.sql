ALTER TABLE "ObservedDecision" ADD COLUMN "processedAt" TIMESTAMP(3);
ALTER TABLE "ViolationOccurrence" ADD COLUMN "observationId" TEXT;
CREATE UNIQUE INDEX "ViolationOccurrence_observationId_key" ON "ViolationOccurrence"("observationId");
CREATE INDEX "ObservedDecision_processedAt_receivedAt_idx" ON "ObservedDecision"("processedAt", "receivedAt");
