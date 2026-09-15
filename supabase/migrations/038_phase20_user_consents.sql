-- ============================================================
-- 038 — المرحلة 20: Onboarding + Auth + Consent
-- جدول user_consents: سجل قابل للتدقيق لموافقات إنشاء الحساب.
--
-- العمود consent_type: 'terms' | 'privacy'
-- العمود policy_version: نسخة السياسة المقبولة (من LEGAL_LAST_UPDATED)
-- metadata (jsonb): بصمات دنيا مجزّأة SHA-256 فقط — لا PII خام.
--
-- الإدراج يتم من مسار /api/auth/signup عبر service role (يسجل
-- الموافقة لحظة قبولها — حتى لو كان البريد غير مؤكد بعد).
-- RLS: المستخدم يقرأ موافقاته فقط؛ لا تحديث ولا حذف من العميل
-- (سجل قانوني — التعديل غير مسموح أصلًا).
-- ============================================================

create table if not exists user_consents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  consent_type   text not null check (consent_type in ('terms', 'privacy')),
  policy_version text not null,
  consented_at   timestamptz not null default now(),
  metadata       jsonb not null default '{}'::jsonb
);

-- موافقة واحدة لكل (مستخدم، نوع، نسخة) — إعادة القبول لنفس
-- النسخة لا تُنشئ صفًا جديدًا
create unique index if not exists user_consents_user_type_version_key
  on user_consents (user_id, consent_type, policy_version);

create index if not exists user_consents_user_recent_idx
  on user_consents (user_id, consented_at desc);

alter table user_consents enable row level security;

-- قراءة موافقاتي فقط
create policy "user_consents_select_own"
  on user_consents for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- الإدراج مسموح للمستخدم عن نفسه (يستخدمه مسار مستقبلي إن لزم
-- إعادة قبول نسخة جديدة من داخل التطبيق بعد تحديث السياسات)
create policy "user_consents_insert_own"
  on user_consents for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- لا policies للتحديث أو الحذف — السجل قانوني غير قابل للتعديل
-- من جهة العميل (service role فقط، للتدقيق).
