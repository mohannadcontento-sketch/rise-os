# حزم لوحة Supabase (ملفات مدموجة)

وُلِّدت آليًا بواسطة `scripts/build-dashboard-bundles.mjs` — لا تحررها يدويًا.

| الملف | الوظيفة في Supabase | طريقة النشر |
|---|---|---|
| `mcp.dashboard.ts` | `mcp` | Dashboard: Edge Functions → Create function → الاسم `mcp` → الصق → Deploy |
| `push-dispatch.dashboard.ts` | `push-dispatch` | نفس الطريقة بالاسم `push-dispatch` |

ملاحظات:
- عطّل خيار «Verify JWT» عند إنشاء الوظيفة في اللوحة (إن ظهر).
- المتغيران SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY يُحقنان تلقائيًا من المنصة.
- للتعديل: عدّل المصادر في `supabase/functions/` ثم `node scripts/build-dashboard-bundles.mjs`.
- مسار CLI البديل (المستودع كاملًا): راجع `supabase/DEPLOY.md`.
