ALTER TABLE "RequestIdempotency" ADD COLUMN "processingToken" TEXT NOT NULL DEFAULT '';
UPDATE "RequestIdempotency" SET "processingToken" = lower(hex(randomblob(24))) WHERE "processingToken" = '';
