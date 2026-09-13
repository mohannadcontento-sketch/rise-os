# دليل نشر Edge Functions في Supabase — أوج (rise-os)

> **سبب الخطأ الذي واجهته:**`Module not found ".../_shared/mcp-core.ts"`
> لوحة Supabase تقبل **ملفًا واحدًا فقط** عند إنشاء الوظيفة، بينما الكود الأصلي
> يستورد من `../_shared/*.ts`. الحل جاهز: ملفات مدموجة أحادية في
> `supabase/dist/` — انسخها والصقها كما هي.

---

## الطريقة الأولى: من لوحة Supabase (الأسهل — بدون أي تثبيت)

### 0) جهّز الملفين

من مستودع المشروع (أو من مجلد التنزيل):

| الوظيفة | الملف الجاهز للصق |
|---|---|
| `mcp` | `supabase/dist/mcp.dashboard.ts` |
| `push-dispatch` | `supabase/dist/push-dispatch.dashboard.ts` |

> هذه الملفات وُلِّدت آليًا بواسطة `scripts/build-dashboard-bundles.mjs`
> من المصادر الأصلية في `supabase/functions/` — لا تحررها يدويًا.
> أي تعديل مستقبلي: عدّل المصدر ثم `node scripts/build-dashboard-bundles.mjs`.

### 1) انشر وظيفة `mcp` (خادم MCP لأوج)

1. ادخل لوحة مشروعك في Supabase → **Edge Functions** من القائمة الجانبية.
2. اضغط **Create a new function** (زر الإضافة).
3. الاسم: `mcp` **بالضبط** (الرابط النهائي يعتمد عليه).
4. **أطفئ خيار «Verify JWT with legacy secret»** إن ظهر في نافذة الإنشاء
   (أو من Details بعد الإنشاء).
   - هذا إلزامي: مفاتيح `rise_…` ليست Supabase JWT — بوابة المنصة
     سترفضها بـ 401 قبل وصول الكود لو تركت التحقق مفعّلًا.
5. امسح أي كود افتراضي في المحرر، والصق **كامل** محتوى
   `supabase/dist/mcp.dashboard.ts` ثم اضغط **Deploy** (أو Save).
6. نقطة النهاية الجاهزة بعدها:
   `https://<project-ref>.supabase.co/functions/v1/mcp`

> ⚠️ **علة معروفة في اللوحة:** مفتاح «Verify JWT with legacy secret» قد
> **يعود مفعّلًا تلقائيًا** بعد الحفظ (علة موثقة في مجتمع Supabase).
> ارجع لصفحة الوظيفة → Details وتأكد أنه OFF، وأعد فحصه بعد أي Save لاحق.

### 2) انشر وظيفة `push-dispatch` (مرسل Web Push)

نفس الخطوات بالضبط، لكن:

- الاسم: `push-dispatch`
- الملف الملصوق: `supabase/dist/push-dispatch.dashboard.ts`
- أطفئ «Verify JWT» أيضًا (المجدول يمكن أن يستخدم `x-cron-secret`).

### 3) اختبر `mcp` قبل أي ربط (من الطرفية)

```bash
# المصافحة — يجب أن تعيد jsonrpc result بدل الخطأ
curl -X POST "https://<project-ref>.supabase.co/functions/v1/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer rise_المفتاح_هنا" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'

# عرض الأدوات الثمانية
curl -X POST "https://<project-ref>.supabase.co/functions/v1/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer rise_المفتاح_هنا" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

- مفتاح `rise_…` يُنشأ من **إعدادات أوج** (خطة ماكس) — الوظيفة تتحقق
  منه مباشرة من جدول `user_api_keys` في نفس القاعدة (بلا أي إعداد إضافي).
- إن أعاد `401 Invalid JWT` → مفتاح Verify JWT في اللوحة لا يزال ON.
- إن أعاد خطأ JSON-RPC عربيًا → الوظيفة تعمل، والمفتاح هو المشكلة.

### 4) فعّل جدولة البوش (مرة واحدة — SQL Editor)

الوظيفة نُشرت لكنها تعمل يدويًا فقط؛ لتشغيلها كل دقيقتين نفّذ في
**SQL Editor** خطوات الهجرة `033_phase10b_edge_functions.sql` (قسم
التعليمات آخر الملف):

```sql
-- (أ) خزّن مفتاح الخدمة في Vault (مرة واحدة)
select vault.create_secret('<SERVICE_ROLE_KEY>', 'push_dispatch_auth');

-- (ب) سجّل رابط الوظيفة
insert into app_config (key, value) values
  ('edge_function_push_dispatch_url', 'https://<project-ref>.supabase.co/functions/v1/push-dispatch')
on conflict (key) do update set value = excluded.value;

-- (ج) فعّل الجدولة (تنشئ مهمة cron كل دقيقتين)
select rise_activate_push_dispatch();

-- (د) تحقق
select jobname, schedule from cron.job where jobname like '%push%';
```

`<SERVICE_ROLE_KEY>` من: Project Settings → API keys →
`service_role` (secret). VAPID يُقرأ تلقائيًا من `app_config` (زرعتها
هجرة 028) — لا يلزم أي إعداد إضافي.

---

## الطريقة الثانية: من الطرفية (CLI — لمن يفضل سطر الأوامر)

```bash
# تسجيل دخول مرة واحدة
npx supabase login

# اربط المشروع (Reference ID من Settings → General)
npx supabase link --project-ref <project-ref>

# انشر الوظيفتين من جذر المستودع (بنية _shared تعمل هنا بشكل كامل)
npx supabase functions deploy mcp --no-verify-jwt
npx supabase functions deploy push-dispatch --no-verify-jwt
```

- `--no-verify-jwt` إلزامي للسبب نفسه أعلاه (موثق أيضًا في
  `supabase/config.toml` — مع config.toml يكفي `supabase functions deploy`).
- الملفان المدموجان في `dist/` للوحة فقط؛ CLI يأخذ المصادر الأصلية.

---

## ربط خادم MCP مع أدوات الذكاء الاصطناعي

نقطة النهاية واحدة للجميع:
`https://<project-ref>.supabase.co/functions/v1/mcp`
والمصادقة: ترويسة `Authorization: Bearer rise_…`

### ✅ Gemini CLI — يعمل اليوم مباشرة

```bash
gemini mcp add --transport http awj \
  "https://<project-ref>.supabase.co/functions/v1/mcp" \
  -H "Authorization: Bearer rise_المفتاح_هنا"
```

أو يدويًا في `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "awj": {
      "httpUrl": "https://<project-ref>.supabase.co/functions/v1/mcp",
      "headers": { "Authorization": "Bearer rise_المفتاح_هنا" }
    }
  }
}
```

داخل الجلسة: `/mcp` لعرض حالة الاتصال والأدوات.
(المصدر: google-gemini.github.io/gemini-cli/docs/tools/mcp-server —
دعم `httpUrl` + `headers` + أمر `gemini mcp add`).

### ✅ Qwen Code — يعمل اليوم مباشرة

```bash
qwen mcp add --transport http awj \
  "https://<project-ref>.supabase.co/functions/v1/mcp" \
  --header "Authorization: Bearer rise_المفتاح_هنا"
```

أو يدويًا في ملف settings الخاص بـQwen Code:

```json
{
  "mcpServers": {
    "awj": {
      "httpUrl": "https://<project-ref>.supabase.co/functions/v1/mcp",
      "headers": { "Authorization": "Bearer rise_المفتاح_هنا" }
    }
  }
}
```

داخل الجلسة: `/mcp` للفحص.
(المصدر: qwenlm.github.io/qwen-code-docs — نفس بنية Gemini CLI).

### ✅ Copilot في VS Code — يعمل اليوم مباشرة

الأسرع: `Ctrl+Shift+P` → **MCP: Add Server** → HTTP → الصق الرابط →
اختر Workspace أو Global، ثم أضف الترويسة (انظر المثال).

أو يدويًا `.vscode/mcp.json` في مساحة العمل:

```json
{
  "servers": {
    "awj": {
      "type": "http",
      "url": "https://<project-ref>.supabase.co/functions/v1/mcp",
      "headers": {
        "Authorization": "Bearer ${input:awj-mcp-key}"
      }
    }
  },
  "inputs": [
    {
      "id": "awj-mcp-key",
      "type": "promptString",
      "description": "مفتاح MCP من إعدادات أوج (rise_…)"
    }
  ]
}
```

> استخدام `${input:…}` يحفظ المفتاح بلا كتابته نصًا في الملف (توصية
> رسمية من دوكس VS Code للأسرار). لاحظ أيضًا أن `~/.copilot/mcp-config.json`
> مقروء من كل أدوات Copilot (الصيغة نفسها بدون قسم inputs).
> بعد الإضافة: افتح Copilot Chat بوضع Agent، وستجد أدوات awj في قائمة
> الأدوات (Tools).
> (المصدر: code.visualstudio.com/docs/agents/reference/mcp-configuration).

### ✅ ربط ChatGPT — عبر OAuth (منذ 10-ج)

ChatGPT لا يقبل مفتاح Bearer ثابتًا (توثيق OpenAI الرسمي) — لذلك
أضفنا طبقة OAuth 2.0 كاملة داخل وظيفة `mcp` نفسها. بعد نشر النسخة
المحدثة (`dist/mcp.dashboard.ts` الحالية) وتشغيل **هجرة 034** مرة
واحدة في SQL Editor:

1. **جهّز القاعدة (مرة واحدة):** شغّل ملف
   `supabase/migrations/034_phase10c_chatgpt_oauth.sql` كاملًا في
   SQL Editor — ينشئ جدول رموز التفويز ويولّد بيانات العميل.
2. **أعد نشر وظيفة `mcp`** بالملف المدموج المحدث (نفس خطوات
   اللوحة أعلاه — الصق `supabase/dist/mcp.dashboard.ts`).
3. **تحقق السريع:**
   `https://<ref>.supabase.co/functions/v1/mcp?oauth=metadata` →
   JSON فيه authorization_endpoint وtoken_endpoint.
4. **في ChatGPT:**
   - Settings → **Security and login** → شغّل **Developer mode**
   - chatgpt.com/plugins → زر **+** → إنشاء تطبيق من خادم MCP بعيد
   - أدخل بيانات العميل (تظهر جاهزة مع أزرار نسخ في
     **إعدادات أوج → ربط MCP → ربط ChatGPT** بعد نشر 034):
     - Server URL: `https://<ref>.supabase.co/functions/v1/mcp`
     - Client ID + Client Secret (من إعدادات أوج)
     - Authorization URL: نفس رابط authorize + `&api_key=rise_…`
     - Token URL: `https://<ref>.supabase.co/functions/v1/mcp?oauth=token`
5. **عند أول استخدام** تُفتح صفحة موافقة عربية من أوج — اضغط
   «تفويض» ويعود ChatGPT برمز وصول صالح ساعة + تجديد 60 يومًا.

الأمان المضمن: بوابة خطة ماكس تُفحص **في كل طلب** (النزول من ماكس
يوقف رموز OAuth فورًا)، رمز التفويز يُستخدم مرة واحدة (جدول
`mcp_oauth_codes`)، PKCE S256 إلزامي عند وجود التحدي، إعادة التوجيه
مقيدة بنطاقات chatgpt.com/openai.com، والإيقاف يُفحص لحظيًا.

> ملاحظة أمان: تدوير `service_role` key يبطل رموز OAuth الصادرة
> (المفتاح الاشتقاقي يتغير) — المستخدم يعيد التفويض فقط، ولا
> تأثير على البيانات أو مفاتيح rise_.

### ⚠️ ChatGPT — قبل 10-ج (توثيق تاريخي)

توثيق OpenAI الرسمي (developers.openai.com/api/docs/guides/developer-mode):

- المسار: Settings → **Security and login** → تفعيل **Developer mode**
  → chatgpt.com/plugins → زر + → إنشاء app من خادم MCP بعيد.
- البروتوكولات المدعومة: SSE وstreaming HTTP — **خادمنا متوافق**.
- المصادقة المدعومة: **OAuth / بلا مصادقة / مختلطة فقط** — لا يقبل
  مفتاح Bearer ثابت في الترويسة. خادمنا يرفض الطلبات بلا مفتاح `rise_`
  (أمان بالتصميم) لذا الربط المباشر اليوم غير ممكن.
- **الحل للوصول من ChatGPT:** إضافة طبقة OAuth 2.0 للوظيفة (مرحلة
  مستقبلية: نقطتا /authorize و/token + DCR) — طلبها صريح إن أردتها.
- بديل عملي اليوم من منظومة OpenAI: استخدام Gemini CLI أو Qwen Code أو
  Copilot أعلاه (كلها تقبل الترويسة مباشرة).

---

## استكشاف الأخطاء الشائعة

| العَرَض | السبب | الحل |
|---|---|---|
| `401 Invalid JWT` قبل تنفيذ الكود | Verify JWT لا يزال ON | أطفئه من Details الوظيفة وتأكد أنه لا يعود ON |
| `Function not found` / 404 | اسم الوظيفة مختلف | يجب `mcp` و `push-dispatch` بالضبط |
| `Module not found .../_shared` | لصقت ملف المصدر بدل المدموج | استخدم `supabase/dist/*.dashboard.ts` |
| JSON-RPC: «مطلوب مفتاح MCP» | الترويسة ناقصة/خاطئة | `Authorization: Bearer rise_…` من إعدادات أوج |
| JSON-RPC: خطة غير ماكس | المستخدم على Free | فعّل ماكس من لوحة الأدمن أولًا |
| البوش لا يصل | الجدولة غير مفعلة أو الرابط غلط | خطوات (أ)-(د) أعلاه + `select * from cron.job` |
| أعدت تعديل المصادر | — | `node scripts/build-dashboard-bundles.mjs` ثم أعد اللصق |
