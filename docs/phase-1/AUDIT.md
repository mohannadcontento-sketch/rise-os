# وثيقة التدقيق والتنظيف — المرحلة الأولى
## أوج | awj.life — Audit وتنظيف المشروع

| البند | القيمة |
|---|---|
| **الإصدار** | 1.0 |
| **التاريخ** | 11 سبتمبر 2026 |
| **المنفّذ** | Super Z (المنفّذ التقني) |
| **خط الأساس** | commit ‏565a693 (ما بعد اعتماد المرحلة صفر) |
| **المنهجية** | جرد مرجعي لكل رمز مُصدَّر (استيراد ثابت + ديناميكي) عبر `rg`، ثم تحقق قبل كل حذف، ثم بناء إنتاجي كامل للتحقق |

---

## ملخص تنفيذي

| المؤشر | قبل | بعد |
|---|---|---|
| حجم الكود الميت المحذوف | — | **~7,700 سطر** (34 ملفًا + رمزان ميتان) |
| الحزم في package.json | 74 | **44** (حُذفت 30 حزمة صفرية الاستخدام) |
| مسارات API | 51 | **43** (حُذف 2 مسار stub مهمل + seed يُعزل) |
| وحدات التطبيق | 23 | 22 (أُلغي مدرب AI الداخلي بقرار المرحلة صفر) |
| خطوات Onboarding | 5 | 4 (حُذفت خطوة ترويج قاعدة المعارف) |
| Build | ناجح | **ناجح** (TypeScript + Turbopack بلا أخطاء) |

كل حذف تم بعد **تحقق فردي**: صفر استيرادات ثابتة أو ديناميكية للرمز قبل الحذف، والبناء الإنتاجي نجح بعده.

---

## 1. ما حُذف فعليًا (بالدليل)

### 1.1 كود ميت مؤكد (صفر مراجع)

| العنصر | الحجم | الدليل |
|---|---|---|
| `src/components/rise/ai-coach.tsx` | 866 سطرًا | قرار المرحلة صفر (لا AI داخلي) — مراجعه: سجل التحميل الكسول + السجل + الشريط الجانبي + الأيقونات + اللاندنج + الـOnboarding |
| `src/lib/coach-knowledge.ts` + `coach-kb-1.ts` + `coach-kb-2.ts` | 1,460 سطرًا | مستوردة من ai-coach فقط |
| `src/lib/sync-manager.ts` | 326 سطرًا | صفر استيرادات (طبقة الأوفلاين الحقيقية: secure-offline-db) |
| `src/lib/offline-db.ts` | 291 سطرًا | مستورده الوحيد sync-manager المحذوف |
| `src/lib/supabase-client.ts` | 29 سطرًا | صفر استيرادات |
| `src/components/weekly-review.tsx` | 611 سطرًا | **نسخة مكررة** من `rise/weekly-review.tsx` (المستخدمة فعلًا) |
| مكوّنات shadcn/ui ميتة | 23 ملفًا / ~3,459 سطرًا | كل ملف تحقق فرديًا: صفر استيرادات (sidebar, chart, menubar, context-menu, carousel, calendar, navigation-menu, form, sheet, drawer, pagination, breadcrumb, input-otp, toggle-group, accordion, resizable, avatar, popover, toggle, radio-group, hover-card, collapsible, aspect-ratio) |
| مكدس i18n الميت | 3 ملفات / 257 سطرًا | `i18n/use-translation.ts` + `messages/ar.json` + `messages/en.json` — صفر استخدام لـ next-intl |
| `src/hooks/use-mobile.ts` | — | مستهلكه الوحيد ui/sidebar المحذوف |
| `PulseCard` + `NeoLoader` في kit-v2.tsx | ~82 سطرًا | صفر استيرادات للرمزين |
| مسارا MCP المهملان | 2 مسار | `api/mcp` (stub) + `api/rise/mcp/call` (‏POST يعيد 503 deprecated) — يُعاد بناؤهما في المرحلة 09 |

### 1.2 الحزم المحذوفة (30) — كلها تحققت قبل الحذف

**صفرية الاستخدام (11):** ‏@mdxeditor/editor، ‏@reactuses/core، ‏next-intl، ‏react-markdown، ‏react-syntax-highlighter، ‏@tanstack/react-table، ‏@tanstack/query-sync-storage-persister، ‏@hookform/resolvers، ‏uuid، ‏docx، ‏z-ai-web-dev-sdk.

**تبعيات مكونات UI المحذوفة (18):** ‏react-day-picker، ‏embla-carousel-react، ‏input-otp، ‏react-resizable-panels، ‏vaul، ‏react-hook-form، و12 حزمة Radix ‏(accordion, aspect-ratio, avatar, collapsible, context-menu, hover-card, menubar, navigation-menu, popover, radio-group, toggle, toggle-group).

**مثلية البناء (1):** ‏sharp (لا استخدام لـ next/image في المشروع).

### 1.3 إصلاحات مرجعية مصاحبة

- `page.tsx`: إزالة AICoach من سجل التحميل الكسول + سجل المكونات + سجل الأسماء.
- `app-store.ts`: إزالة `'ai-coach'` من نوع ModuleId.
- `sidebar.tsx`: إزالة عنصر «قاعدة المعارف» من التنقل.
- `icons.tsx`: إزالة glyph «coach» + إدخال MODULE_ICONS الخاص به.
- `landing.tsx`: إزالة شريحة الماركي + عنوان العمود.
- `onboarding.tsx`: حذف خطوة KnowledgeStep كاملة (‏5→4 خطوات) + تنظيف استيرادات الأيقونات الميتة (Star, Award, Search, ListOrdered).
- `.env.example`: إزالة قسم BIGMODEL_API_KEY بالكامل.

---

## 2. تصحيح README (التوثيق يطابق الواقع الآن)

| الادعاء القديم | الواقع الجديد الموثَّق |
|---|---|
| «24 API route (6 مصادقة + 18 بيانات + 1 أدمن)» | **43 مسارًا** (7 مصادقة + 24 بيانات + 10 أدمن + 2 مساعدة) |
| Bluetooth Share (بلوتوث + مخطط المعمارية + جدول PWA) | **أُزيل** — البديل الموثق: Offline Persister (‏React Query + IndexedDB مشفّر) |
| مسار `/api/rise/ai-chat` | غير موجود — **أُزيل من الجدول** |
| Sync Manager في جدول PWA | **أُزيل** — الموثق: `secure-offline-db.ts` (‏IndexedDB مشفّر لكل مستخدم) |
| «مدرب ذكي ZhipuAI» (ميزة + جدول وحدات + لقطات + ZhipuAI JWT) | **أُزيل بالكامل** — بديل العمود: لوحة الإدارة |
| «تنسيق MDX» في اليوميات | **أُزيل** (المحرر غير مستخدم وحُذفت حزمته) |
| شجرة lib (sync-manager + bluetooth-share) | محدثة: ‏secure-offline-db + validators الجديدة |

---

## 3. التحقق المركزي من المدخلات الحساسة (جديد)

أُنشئت **`src/lib/validators.ts`** — مصدر واحد لمخططات zod + مساعد `parseBody()` موحد، ورُبطت في المسارات الحساسة:

| المسار | قبل | بعد |
|---|---|---|
| `POST /api/auth/resend` | فحص truthy فقط | ‏email: صيغة + حد 254 + توحيد حالة |
| `DELETE /api/rise/delete-all` (تدميري) | فحص truthy للثلاثة | ‏email كامل + password (8-128) + confirmDelete ‏literal(true) صارم |
| `PUT /api/rise/admin/storage` | حد أدنى فقط (بلا سقف!) | ‏uuid + عدد صحيح **بين 1KB و10GB** |
| `POST /api/rise/user/name` | بلا حد طول | trim + ‏1-80 حرفًا |
| `POST /api/rise/user/avatar` | فحص سلسلة فقط | 1-64 حرفًا + القائمة البيضاء (كما هي) |

المسارات ذات الفحوص اليدوية المكتملة (earn-xp بنمط reason regex + سقف XP، وsanitize.ts في goals/habits/planner) تعمل كما هي؛ هجرتها للمخطط المركزي تتم عند لمسها في مراحلها (المرحلة 04 تضيف entitlement checks فوقها).

## 4. عزل أدوات التطوير عن الإنتاج

- `POST /api/rise/seed`: يرجع **404 في production** الآن (شرط NODE_ENV في رأس المعالج) — كان متاحًا للطلب رغم أنه أداة تطوير بصفر مستدعين من الواجهة.

## 5. قاعدة البيانات — التنظيف والتوثيق

- **إسقاط الجدول المهجور:** أُنشئ `supabase/migrations/023_drop_abandoned_app_config.sql` — جدول `app_config` أُنشئ في 001/002/004 ولم يستعلمه أي كود إطلاقًا (المرجع الوحيد كان mapping في mock-client وأُزيل).
- **Prisma schema:** حُذف نموذج AppConfig المقابل (وضع dev المحلي متسق مع الإنتاج).
- التوثيق الكامل للجداول والعلاقات: **`docs/phase-1/DATABASE.md`**.
- ملاحظة مسجلة للمرحلة القادمة: ترقيم مزدوج في `008_comprehensive_rls_policies` / `008_clean_all_data` — يُعالج عند أول migration جديدة.

---

## 6. نتائج البوابات (DoD)

| البند | النتيجة | الدليل |
|---|---|---|
| **Build ينجح بلا أخطاء/imports ميتة** | ✅ | `next build`: ‏Compiled successfully + TypeScript pass + 3 static pages. فحص بقايا بعد الحذف: صفر مراجع لأي رمز محذوف |
| **لا Features مكسورة في الرحلات الأساسية** | ✅ | البناء يحل كل الاستيرادات؛ الحذف كان للرموز صفرية الاستخدام فقط + اختبار دخان على الموقع المنشور بعد النشر (يُوثق في سجل العمل) |
| **قاعدة البيانات مفهومة ومُوثقة** | ✅ | docs/phase-1/DATABASE.md: الجداول + الأعمدة + العلاقات + سياسات RLS |

## 7. ما لم يُحذف عمدًا (قرارات موثقة)

- **`userAIUsage` / جدول user_ai_usage**: مستخدم من مسار storage لتتبع حصة الاستخدام — بقي رغم حذف واجهة المدرب.
- **الوحدات المؤجلة (11 وحدة)**: كلها مربوطة وتعمل — تبقى في الكود حتى قرار الإزالة الفعلي في نطاق إعادة البناء (لن نحذف كودًا يعمل قبل أن تبني أوج بديله).
- **مسارات بلا مستدعٍ من الواجهة (5)**: dashboard/summary + dashboard/recent + dashboard/weekly-chart + notifications/send + admin/storage — قائمة للمالك: حذف مباشر أو إبقاء كسطح API خارجي (قرار المرحلة 03/05 عند لمسها).
- **نظاما Toast مزدوجان** (sonner + ui/toast): كلاهما حي — التوحيد الفعلي يتم في المرحلة 02 (Design System) لأنه قرار تصميمي لا تنظيفي.

## 8. مسار التنفيذ للمراحل القادمة (من التدقيق)

1. المكررات النوعية (Task/Project/Habit/Goal معرّفة كنماذج عرض مختلفة في 2-3 ملفات) → مركز types موحد في المرحلة 02 عند إعادة بناء الوحدات (الدمج الآن هدر على كود مُجدول لإعادة البناء).
2. ~~`lib/data.ts` (barrel) مقابل `lib/data/` (مجلد)~~ → **أُنجز في هذه المرحلة**: الباريل انتقل إلى `src/lib/data/index.ts` والاستيرادات الـ34 كلها تعمل بلا تغيير.
3. loading.tsx / not-found.tsx على مستوى المسارات — المرحلة 02 مع Design System.
4. بقية مخططات zod للـ18 مسارًا المتبقية — تُغطى تدريجيًا في المرحلة 04 مع entitlements.
5. توحيد نظامي Toast (sonner + ui/toast) — المرحلة 02 (قرار تصميمي).
