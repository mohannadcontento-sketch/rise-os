import { test, expect } from '@playwright/test'
import { consentedSignupPayload } from './helpers'

// حجب Service Worker داخل هذه المجموعة فقط: الشبكة المراقبة
// (route.fulfill لاختبار حالة الخطأ) يجب أن ترى طلبات الصفحة نفسها
// لا نسخة يعيد إصدارها الـSW فتفلت من الاعتراض.
test.use({ serviceWorkers: 'block' })

// ============================================================
// core-modules.spec.ts — المرحلة ١٩: إعادة تشكيل الوحدات الأساسية
//
// عقود الخطة (Master Plan Phase 19):
//   ١) Analytics: الرسوم تبدأ من التجميع — طلب واحد إلى
//      /api/rise/analytics لا تنزيل سجلات خام (habits/focus/health)
//   ٢) Tasks + Today: مرشّح «اليوم» (مستحق اليوم + المتأخرة)
//   ٣) Habits streak rings: قوس حلقي حول اللهب في بطاقة العادة
//   ٤) Health/Finance: تخطيطات حساسة للخصوصية — زر عين يقنّع
//      المبالغ والقراءات (وبلا إعلانات داخل هذه الوحدات أصلًا)
//   ٥) Per-module CRUD regression + Idempotency لكل طفرة
//   ٦) Error/empty states لكل وحدة (لافتة فشل الجلب + إعادة محاولة)
//   ٧) Performance smoke: أكبر قائمة (١٢٠ مهمة) ترسم ضمن الميزانية
//
// البيئة: dev server (وضع mock) — نفس أنماط home/explore.spec.
// ============================================================

let userSeq = 0
const uniqueEmail = () => `e2e19-${Date.now()}-${++userSeq}@awj.test`
const TEST_PASSWORD = 'phase19-strong-pass-1'

const GREETING = /صباح الخير|نهارك سعيد|مساء الخير/

/** جلسة جاهزة عبر الـAPI + تخطي التعريف + موافقة الإعلانات */
async function login(page: import('@playwright/test').Page) {
  const email = uniqueEmail()
  let res: import('@playwright/test').APIResponse | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    res = await page.request.post('/api/auth/signup', {
      data: consentedSignupPayload(email, TEST_PASSWORD, 'مختبر المرحلة ١٩'),
    })
    if (res.ok() || res.status() !== 429) break
    await page.waitForTimeout(65000)
  }
  expect(res && res.ok(), `signup API: ${res ? res.status() : 'none'}`).toBeTruthy()

  await page.goto('/app')
  // التعريف الترحيبي أولًا (مودال ز-أعلى) — لافتة موافقة الإعلانات
  // تحمل role=dialog أيضًا فالسباق العشوائي بينهما كان يترك المودال
  // مفتوحًا فوق زر «موافقة» فيعلق النقر. هنا: كل واحد بترتيبه.
  const onboarding = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('button', { name: 'تخطي التعريف' }) })
  await onboarding.waitFor({ state: 'visible', timeout: 25000 }).catch(() => { /* مستخدم عائد */ })
  if (await onboarding.isVisible().catch(() => false)) {
    await onboarding.getByRole('button', { name: 'تخطي التعريف' }).click()
    await expect(onboarding).toBeHidden({ timeout: 10000 })
  }
  const consent = page.locator('[aria-label="موافقة الإعلانات"]')
  await consent.waitFor({ state: 'visible', timeout: 15000 }).catch(() => { /* Free فقط */ })
  if (await consent.isVisible().catch(() => false)) {
    await consent.getByRole('button', { name: 'موافقة' }).click()
    await consent.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
  }
  await expect(page.locator('h1').filter({ hasText: GREETING })).toBeVisible({ timeout: 30000 })
}

/** مفتاح إدماج فريد للطفرات عبر الـAPI */
const idemKey = () => `e2e19-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test.describe('المرحلة 19 — الوحدات الأساسية', () => {
  test('التحليلات: طلب مجمّع واحد — لا تنزيل سجلات خام', async ({ page }) => {
    test.setTimeout(150_000)
    await login(page)

    // ── الدليل القاطع: نحجب كل المجالات الخام (500) ولا نسمح إلا
    // بالمسار المجمع — إن رسمت الوحدة كاملة فبياناتها منه وحده،
    // لا من تنزيل سجلات العادات/التركيز/الصحة/اللوحة.
    await page.route(
      /\/api\/rise\/(habits|focus|health|dashboard)/,
      (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"blocked"}' }),
    )

    const analyticsCalls: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/rise/analytics')) analyticsCalls.push(req.url())
    })

    await page.goto('/app?module=analytics')
    await expect(page.getByRole('heading', { name: 'التحليلات' }).first()).toBeVisible({ timeout: 30000 })

    // الطلب المجمع صدر فعلًا — poll: الحزمة lazy قد تتأخر لحظة في وضع dev
    await expect
      .poll(() => analyticsCalls.length, { timeout: 20000 })
      .toBeGreaterThanOrEqual(1)

    // بطاقات KPI الأربعة تُرسم من الحمولة المجمّعة رغم حجب الخام
    for (const label of ['إجمالي الخبرة', 'المهام المنجزة', 'ساعات التركيز', 'السلسلة الحالية']) {
      await expect(page.getByText(label).first()).toBeVisible({ timeout: 15000 })
    }

    // الرسوم تُرسم (recharts) — بلا لافتة فشل خاصة بالتحليلات
    await expect(page.locator('.recharts-responsive-container').first()).toBeVisible({ timeout: 20000 })
    await expect(page.getByText('تعذر تحميل التحليلات')).toHaveCount(0)

    // تبديل الفترة = طلب نافذة جديدة (٣٠ يومًا) من نفس المسار المجمع
    const before = analyticsCalls.length
    await page.locator('main').getByRole('button', { name: 'شهري' }).click()
    await expect
      .poll(() => analyticsCalls.length, { timeout: 20000 })
      .toBeGreaterThanOrEqual(before + 1)
  })

  test('المهام + اليوم: المرشّح والعدّاد والحالة الفارغة', async ({ page }) => {
    test.setTimeout(150_000)
    await login(page)

    // ── الحالة الفارغة (مستخدم جديد): دعوة واضحة بلا لوم ──
    await page.goto('/app?module=tasks')
    await expect(page.getByRole('heading', { name: 'المهام' })).toBeVisible({ timeout: 30000 })
    await expect(page.getByText('لا توجد مهام بعد').first()).toBeVisible({ timeout: 20000 })

    // ── بيانات: مهمة مستحقة اليوم + مهمة بعد شهر ──
    const nextMonth = new Date()
    nextMonth.setMonth(nextMonth.getMonth() + 1)
    const futureStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-${String(nextMonth.getDate()).padStart(2, '0')}`

    await page.request.post('/api/rise/tasks', {
      headers: { 'Idempotency-Key': idemKey() },
      data: { title: 'مهمة مستحقة اليوم', priority: 'high', dueDate: todayStr() },
    })
    await page.request.post('/api/rise/tasks', {
      headers: { 'Idempotency-Key': idemKey() },
      data: { title: 'مهمة بعد شهر', priority: 'low', dueDate: futureStr },
    })

    await page.reload()
    await expect(page.getByText('مهمة مستحقة اليوم').first()).toBeVisible({ timeout: 30000 })

    // ── رقاقة «اليوم»: عدّاد ١ وتصفية فورية ──
    const todayChip = page.getByRole('button', { name: 'مرشّح اليوم' })
    await expect(todayChip).toBeVisible()
    await expect(todayChip).toContainText('١')
    await todayChip.click()

    await expect(page.getByText('مهمة مستحقة اليوم').first()).toBeVisible()
    await expect(page.getByText('مهمة بعد شهر')).toHaveCount(0)

    // إلغاء المرشّح يعيد الكل
    await todayChip.click()
    await expect(page.getByText('مهمة بعد شهر').first()).toBeVisible({ timeout: 15000 })

    // ── الحالة الفارغة الخاصة بالمرشّح: لا شيء مستحق اليوم ──
    // (ننجز مهمة اليوم ثم نعيد تشغيل المرشّح)
    const tasks = await page.request.get('/api/rise/tasks')
    const tasksJson = (await tasks.json()).tasks as Array<{ id: string; title: string }>
    const todayTask = tasksJson.find((t) => t.title === 'مهمة مستحقة اليوم')
    expect(todayTask, 'المهمة في القائمة').toBeTruthy()
    await page.request.put(`/api/rise/tasks?id=${todayTask!.id}`, {
      headers: { 'Idempotency-Key': idemKey() },
      data: { id: todayTask!.id, status: 'done' },
    })

    await page.reload()
    await expect(page.getByRole('heading', { name: 'المهام' }).first()).toBeVisible({ timeout: 30000 })
    await page.getByRole('button', { name: 'مرشّح اليوم' }).click()
    await expect(page.getByText('لا شيء مستحق اليوم').first()).toBeVisible({ timeout: 15000 })
    // صفر لغة لوم في نص الحالة الفارغة
    const section = await page.locator('main').first().textContent()
    expect(section).not.toContain('فشلت')
  })

  test('الخطأ + الحلقات + الخصوصية: لافتة الجلب وحلقة السلسلة وزر العين', async ({ page }) => {
    test.setTimeout(150_000)
    await login(page)

    // ── حالة الخطأ (مصفوفة المرحلة 16 §7): فشل الجلب → لافتة + إعادة محاولة ──
    await page.route('**/api/rise/tasks**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"mock"}' }),
    )
    await page.goto('/app?module=tasks')
    await expect(page.getByText('تعذر تحميل أحدث بيانات المهام').first()).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole('button', { name: 'إعادة المحاولة' }).first()).toBeVisible()
    await page.unroute('**/api/rise/tasks**')

    // ── العادات: حلقة السلسلة داخل بطاقة العادة ──
    await page.request.post('/api/rise/habits', {
      headers: { 'Idempotency-Key': idemKey() },
      data: { name: 'قراءة قبل النوم', icon: 'book', color: '#10B981', frequency: 'daily', targetCount: 1, xpReward: 5 },
    })
    await page.goto('/app?module=habits')
    await expect(page.getByRole('heading', { name: 'العادات' }).first()).toBeVisible({ timeout: 30000 })
    const habitCard = page.locator('.card, [class*="rounded-3xl"]').filter({ hasText: 'قراءة قبل النوم' }).first()
    await expect(habitCard).toBeVisible({ timeout: 20000 })
    // قوس SVG (حلقة السلسلة) داخل رقاقة السلسلة
    await expect(habitCard.locator('svg circle').first()).toBeVisible()

    // تسجيل العادة اليوم → النص «يوم» في الرقاقة (سلسلة ١)
    await habitCard.getByRole('button', { name: /تسجيل|إتمام|أكملت/ }).first().click()
    await expect(habitCard.getByText('يوم').first()).toBeVisible({ timeout: 15000 })

    // ── المالية: زر العين يقنّع كل المبالغ ──
    await page.request.post('/api/rise/finance', {
      headers: { 'Idempotency-Key': idemKey() },
      data: { type: 'دخل', amount: 5400, date: todayStr(), category: 'راتب' },
    })
    await page.goto('/app?module=finance')
    await expect(page.getByRole('heading', { name: 'المالية' }).first()).toBeVisible({ timeout: 30000 })
    await expect(page.getByText('٥٬٤٠٠').first()).toBeVisible({ timeout: 20000 })

    const financeEye = page.getByRole('button', { name: 'إخفاء المبالغ' })
    await expect(financeEye).toBeVisible()
    await financeEye.click()
    await expect(page.getByText('••••').first()).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: 'إظهار المبالغ' }).click()
    await expect(page.getByText('٥٬٤٠٠').first()).toBeVisible({ timeout: 10000 })

    // ── الصحة: زر العين يقنّع قراءات اليوم ──
    await page.request.post('/api/rise/health', {
      headers: { 'Idempotency-Key': idemKey() },
      data: { date: todayStr(), sleepHours: 7, waterGlasses: 6, steps: 8200 },
    })
    await page.goto('/app?module=health')
    await expect(page.getByRole('heading', { name: 'الصحة' }).first()).toBeVisible({ timeout: 30000 })
    await expect(page.getByText(/٨٬٢٠٠|٨,٢٠٠|8,200/).first()).toBeVisible({ timeout: 20000 })
    await page.getByRole('button', { name: 'إخفاء القراءات' }).click()
    await expect(page.getByText('خطوات ••').first()).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: 'إظهار القراءات' }).click()
    await expect(page.getByText(/٨٬٢٠٠|٨,٢٠٠|8,200/).first()).toBeVisible({ timeout: 10000 })
  })

  test('CRUD + Idempotency لكل طفرة + أداء أكبر قائمة', async ({ page }) => {
    // نافذة backoff للتسجيل (٦٥ث) + بذر ١٢٠ مهمة على دفعات تحتاج ميزانية أرحب
    test.setTimeout(300_000)
    await login(page)

    const post = (url: string, data: object, key = idemKey()) =>
      page.request.post(url, { headers: { 'Idempotency-Key': key }, data })
    const put = (url: string, data: object, key = idemKey()) =>
      page.request.put(url, { headers: { 'Idempotency-Key': key }, data })
    const del = (url: string, key = idemKey()) =>
      page.request.delete(url, { headers: { 'Idempotency-Key': key } })

    // ── ١) المهام: إنشاء → تحديث → حذف ──
    let res = await post('/api/rise/tasks', { title: 'مهمة فحص CRUD', priority: 'medium' })
    expect(res.status()).toBeLessThan(300)
    const task = await res.json()
    res = await put(`/api/rise/tasks?id=${task.id}`, { id: task.id, status: 'done' })
    expect(res.status()).toBeLessThan(300)
    res = await del(`/api/rise/tasks?id=${task.id}`)
    expect(res.status()).toBeLessThan(300)
    const tasksList = await (await page.request.get('/api/rise/tasks')).json()
    expect(tasksList.tasks.some((t: { id: string }) => t.id === task.id)).toBe(false)

    // ── ٢) العادات: إنشاء → تسجيل اليوم → حذف ──
    res = await post('/api/rise/habits', { name: 'عادة فحص', icon: 'zap', color: '#F59E0B' })
    expect(res.status()).toBeLessThan(300)
    const habit = await res.json()
    res = await put('/api/rise/habits', { habitId: habit.id, date: todayStr(), completed: true, count: 1 })
    expect(res.status()).toBeLessThan(300)
    res = await del(`/api/rise/habits?id=${habit.id}`)
    expect(res.status()).toBeLessThan(300)

    // ── ٣) الأهداف: إنشاء → معلم → حذف ──
    res = await post('/api/rise/goals', { title: 'هدف فحص', type: 'personal' })
    expect(res.status()).toBeLessThan(300)
    const goal = await res.json()
    res = await post('/api/rise/goals', { goalId: goal.id, milestoneTitle: 'معلم فحص' })
    expect(res.status()).toBeLessThan(300)
    res = await del(`/api/rise/goals?id=${goal.id}`)
    expect(res.status()).toBeLessThan(300)

    // ── ٤) اليوميات + المالية + الصحة + القراءة + المعرفة ──
    res = await post('/api/rise/journal', { content: 'يومية فحص المرحلة ١٩' })
    expect(res.status()).toBeLessThan(300)

    res = await post('/api/rise/finance', { type: 'مصروف', amount: 75, date: todayStr(), category: 'طعام', description: 'فحص' })
    expect(res.status()).toBeLessThan(300)
    const record = await res.json()
    res = await del(`/api/rise/finance?id=${record.id}`)
    expect(res.status()).toBeLessThan(300)

    res = await post('/api/rise/health', { date: todayStr(), sleepHours: 8, waterGlasses: 8, mood: 4 })
    expect(res.status()).toBeLessThan(300)

    res = await post('/api/rise/books', { title: 'كتاب فحص', author: 'مختبر', type: 'book', totalPages: 200, currentPage: 50 })
    expect(res.status()).toBeLessThan(300)
    const book = await res.json()
    res = await del(`/api/rise/books?id=${book.id}`)
    expect(res.status()).toBeLessThan(300)

    res = await post('/api/rise/knowledge', { title: 'ملاحظة فحص', content: 'محتوى', type: 'note' })
    expect(res.status()).toBeLessThan(300)
    const note = await res.json()
    res = await del(`/api/rise/knowledge?id=${note.id}`)
    expect(res.status()).toBeLessThan(300)

    // ── ٥) Idempotency: نفس المفتاح مرتين = سجل واحد ──
    const sameKey = idemKey()
    await post('/api/rise/tasks', { title: 'مهمة إدماج مزدوجة' }, sameKey)
    await post('/api/rise/tasks', { title: 'مهمة إدماج مزدوجة' }, sameKey)
    const idemList = await (await page.request.get('/api/rise/tasks')).json()
    const dup = idemList.tasks.filter((t: { title: string }) => t.title === 'مهمة إدماج مزدوجة')
    expect(dup.length, 'الطفرة المكررة بالمفتاح نفسه لا تنشئ سجلًا ثانيًا').toBe(1)
    await del(`/api/rise/tasks?id=${dup[0].id}`)

    // ── ٦) Performance smoke: ١٢٠ مهمة في القائمة ──
    // البذر التسلسلي — SQLite (وضع dev/mock) + معاملة الإدماج لكل طفرة
    // لا يتحملان الكتابة المتوازية (تنتهي صلاحية معاملة ٥ ثوان بالازدحام)
    const t0 = Date.now()
    for (let i = 1; i <= 120; i++) {
      const r = await post('/api/rise/tasks', { title: `مهمة حمل ${i}`, priority: 'low' })
      expect(r.status(), `بذر المهمة ${i}`).toBeLessThan(300)
    }
    const seedMs = Date.now() - t0

    const t1 = Date.now()
    await page.goto('/app?module=tasks')
    // العناوين تُخزَّن كما أُرسلت — أرقام لاتينية (تحويل الأرقام العربية
    // يخص عناصر .num فقط) فالمطابقة هنا باللاتينية
    await expect(page.getByText('مهمة حمل 1').first()).toBeVisible({ timeout: 30000 })
    await expect(page.getByText('مهمة حمل 120').first()).toBeVisible({ timeout: 30000 })
    const renderMs = Date.now() - t1

    // الميزانية: القائمة الكاملة (١٢٠ صفًا) ترسم خلال أقل من ١٢ ثانية
    // في وضع dev (بلا تحسينات الإنتاج) — الإنتاج أسرع بكثير
    expect(renderMs, `رسم ١٢٠ مهمة استغرق ${renderMs}ms (الزرع ${seedMs}ms)`).toBeLessThan(12_000)
  })
})
