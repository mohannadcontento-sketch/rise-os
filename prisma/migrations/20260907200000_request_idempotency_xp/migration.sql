CREATE TABLE "RequestIdempotency" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "route" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'processing',
  "responseStatus" INTEGER,
  "responseBody" TEXT,
  "responseHeaders" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "processingUntil" DATETIME,
  CONSTRAINT "RequestIdempotency_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RequestIdempotency_userId_idempotencyKey_key" ON "RequestIdempotency"("userId", "idempotencyKey");
CREATE INDEX "RequestIdempotency_expiresAt_idx" ON "RequestIdempotency"("expiresAt");
CREATE INDEX "RequestIdempotency_userId_createdAt_idx" ON "RequestIdempotency"("userId", "createdAt");

CREATE TABLE "XpAward" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "XpAward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "XpAward_userId_dedupeKey_key" ON "XpAward"("userId", "dedupeKey");
CREATE INDEX "XpAward_userId_createdAt_idx" ON "XpAward"("userId", "createdAt");
