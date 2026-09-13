-- ============================================================
-- 034_phase10c_chatgpt_oauth.sql — طبقة OAuth لربط ChatGPT (10-ج)
--
-- لماذا؟ دوكس OpenAI (developer-mode): ChatGPT يقبل لخوادم MCP
-- مصادقة OAuth فقط — لا مفاتيح Bearer ثابتة. هذه الهجرة تضيف:
--   1) جدول mcp_oauth_codes: فرض «الاستخدام الواحد» لرموز
--      التفويز (إدراج jti عند الاستبدال؛ التعارض = إعادة تشغيل
--      مرفوضة). RLS بلا سياسات = service_role فقط (نفس نمط
--      push_dispatch_log في 033).
--   2) بيانات عميل OAuth في app_config (تولد مرة واحدة إن لم
--      توجد): mcp_oauth_client_id + mcp_oauth_client_secret —
--      نفس نمط VAPID في 028. Edge Function تقرؤهما بنفسها؛
--      ولا تظهر للمستخدم النهائي إلا عبر /api/rise/mcp/
--      oauth-info (خطة ماكس).
--
-- خطوات المالك (كلها اختيارية الترتيب — الهجرة idempotent):
--   (أ) شغّل هذا الملف كاملًا في SQL Editor (مرة واحدة).
--   (ب) أعد نشر وظيفة mcp بالنسخة المحدثة (dist/mcp.dashboard.ts
--       أو CLI) — الإصدار الجديد يتضمن مسارات ?oauth=.
--   (ج) جرب: https://<ref>.supabase.co/functions/v1/mcp?oauth=
--       metadata → JSON فيه authorization_endpoint وtoken_endpoint.
--   (د) من إعدادات أوج (ربط MCP → ChatGPT) انسخ الروابط وبيانات
--       العميل والصقها في ChatGPT (Developer mode → Plugins → +).
--
-- ملاحظة أمنية: تدوير service_role key يبطل رموز OAuth الموقعة
-- (المفتاح الاشتقاقي يتغير) → المستخدمون يعيدون التفويض فقط؛
-- لا تأثير على مفاتيح rise_ ولا على البيانات.
-- ============================================================

-- ── 0) pgcrypto لتوليد أسرار عشوائية ───────────────────────
create extension if not exists pgcrypto;

-- ── 1) جدول رموز التفويز (الاستخدام الواحد) ───────────────
create table if not exists public.mcp_oauth_codes (
  jti        text primary key,
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

comment on table public.mcp_oauth_codes is
  'رموز تفويز OAuth المستبدلة (10-ج): إدراج jti عند استبدال code — التعارض 23505 = رفض إعادة التشغيل. service_role فقط (RLS بلا سياسات).';

alter table public.mcp_oauth_codes enable row level security;

-- لا سياسات قراءة/كتابة عامة: Edge Function تعمل بمفتاح الخدمة
-- فتتجاوز RLS، وأي عميل آخر لا يرى شيئًا (نفس عقد 033).

-- فهرس تنظيف المجدول (احتياط — التنظيف أفضل-جهد داخل الوظيفة)
-- ملاحظة: فهرس عادي على expires_at وليس جزئيًا بشرط now() —
-- now() ليست IMMUTABLE فيرفضها Postgres في predicate الفهرس
-- (اكتُشف أثناء التطبيق الفعلي على الإنتاج 2026-09-13).
create index if not exists mcp_oauth_codes_expired_idx
  on public.mcp_oauth_codes (expires_at);

-- ── 2) بيانات عميل OAuth (تولد مرة واحدة) ──────────────────
insert into app_config (key, value)
select 'mcp_oauth_client_id', 'awj-' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 20))
where not exists (select 1 from app_config where key = 'mcp_oauth_client_id');

insert into app_config (key, value)
select 'mcp_oauth_client_secret', 'csecret_' || encode(gen_random_bytes(32), 'hex')
where not exists (select 1 from app_config where key = 'mcp_oauth_client_secret');

comment on column app_config.value is
  'existing column; القيم mcp_oauth_client_* (034) يولّدها الترحيل ولا تعدلها يدويًا إلا للتدوير (ثم أعد ربط عملاء ChatGPT).';

-- ── 3) التحقق ─────────────────────
do $$
declare
  v_id text;
  v_secret text;
begin
  select value into v_id from app_config where key = 'mcp_oauth_client_id';
  select value into v_secret from app_config where key = 'mcp_oauth_client_secret';
  raise notice 'mcp oauth: client_id=% secret=مخفي (طول %)', v_id, length(coalesce(v_secret, ''));
  if v_id is null or v_secret is null then
    raise exception 'فشل توليد بيانات عميل OAuth — راجع قسم app_config أعلاه';
  end if;
end $$;

-- علامة اكتمال الهجرة (توثيق حالة النشر — كما في 033)
insert into app_config (key, value)
values ('mcp_oauth_deployment', 'migration-034-applied')
on conflict (key) do update set value = excluded.value;
