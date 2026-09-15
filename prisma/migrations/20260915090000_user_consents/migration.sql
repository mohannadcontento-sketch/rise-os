-- Phase 20: Onboarding + Auth + Consent — جدول سجل الموافقات (محلي/SQLite)
-- نظير هجرة Supabase 038_phase20_user_consents.sql (uuid + RLS).
-- الإدراج خادمي فقط من بوابة signup؛ العميل يقرأ موافقاته فقط.
CREATE TABLE "UserConsent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "consentType" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "consentedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "UserConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "UserConsent_userId_consentType_policyVersion_key" ON "UserConsent"("userId", "consentType", "policyVersion");
CREATE INDEX "UserConsent_userId_idx" ON "UserConsent"("userId");
