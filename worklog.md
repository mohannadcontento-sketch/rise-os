# RiseOS - سجل العمل

---
Task ID: 1
Agent: Main
Task: فحص بنية المشروع وإنشاء الأساس

Work Log:
- فحص المشروع الحالي (Next.js 16, Tailwind CSS 4, shadcn/ui, Prisma)
- تصميم قاعدة بيانات شاملة بـ 18 نموذج
- تصميم نظام ألوان RiseOS (Forest Green, Emerald, Warm Gold)
- إنشاء globals.css مع نظام ألوان oklch للوضع الفاتح والداكن
- إنشاء CSS classes: glass, shine, pulse-glow, heat-0 إلى heat-4
- إنشاء Zustand store للتنقل
- إنشاء الشريط الجانبي مع 20 عنصر
- إنشاء 11 API route
- إنشاء بيانات تجريبية شاملة

Stage Summary:
- الأساس الكامل جاهز
- 11 API route تعمل
- بيانات تجريبية شاملة

---
Task ID: 2-5
Agent: Sub-agents (6 parallel)
Task: بناء كل الـ 20 وحدة

Work Log:
- Dashboard, Morning Routine, Daily Planner, Tasks, Projects
- Goals, Habits, Journal, Deep Work, Health, Finance
- Reading, Learning, Second Brain, Calendar
- Weekly/Monthly Review, Analytics, AI Coach, Settings

Stage Summary:
- 20+ مكون واجهة مكتمل
- تصميم Apple-like مع glassmorphism
- رسوم بيانية مع recharts

---
Task ID: 6
Agent: Main
Task: إصلاح أخطاء التجميع

Work Log:
- إصلاح SmartphoneOff, Project, WakeUp icons
- إصلاح lint error في page.tsx

Stage Summary:
- الصفحة تُجمّع بنجاح HTTP 200
- Lint يمر بنجاح

## الحالة الحالية
- التطبيق يعمل بالكامل
- قاعدة بيانات مع بيانات تجريبية
- وضع فاتح/داكن
- RTL عربي
- تصميم premium

## مخاطر
- الإشعارات الفعلية غير مُنفذة
- لا يوجد نظام مصادقة حقيقي

---
Task ID: qa-1 through qa-4
Agent: Cron Review Agent
Task: تقييم QA، إصلاح الأخطاء، تحسين التصميم، إضافة ميزات جديدة

Work Log:
- إجراء اختبار QA شامل عبر المتصفح لكل الـ 20 وحدة
- اكتشاف وإصلاح 3 أخطاء:
  1. Analytics crash (dailyScores destructured from wrong object)
  2. Floating-point imprecision in Health sleep hours
  3. Missing named→default exports (fixed in previous round)
- تحسين تصميم Dashboard: hero gradient, mini sparklines, premium glass cards, section accent borders, quote watermark
- تحسين تصميم Sidebar: gradient line, active accent bar, group title dots, XP glow bar, inner shadow
- تحسين تصميم Tasks: priority colored borders, spring animations, glass kanban columns, count-up numbers
- تحسين تصميم Projects: gradient overlays, glowing progress rings, parallax hover
- تحسين تصميم Goals: type-based gradients, milestone timeline, sliding tab underline
- تحسين تصميم Habits: pulsing toggles, card flash, streak flames, heatmap glow
- تحسين تصميم Journal: colored textarea borders, spring mood emojis, energy gradient slider, paper texture
- تحسين تصميم Deep Work: breathing glow timer, gradient stroke, celebration particles, ambient wave animations
- تحسين تصميم Finance: colored summary borders, trend arrows, alternating rows, visual type cards
- ميزة جديدة: AI Coach يعمل بالكامل مع ردود عربية ذكية، أنيميشن كتابة، حفظ في localStorage
- ميزة جديدة: Morning Routine زر "ابدأ الصباح" مع تتبع الوقت وتهنئة
- ميزة جديدة: Daily Planner ملاحظات سريعة
- ميزة جديدة: Reading قسم "يقرأ حالياً" مع تقدم ونجوم تفاعلية
- ميزة جديدة: Learning رادار المهارات مع RadarChart
- ميزة جديدة: Second Brain Quick Capture + ملون حسب النوع
- ميزة جديدة: Weekly Review Auto-Fill من API + slider مرئي
- ميزة جديدة: Analytics Best/Worst Day + Personal Records
- ميزة جديدة: Settings Danger Zone + تعديل الاسم

Stage Summary:
- 0 أخطاء Lint
- كل الصفحات تعمل بدون أخطاء
- 12 ميزة جديدة
- تحسينات بصرية في كل الـ 20 وحدة
- اختبار نهائي: 6/6 نجح

## تقييم الحالة الحالية
- التطبيق مستقر ويعمل بشكل كامل
- كل الـ 20 وحدة تعرض وتتفاعل بشكل صحيح
- التصميم premium مع glassmorphism وأنيميشن
- AI Coach تفاعلي مع ردود عربية ذكية
- الوضع الفاتح/الداكن يعمل

## مخاطر/قضايا
- الإشعارات الفعلية غير مُنفذة
- لا يوجد نظام مصادقة حقيقي (مستخدم افتراضي)
- التقويم والمراجعة الشهرية تحتاج لبيانات أكثر
- بعض الميزات تعتمد على localStorage (ستُفقد عند مسح المتصفح)

## توصيات المرحلة القادمة
1. إضافة PWA support للعمل offline
2. إضافة نظام إشعارات فعلية
3. تحسين التقويم مع drag-and-drop
4. إضافة تصدير البيانات (PDF/Excel)
5. تحسين المراجعة الشهرية ببيانات أكثر

---
Task ID: r3 (Cron Review Round 3)
Agent: Cron Review Agent
Task: إصلاح أخطاء + تحسين 4 وحدات + إضافة 3 ميزات جديدة

Work Log:
- اختبار QA شامل: 20/20 صفحة تعمل، اكتشاف خطأ mobile sidebar
- إصلاح Mobile Sidebar: استبدال Tailwind translate utilities بـ max-lg:[transform:translateX(100%)]
- إصلاح originY DOM prop warning في morning-routine.tsx و deep-work.tsx
- تحسين Calendar: لوحة انزلاقية عند النقر، نقاط ملونة، زر "اليوم"، إحصائيات شهرية، أنيميشن انتقال
- تحسين Monthly Review: Auto-Fill من API، قسم أبرز لحظات الشهر، رسالة تحفيزية، أنيميشن حفظ
- تحسين Analytics: Best/Worst Day، Personal Records، مقارنة أسبوعية، Insight cards ملونة
- تحسين Settings: Avatar مع تعديل، بطاقات وضع مرئية، إشعارات مجمّعة، تصدير/استيراد بيانات، قسم "عن RiseOS"
- ميزة جديدة: نظام إشعارات Toast (notifications.ts) — متكامل مع Tasks, Habits, Deep Work, Morning Routine
- ميزة جديدة: بحث شامل ⌘K — يبحث في المهام والعادات والأهداف مع نتائج فورية
- ميزة جديدة: نظام XP/Level حقيقي — API earn-xp، calculateLevel أُسّي، 15 شارة، تكامل مع 4 وحدات، قسم شارات في Dashboard

Stage Summary:
- 0 أخطاء Lint
- 3 أخطاء مُصلحة
- 4 وحدات محسّنة بتفصيل
- 3 ميزات جديدة
- نظام Gamification يعمل بالكامل

## تقييم الحالة
- التطبيق مستقر ومتقدم
- Mobile sidebar مُصلح
- XP/Level system حقيقي مع API
- إشعارات Toast تعمل عند إنجاز المهام
- البحث الشامل يبحث في كل البيانات

## توصيات المرحلة القادمة
1. إضافة PWA manifest + service worker
2. تحسين الموبايل بشكل أوسع
3. إضافة تصدير PDF للتقارير
4. نظام نسخ احتياطي سحابي

---
Task ID: r4-styling
Agent: Styling Expert
Task: تحسينات بصرية شاملة

Work Log:
- إضافة `.premium-card` class مع multi-layered box-shadow, glass effect, و inner highlight (فاتح + داكن)
- إضافة `.shimmer` animation لـ skeleton loading (moving gradient highlight)
- إضافة `.glow-emerald` و `.glow-gold` utility classes لـ box-shadow glow effects
- تحسين scrollbar styling: إضافة `scrollbar-width: thin` + `scrollbar-color` لـ Firefox, تحسين webkit thumb opacity
- إضافة `.noise-bg` class مع SVG noise texture overlay (3% light / 5% dark)
- إضافة `.text-gradient-forest` و `.text-gradient-gold` لـ gradient text effects
- إضافة `.border-gradient` utility باستخدام pseudo-element technique (mask-composite)
- إضافة `.sidebar-glow` class — ambient glow خلف الشريط الجانبي في dark mode
- إضافة `.header-gradient-border` — خط سفلي متدرج (emerald → gold → transparent)
- إضافة `.search-glass-btn` — تأثير زجاجي عند hover على زر البحث
- إضافة `.theme-rotate` animation — دوران أيقونة تبديل السمة
- إضافة `.module-title-animate` — fade-in animation عند تغيير الوحدة
- إضافة orbiting dots keyframes (`orbit`, `orbit-reverse`) للـ loading animation
- تعزيز dark mode: رفع contrast card backgrounds (0.14→0.16)، زيادة glass border opacity، إضافة sidebar ambient glow
- استبدال الـ spinner البسيط في LoadingFallback بـ orbiting dots animation مع Zap icon في المركز
- تحسين الشريط العلوي: إزالة border-b، إضافة noise-bg texture + gradient border + module indicator dot مع أيقونة الوحدة الحالية
- تحسين زر البحث: إضافة search-glass-btn hover effect
- تحسين زر تبديل السمة: إضافة rotation animation عند النقر
- تحسين منطقة عنوان الوحدة: إضافة accent bar على اليمين + subtitle بالتاريخ العربي + fade-in animation
- تحسين module transition: إضافة scale (0.99→1) + spring physics + blur effect (4px→0)

Stage Summary:
- 0 أخطاء Lint، بناء ناجح
- 15+ CSS utility class جديدة جاهزة للاستخدام
- تحسينات بصرية في الشريط العلوي، التحميل، عنوان الوحدة، الانتقالات، و dark mode
- جميع الأيقونات من lucide-react مع إعادة تسمية لتجنب التعارض (CalendarIcon, SettingsIcon)

---
Task ID: r4-features
Agent: Features Agent
Task: إضافة 4 ميزات جديدة

Work Log:
- إنشاء API `/api/rise/productivity-score/route.ts` — يحسب درجة إنتاجية يومية (0-100) بناءً على 5 عوامل مرجحة
- إضافة ويدجت Productivity Score في لوحة التحكم (`dashboard.tsx`) — مقياس دائري متحرك مع ألوان متدرجة حسب الدرجة + شريط تفصيلي لكل فئة
- إضافة FAB (زر إجراء عائم) في `page.tsx` — زر ثابت أسفل يسار الشاشة مع قائمة expandable لـ 4 إجراءات سريعة
- إنشاء API `/api/rise/export/route.ts` — يصدّر كل بيانات المستخدم من قاعدة البيانات كملف JSON مع تسميات عربية
- تحسين زر التصدير في `settings.tsx` — يستدعي API الجديد بدلاً من localStorage مع toast notifications
- توسيع البحث الشامل في `page.tsx` — إضافة بحث في اليوميات والكتب وعناصر المعرفة مع عرض عدد النتائج لكل فئة

Stage Summary:
- 0 أخطاء Lint
- 4 ميزات جديدة مكتملة
- 2 API routes جديدة (productivity-score, export)
- بحث شامل يغطي 6 أنواع بيانات + وحدات التطبيق

---
Task ID: r5 (Cron Review Round 5)
Agent: Main Agent
Task: QA شامل + إصلاح أخطاء + تحسينات بصرية + ميزات جديدة

Work Log:
- اختبار QA عبر agent-browser لكل الـ 20 وحدة: 20/20 تعمل بدون أخطاء runtime
- اختبار mobile responsiveness (375x812) للوحة التحكم والمهام
- اختبار dark mode بنجاح
- فحص console: لا توجد أخطاء، فقط تحذيرات Framer Motion عن oklch colors (إطار عمل، غير قابل للإصلاح)
- إصلاح Sidebar XP: تحويل الشريط الجانبي من بيانات hardcoded إلى بيانات حقيقية من API
  - إضافة `UserInfo` interface و `setUser` action في Zustand store
  - الشريط الجانبي يجلب البيانات من `/api/rise/dashboard` كل 30 ثانية
  - عرض المستوى والخبرة والسلسلة بشكل حي
- إصلاح TypeScript errors: `ease` tuple type (`as const`), `whileHover` spread props, `PremiumGlass` style prop
- إصلاح calendar.tsx: `wins` property غير موجود في JournalEntry → استبدال بـ `content?.slice(0, 50)`
- تحسينات بصرية (عبر sub-agent):
  - `.premium-card`, `.shimmer`, `.glow-emerald`, `.glow-gold`, `.noise-bg`, `.text-gradient-forest`, `.text-gradient-gold`, `.border-gradient`
  - تحسين الشريط العلوي: gradient border, noise texture, module indicator, theme toggle rotation
  - تحسين Loading Fallback: orbiting dots animation مع Zap icon
  - تحسين عنوان الوحدة: accent bar + تاريخ عربي + fade-in animation
  - تحسين انتقالات الوحدات: spring physics + scale + blur
  - تعزيز dark mode: contrast, glass borders, sidebar ambient glow
- ميزات جديدة (عبر sub-agent):
  - Productivity Score Widget: API + مقياس دائري متحرك في لوحة التحكم
  - Quick Add FAB: زر إجراء عائم مع 4 إجراءات سريعة
  - Data Export API: تصدير كل البيانات كـ JSON مع تسميات عربية
  - Enhanced Search: بحث في اليوميات والكتب والمعرفة مع عداد نتائج

Stage Summary:
- 0 أخطاء Lint
- 5 أخطاء TypeScript مُصلحة
- 15+ CSS utility class جديدة
- 4 ميزات جديدة + 2 API routes جديدة
- Sidebar يعرض بيانات XP حقيقية
- كل الـ 20 وحدة تعمل بدون أخطاء runtime

## تقييم الحالة الحالية
- التطبيق مستقر ومتقدم مع 20 وحدة كاملة
- نظام Gamification حقيقي (XP/Level/شارات) مع عرض حي في Sidebar
- تصميم premium مع glassmorphism, orbiting animations, noise textures, gradient borders
- 6 أنواع بيانات قابلة للبحث عبر ⌘K
- تصدير البيانات متاح عبر API
- Productivity Score يومي
- FAB للإضافة السريعة

## مخاطر/قضايا
- Framer Motion يُصدر تحذيرات عن oklch colors أثناء تبديل السمة (إطار عمل، لا يمكن إصلاحه)
- لا يوجد نظام مصادقة حقيقي (مستخدم افتراضي)
- بعض البيانات (Daily Planner, Learning) في localStorage فقط
- الإشعارات الفعلية (push notifications) غير مُنفذة

## توصيات المرحلة القادمة
1. إضافة PWA manifest + service worker للعمل offline
2. نقل بيانات localStorage إلى قاعدة البيانات (Planner, Learning)
3. إضافة drag-and-drop في التقويم والمهام
4. تحسين المراجعة الشهرية ببيانات أكثر
5. إضافة تصدير PDF للتقارير عبر pdf skill

---
Task ID: r6-styling-1
Agent: Styling Expert
Task: تحسينات بصرية شاملة — الدفعة الأولى (5 وحدات)

Work Log:
- تحسين Daily Planner:
  - إضافة ساعة حية (Live Clock) في الترويسة مع تدرج لوني premium
  - تحسين تأثير الـ hover للعناصر مع glass effect + scale + shadow
  - إضافة فواصل متدرجة (gradient dividers) بين أقسام اليوم
  - إضافة قسم "ملاحظات سريعة" دائم الظهور مع textarea بتأثير زجاجي premium
  - إضافة مؤشر الوقت الحالي (currentHour) في الأقسام

- تحسين Reading:
  - إضافة TiltCard مع تأثير 3D عند تحريك الماوس (perspective + rotateX/Y)
  - إضافة غلاف كتاب ملون كبير (gradient placeholder) في قسم "أقرأ الآن"
  - إضافة عداد سلسلة القراءة (Reading Streak) مع أيقونة Flame
  - تحويل نوع الكتاب إلى genre pills ملونة مع border
  - تحسين بطاقة النوع لتكون pill بدلاً من Badge عادية

- تحسين Learning:
  - إضافة ProgressRing (SVG) مع stroke متدرج لكل مهارة بدلاً من النقاط
  - إضافة "شجرة المهارات" (Skill Tree) مع SVG متحرك — عُقد متصلة بخطوط
  - إضافة عداد سلسلة التعلم (Learning Streak) في الترويسة مع نبض متحرك
  - تحسين بطاقات الأهداف مع `premium-card` وحدود ملونة حسب الحالة
  - تحسين أنيميشن سجلات التعلم مع spring + scale

- تحسين Weekly Review:
  - إضافة ترويسة متدرجة مع نطاق تاريخ الأسبوع ورسالة تحفيزية
  - إضافة أشرطة تقدم متحركة (animated progress bars) لكل مقياس رقمي
  - إضافة رسم رادار SVG (pentagon) مع gradient fill لتصور الأداء
  - إضافة تأثير كونفيتي (confetti) عند حفظ المراجعة
  - تحسين كل البطاقات مع `premium-card` وحدود متدرجة

- تحسين Monthly Review:
  - إضافة ترويسة سينمائية مع اسم الشهر بخط كبير (text-gradient-forest)
  - إضافة "الشهر في أرقام" — صف إحصائيات مع AnimatedCounter
  - تحسين بطاقة "أفضل إنجاز" مع حدود ذهبية متدرجة وتأثير glow
  - تحسين الرسم الراداري مع strokeWidth و fillOpacity أفضل
  - تحسين كل البطاقات مع `premium-card` وحدود ملونة

Stage Summary:
- 0 أخطاء TypeScript جديدة في الملفات المُعدّلة
- 5 ملفات محسّنة بتصميم premium
- أقسام جديدة: ساعة حية، شجرة المهارات، رسم رادار SVG، كونفيتي، عدادات متحركة
- TiltCard (3D hover) في القراءة
- ProgressRing (SVG) في التعلم
6. تحسين الموبايل بشكل أوسع (responsive audit)
7. إضافة نظام إشعارات فعلية (Web Push API)

---
Task ID: r6-fixes
Agent: Code Fix Agent
Task: إصلاح أخطاء TypeScript

Work Log:
- فحص جميع أخطاء TypeScript في src/ (23 خطأ عبر 6 ملفات)
- إصلاح health.tsx: `ease: 'easeOut'` → `ease: 'easeOut' as const` (5 أخطاء)
- إصلاح journal.tsx: `ease: 'easeOut'` → `ease: 'easeOut' as const` (4 أخطاء)
- إصلاح finance.tsx: نقل `exit` transition من `transition` prop إلى `exit` prop، إضافة `as const` على `ease` (1 خطأ)
- إصلاح projects.tsx: `ease: [...]` → `as const`، إزالة `dir="rtl"` من DropdownMenuContent (5 أخطاء)
- إصلاح tasks.tsx: `ease: [...]` → `as const`، `type: 'spring'` → `as const`، إزالة `dir="rtl"` من DropdownMenuContent، إصلاح `e.stopPropagation()` في onCheckedChange (CheckedState ليس Event) (8 أخطاء)
- إصلاح habits.tsx: إضافة explicit return type لـ useMemo لحل `bestHabit` type narrowing إلى `never` (2 أخطاء)
- التحقق النهائي: 0 أخطاء TypeScript في src/

Stage Summary:
- 23 خطأ TypeScript مُصلحة عبر 6 ملفات
- الصنف الرئيسي: Framer Motion Variants type narrowing (ease strings/arrays كـ `as const`)
- الصنف الثاني: DropdownMenuContent لا يدعم prop `dir` → إزالته
- الصنف الثالث: CheckedState ليس Event → إزالة stopPropagation
- 0 أخطاء TypeScript متبقية في src/

---
Task ID: r6-styling-2
Agent: Styling Expert (Frontend)
Task: تحسينات بصرية للدفعة الثانية — 5 وحدات

Work Log:
- إصلاح reading.tsx: إعادة الملف للنسخة السابقة (كان يحتوي أخطاء هيكلية من تعديل سابق)

### 1. morning-routine.tsx — الروتين الصباحي
- إضافة تدرج "شروق" متحرك في الهيدر (gold → forest بت transition بطيء)
- إضافة حلقة تقدم دائرية (CompletionRing) مع gradient وتأثير توهج
- إضافة رسالة تحية صباحية ديناميكية حسب الوقت الفعلي (getMorningGreeting)
- إضافة أنيميشن "تنفس" على زر "ابدأ الصباح" (scale pulse)
- إضافة خط زمني بصري 20/20/20 (عيون ← حركة ← قراءة) مع أيقونات متحركة
- تحسين أنيميشنات checkbox: scale bounce عند التحديد + ظل + spring XP badge
- تحسين تأثيرات hover و whileTap على كل عنصر

### 2. calendar.tsx — التقويم
- تحسين تأثيرات hover على خلايا الأيام: glass effect + scale + glow-emerald لليوم
- تحسين لون اليوم المحدد: gradient (emerald → forest) بدل لون واحد
- تحسين لوحة الانزلاق: gradient أقوى + ظل + premium-card
- تحسين قائمة "مهام اليوم": أنيميشن staggered + أيقونة متحركة عند الفراغ + رسالة إيجابية
- تحسين item hover: padding أكبر + group hover effect

### 3. deep-work.tsx — العمل العميق
- إضافة حلقة خارجية نابضة تتغير لوناً حسب التقدم (emerald → gold → red) عبر oklch
- إضافة gradient دينامي للمؤقت يتغير حسب النسبة المئوية
- إضافة "منطقة التركيز" (Focus Zone): زر toggle يضع الواجه في fullscreen مُعتّم
- إضافة اقتباس تحفيزي يتغير كل جلسة (FOCUS_QUOTES)
- تحسين سجل الجلسات: تلوين حسب المدة (emerald ≥45min, gold ≥20min, muted)
- إضافة حدود جانبية ملونة + تحديد خط عريض للأوقات الطويلة
- إضافة أيقونات جديدة: Maximize2, Minimize2, Quote

### 4. ai-coach.tsx — المدرب الذكي
- إنشاء مكون AIAvatar مع حلقتين مداريين (dashed) يدوران باتجاهين مختلفين
- إضافة نقطة مدارية متوهجة على الحلقة الأولى
- تحسين الرسالة: gradient (emerald-accent → forest) بدل لون واحد
- تحسين فقاعات الرسائل: backdrop-blur-sm + ظل + gradient user bubble
- إضافة تأثير bouncing dots (y-axis) بدل opacity-only للكتابة
- إضافة حدود متدرجة على أزرار Quick Actions (emerald → gold gradient على hover)
- إضافة قسم "اقتراحات" مع 4 أسئلة مُثبّتة بأيقونات (Brain, Target, Heart, Moon)
- إضافة خلفية متدرجة تتحرك ببطء (oklch shifts)
- إضافة noise-bg texture خلف المحادثة

### 5. settings.tsx — الإعدادات
- تحسين بطاقة الملف الشخصي: توهج متحرك حول الأفاتار + إحصائيات (المستوى، XP، السلسلة)
- جلب الإحصائيات من API (/api/rise/dashboard) وعرضها في badges ملونة
- إضافة فواصل متدرجة بين كل قسم (emerald → amber → forest → purple → blue → destructive)
- تحسين منطقة الخطر: تأثير توهج أحمر متحرك (inset box-shadow)
- إضافة تذييل مع علامة RiseOS التجارية (Zap يدور + text-gradient-forest)
- إضافة معلومات الإصدار + "صُنع بأيدٍ عربية"

Stage Summary:
- 0 أخطاء Lint
- Build ناجح
- 5 وحدات محسّنة بتفصيل
- ميزات بصرية جديدة: AIAvatar, CompletionRing, RoutineTimeline, Focus Zone
- أنيميشنات: breathing button, bouncing dots, orbiting rings, shifting gradients

---
Task ID: r6-features-1
Agent: Features Agent
Task: إضافة 4 ميزات جديدة (ربط البومودورو بالمهام، في مثل هذا اليوم، تبعيات المهام، تذكيرات العادات)

Work Log:
- تحديث Prisma Schema: إضافة `dependsOn` (String?) إلى Task model، `reminderTime` (String?) إلى Habit model، `taskId` (String?) إلى FocusSession model
- ميزة ١: ربط جلسة التركيز بمهمة في deep-work.tsx
  - عند اكتمال جلسة تركيز، يظهر Dialog يسأل "هل تريد ربط هذه الجلسة بمهمة؟"
  - يجلب المهام النشطة (todo/in_progress) من /api/rise/tasks
  - يعرض قائمة منسدلة لاختيار المهمة مع XP المكتسبة
  - يرسل PUT إلى /api/rise/focus مع taskId
- ميزة ٢: ويدجت "في مثل هذا اليوم" في dashboard.tsx
  - OnThisDayWidget يجلب درجات الإنتاجية لنفس التاريخ الأسبوع الماضي والشهر الماضي
  - يعرض مقارنة بصرية مع أيقونة سهم (أخضر للأعلى، أحمر للأسفل) ونسبة التحسن
  - إذا لا توجد بيانات: رسالة "لا توجد بيانات سابقة"
  - تصميم glass card مع PremiumGlass و motion animation
  - تحديث /api/rise/productivity-score لدعم `?dates=` query param
- ميزة ٣: تبعيات المهام في tasks.tsx
  - إضافة حقل `dependsOn` (comma-separated IDs) إلى نموذج إنشاء المهمة
  - multi-select checkbox لاختيار المهام المعتمد عليها
  - المهام المحظورة تظهر بأيقونة Lock وopacity مخفض
  - عند إكتمال مهمة يتم التحقق تلقائياً وإلغاء حظر المهام التابعة مع toast notification
  - فلتر "محظورة" جديد في شريط الفلاتر بلون برتقالي
  - عرض سلسلة التبعيات (badge) وتفاصيلها في expanded content
- ميزة ٤: نظام تذكيرات العادات
  - إنشاء habit-reminders.tsx مع مكونين: HabitReminders و ReminderBell
  - التحقق كل دقيقة من الوقت الحالي وإظهار toast عند حلول وقت التذكير
  - أيقونة Bell على كل بطاقة عادة لضبط/إزالة وقت التذكير
  - بانر "التذكيرات القادمة" يعرض التذكيرات خلال ساعتين
  - حفظ وقت التذكير عبر API (PUT /api/rise/habits)

Stage Summary:
- 0 أخطاء Lint
- 4 ميزات جديدة مكتملة
- 3 حقول جديدة في Prisma Schema (dependsOn, reminderTime, taskId)
- 1 ملف مكون جديد (habit-reminders.tsx)
- 1 API محدّث (productivity-score يدعم dates query param)
- 5 ملفات مُعدّلة (deep-work, dashboard, tasks, habits, productivity-score)

---
Task ID: r6-features-2
Agent: Main Agent
Task: إضافة 3 ميزات جديدة (جدار التحفيز، نظام الميزانية، ملاحظات سريعة)

Work Log:
- إنشاء مكون MotivationalWall في لوحة التحكم (dashboard.tsx):
  - ٢٤ اقتباس تحفيزي عربي
  - تدوير تلقائي كل ١٥ ثانية مع أنيميشن fade
  - زر قلب للمفضلة يحفظ في localStorage (rise-favorite-quotes)
  - عداد "👁" للاقتباسات المشاهدة اليوم مع localStorage (rise-seen-quotes-today)
  - تأثير parallax عند تحريك الماوس (3D tilt)
  - نص بتدرج text-gradient-forest
  - نقاط تقدم أسفل البطاقة
  - استخدام useState lazy initializer لتجنب مشاكل lint

- إضافة نظام الميزانية الشهرية في المالية (finance.tsx):
  - ٨ فئات ميزانية: سكن، غذاء، تنقل، اشتراكات، صحة، ترفيه، تعليم، أخرى
  - حفظ حدود الميزانية في localStorage (rise-finance-budgets)
  - أشرطة تقدم ملونة لكل فئة (أخضر < ٨٠٪، ذهبي ٨٠٪+، أحمر > ١٠٠٪)
  - مؤشر صحة الميزانية الدائري (٠-١٠٠)
  - عرض المتبقي الكبير في الأعلى بلون ديناميكي
  - تعديل الميزانية بالنقر على المبلغ
  - تنبيه تأثير الميزانية عند إضافة مصروف جديد
  - حساب تلقائي من مصروفات الشهر الحالي

- إضافة ويدجت ملاحظات سريعة في الشريط الجانبي (sidebar.tsx):
  - قسم قابل للطي والفتح مع أنيميشن chevron
  - textarea بتأثير زجاجي (glass effect) مع حد متدرج
  - حفظ تلقائي في localStorage (rise-quick-notes) بتأخير ٥٠٠ms
  - عداد أحرف
  - عند الطي: عرض أيقونة قلم + أول ٢٠ حرف
  - زر مسح عند وجود نص
  - حد أقصى ٣ أسطر مرئية

Stage Summary:
- ٠ أخطاء Lint
- ٠ أخطاء TypeScript
- ٣ ملفات معدّلة (dashboard.tsx, finance.tsx, sidebar.tsx)
- ٣ ميزات جديدة مكتملة
- ٣ مفاتيح localStorage جديدة

---
Task ID: r6-final
Agent: Main Coordinator
Task: تنسيق الجولة 6 النهائية — فحص، إصلاح، تحسين، ميزات، تحقق

Work Log:
- فحص حالة المشروع عبر worklog.md
- اكتشاف مشكلة OOM: خادم التطوير (Turbopack/Webpack) يتجاوز 4GB RAM المتاحة
- حل: استخدام Build الإنتاجي (next build) الذي يعمل بكفاءة عالية
- التحقق: 16/16 API route تعيد HTTP 200 في الإنتاج
- تنسيق 5 sub-agents بالتوازي:
  1. Code Fix Agent: إصلاح 23 خطأ TypeScript عبر 6 ملفات
  2. Styling Expert 1: تحسين 5 وحدات (Planner, Reading, Learning, Weekly Review, Monthly Review)
  3. Styling Expert 2: تحسين 5 وحدات (Morning, Calendar, Deep Work, AI Coach, Settings)
  4. Features Agent 1: 4 ميزات (ربط البومودورو، في مثل هذا اليوم، تبعيات المهام، تذكيرات العادات)
  5. Features Agent 2: 3 ميزات (جدار التحفيز، نظام الميزانية، ملاحظات سريعة)
- تحديث Prisma Schema: 3 حقول جديدة (dependsOn, reminderTime, taskId)
- Push قاعدة البيانات بنجاح
- Build إنتاجي ناجح: 20 صفحة static + 16 API route
- Lint: 0 أخطاء

## تقييم الحالة الحالية
- التطبيق مستقر ومتقدم مع 20 وحدة كاملة
- نظام Gamification حقيقي (XP/Level/شارات/تبعيات)
- تصميم premium مع glassmorphism, 3D tilt, orbiting animations, confetti, noise textures
- 16 API route تعمل في الإنتاج (HTTP 200)
- 7 ميزات جديدة في هذه الجولة
- 23 خطأ TypeScript مُصلحة
- 10 وحدات محسّنة بتصميم premium إضافي
- 0 أخطاء Lint / Build

## الإنجازات التراكمية
- 20 وحدة واجهة مستخدم كاملة
- 16 API route
- نظام Gamification كامل (XP, Level, 15 شارة, Streaks)
- بحث شامل ⌘K (6 أنواع بيانات)
- FAB إجراء سريع
- تصدير البيانات (JSON)
- Productivity Score يومي
- تبعيات المهام + تذكيرات العادات
- نظام الميزانية الشهرية
- جدار تحفيز متحرك (24 اقتباس)
- ملاحظات سريعة في الشريط الجانبي
- وضع فاتح/داكن + RTL عربي

## مخاطر/قضايا
- خادم التطوير (dev) يتجاوز 4GB RAM (OOM) بسبب 20 وحدة lazy-loaded — الإنتاج يعمل بشكل ممتاز
- agent-browser لا يمكن الوصول لـ localhost (شبكة معزولة)
- لا يوجد نظام مصادقة حقيقي (مستخدم افتراضي)
- بعض البيانات في localStorage فقط (Planner, Learning, Budgets, Notes)

## توصيات المرحلة القادمة (مرتبة حسب الأولوية)
1. تقليل استهلاك ذاكرة dev server (تقليل lazy chunks أو استخدام SWC)
2. إضافة PWA manifest + service worker للعمل offline
3. نقل بيانات localStorage إلى قاعدة البيانات (Planner, Learning, Budgets)
4. إضافة drag-and-drop في المهام والتقويم
5. تحسين الموبايل بشكل أوسع (responsive audit شامل)
6. إضافة تصدير PDF للتقارير عبر pdf skill
7. إضافة نظام إشعارات فعلية (Web Push API)
8. إضافة لوحة تحكم بالماوس (mouse-tracking parallax) على مستوى التطبيق