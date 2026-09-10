# توثيق قاعدة البيانات — المرحلة الأولى
## أوج | awj.life — قاعدة البيانات مفهومة ومُوثقة (بند DoD)

| البند | القيمة |
|---|---|
| **الإصدار** | 1.0 — 11 سبتمبر 2026 |
| **المصدر** | `src/lib/data/` (‏23 ملف DAO) + `supabase/migrations/` (‏23 ملفًا بعد إضافة 023) + `prisma/schema.prisma` (وضع dev) |
| **المعمارية** | Supabase (إنتاج، عزل RLS لكل مستخدم) + Prisma/SQLite (وضع dev المحلي فقط — mock-client يحاكي واجهة Supabase) |

---

## 1. الجداول (28 نشطة) — مصنفة حسب المجال

### بيانات الإنتاجية (نواة المنتج — كلها user_id مع RLS)

| الجدول | الدور | DAO | ملاحظات |
|---|---|---|---|
| `profiles` | الملف الشخصي (اسم/أفاتار/XP/مستوى) | profiles.ts | مرتبط بحساب Auth |
| `tasks` | المهام | tasks.ts | Kanban + أولويات |
| `subtasks` | المهام الفرعية | tasks.ts | cascade من tasks |
| `goals` | الأهداف | goals.ts | — |
| `milestones` | معالم الأهداف | goals.ts | toggle atomic عبر RPC |
| `habits` | تعريفات العادات | habits.ts | — |
| `habit_logs` | سجلات العادات اليومية | habitLogs.ts | — |
| `journals` | اليوميات | journals.ts | — |
| `planner_items` | عناصر المخطط اليومي | plannerItems.ts | — |
| `morning_logs` | سجلات الروتين الصباحي | morningLogs.ts | — |
| `projects` | المشاريع | projects.ts | مؤجل للـv1.1 |
| `work_sessions` | جلسات العمل | workSessions.ts | مؤجل للـv1.1 |
| `focus_sessions` | جلسات التركيز العميق | focusSessions.ts | مؤجل للـv1.1 |
| `books` | الكتب والقراءة | books.ts | مؤجل للـv1.2 |
| `knowledge_items` | العقل الثاني/التعلم | knowledgeItems.ts | مؤجل للـv1.2 |
| `finance_records` | السجلات المالية | financeRecords.ts | مؤجل للـv1.1 |
| `health_logs` | سجلات الصحة | healthLogs.ts | مؤجل للـv1.1 |
| `daily_scores` | درجات الإنتاجية اليومية | dailyScores.ts | تُغذي لوحة اليوم |

### نظام التتبع والتحفيز

| الجدول | الدور | ملاحظات |
|---|---|---|
| `user_achievements` | إنجازات المستخدم | مع XP |
| `xp_awards` | منح XP (dedupe) | يُكتب عبر RPC `award_xp_atomic` فقط — لا استعلام مباشر |
| `notifications` | الإشعارات داخل التطبيق | المرحلة 05 تعيد بناء مصدر الأحداث |

### الحساب والصلاحيات والاستخدام

| الجدول | الدور | ملاحظات |
|---|---|---|
| `user_settings` | تفضيلات المستخدم | — |
| `user_storage` | حصة التخزين والاستخدام | يُحدَّث من الأدمن (بحد 1KB-10GB الآن) |
| `user_ai_usage` | تتبع الاستخدام الشهري | مستخدم من مسار storage — بقي بعد حذف المدرب |
| `user_api_keys` | مفاتيح MCP (مجزأة) | المرحلة 09 توسّعه |

### البنية التشغيلية

| الجدول | الدور | ملاحظات |
|---|---|---|
| `request_idempotency` | مفاتيح Idempotency | lease + TTL (migration 014/017) |
| `audit_logs` | سجل الأدمن الحساس | كتابة عبر logAudit فقط |
| `error_logs` | أخطاء العميل | مسار error-log |

### الجداول الملغاة

| الجدول | القرار |
|---|---|
| `app_config` | **مهجور** — أُنشئ في 001/002/004 ولم يُستعلم قط → migration **023** تسقطه (أُزيل أيضًا من Prisma schema وmock-client) |

---

## 2. دوال RPC الذرية (7 — كلها عبر عميل مصادق)

| الدالة | العملية | المستدعي |
|---|---|---|
| `create_task_with_subtasks` | إنشاء مهمة+فرعيات ذريًا | tasks POST |
| `update_task_with_subtasks` | تحديث ذري | tasks PUT |
| `toggle_goal_milestone_atomic` | تبديل معلم هدف | goals |
| `award_xp_atomic` | منح XP + مستوى + سلسلة (dedupe مضمّن) | earn-xp |
| `admin_broadcast_notifications_atomic` | بث إشعارات جماعي | admin/broadcast |
| `admin_delete_user_data_atomic` | حذف بيانات مستخدم (أدمن) | admin/users |
| `delete_user_data_atomic` | حذف بيانات المستخدم نفسه | delete-all |

## 3. سياسات RLS

- مبدأ التنفيذ: **عزل لكل مستخدم** عبر سياسات JOIN-based للجداول الابنة (subtasks/habit_logs/milestones عبر مالك الأب).
- الكميات الموثقة سابقًا في تقرير QA: 181 سياسة عبر 22 ملف migration (من 005_security_fixes حتى 022_admin_read_contract_fix).
- أحدث التصلبات: 019_final_privilege_hardening + 021_notification_integrity + 022_admin_read_contract_fix.

## 4. المهاجرات (23 ملفًا)

001→007 (التأسيس+الأمان) · 008×2 ‏(⚠️ ترقيم مزدوج: comprehensive_rls + clean_all_data — يُعالج عند أول migration جديدة) · 009→013 ‏(وحدات+XP) · 014/017 ‏(idempotency) · 015/018/019 ‏(الأدمن والسلامة) · 016/020/021/022 ‏(ذرية وتكامل) · **023 ‏(إسقاط app_config — جديد)**.

Prisma migrations (5): خاصة بوضع dev المحلي فقط (idempotency_lease, request_idempotency_xp, focus_task_ownership, integrity_constraints, mock_auth_password_hash).

## 5. قواعد الوصول (طبقة البيانات)

1. كل قراءة/كتابة إنتاج تمر عبر `sb()` (عميل لكل طلب يحمل توكن المستخدم → RLS يفعّل العزل في قاعدة البيانات نفسها، لا في الكود).
2. `requireUser`/`requireAdmin` في رأس كل معالج مسار (‏48/51 محققًا سابقًا؛ الـ43 الباقية كلها محمية عدا manifest العام بالتصميم).
3. مفاتيح Idempotency على عمليات POST الحساسة (بدون مفتاح → 428).
4. service_role محصور في عمليات الأدمن الإدارية فقط (users/audit) — ممنوع لبيانات المستخدمين (موثق في supabase.ts).
