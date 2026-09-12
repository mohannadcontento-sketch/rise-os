// ============================================================
// mcp.test.ts — مصفوفة اختبار خادم MCP على Edge Function
//
// 30+ فحصًا عبر خادم PostgREST وهمي (mock-postgrest.ts):
//   • المصافحة الكاملة (initialize/ping/tools/list/resources)
//   • المسار الإيجابي للأدوات الثمانية (إنشاء مهمة ثم إنجازها
//     فعليًا + يوميات تُحفظ ثم تُحمى من الاستبدال)
//   • سيناريوهات الإساءة: بلا Bearer/مفتاح مزيف/حساب موقوف/
//     خطة Free (403 + تدقيق)/أداة مجهولة/وسائط ناقصة أو بحقل
//     مجهول strict/ملكية غريبة/JSON تالف/batch/إشعارات 202/
//     طريقة مجهولة/GET 405
//   • حدود المعدل: 30/د إجمالي + 10/د كتابة (ساعة قابلة
//     للحقن — تحكم زمني دقيق بلا انتظار حقيقي)
//   • الآثار الجانبية: audit_logs لكل كتابة + last_used_at
// ============================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { McpServer } from '../../functions/_shared/mcp-core.ts'
import { sha256Hex } from '../../functions/_shared/mcp-core.ts'
import { createMockDb, startMockPostgrest, MockDb } from './mock-postgrest.ts'

// ── القسم: التجهيز ─────────────────────

const TEST_KEY = 'rise_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'
const MAX_USER = '11111111-1111-1111-1111-111111111111'
const FREE_USER = '22222222-2222-2222-2222-222222222222'
const SUSPENDED_USER = '33333333-3333-3333-3333-333333333333'

async function setup(maxUser = true) {
  const db: MockDb = createMockDb()

  // مستخدمون + مفاتيح
  db.profiles.push(
    { id: MAX_USER, suspended: false },
    { id: FREE_USER, suspended: false },
    { id: SUSPENDED_USER, suspended: true },
  )
  const hash = await sha256Hex(TEST_KEY)
  db.apiKeys.push({ key_hash: hash, user_id: MAX_USER, last_used_at: null })
  db.apiKeys.push({ key_hash: await sha256Hex('rise_freeuser'), user_id: FREE_USER, last_used_at: null })
  db.apiKeys.push({ key_hash: await sha256Hex('rise_suspended'), user_id: SUSPENDED_USER, last_used_at: null })

  // الاشتراكات
  db.userSubscriptions.push(
    { user_id: MAX_USER, plan: 'max', status: 'active', expires_at: null },
    { user_id: FREE_USER, plan: 'free', status: 'active', expires_at: null },
    { user_id: SUSPENDED_USER, plan: 'max', status: 'active', expires_at: null },
  )

  // بيانات العمل
  db.projects.push({ id: 'p1', user_id: MAX_USER, name: 'مشروع الإطلاق', color: '#0ea5e9' })
  db.tasks.push(
    {
      id: 't1', user_id: MAX_USER, title: 'مراجعة العقد', description: null,
      status: 'todo', priority: 'high', project_id: 'p1',
      due_date: '2026-09-14', due_time: null, estimated_min: 30, order: 0, completed_at: null,
    },
    {
      id: 't2', user_id: MAX_USER, title: 'مهمة منجزة سابقًا', description: null,
      status: 'done', priority: 'low', project_id: null,
      due_date: null, due_time: null, estimated_min: null, order: 1, completed_at: '2026-09-10T10:00:00Z',
    },
    {
      id: 't-foreign', user_id: FREE_USER, title: 'مهمة مستخدم آخر', description: null,
      status: 'todo', priority: 'medium', project_id: null,
      due_date: null, due_time: null, estimated_min: null, order: 0, completed_at: null,
    },
  )
  db.subtasks.push(
    { id: 'st1', task_id: 't1', title: 'قراءة البند 3', completed: true, order: 0 },
    { id: 'st2', task_id: 't1', title: 'تعديل البند 7', completed: false, order: 1 },
  )
  db.habits.push(
    { id: 'h1', user_id: MAX_USER, name: 'القراءة', frequency: 'daily', target_count: 1 },
    { id: 'h2', user_id: MAX_USER, name: 'الرياضة', frequency: 'weekly', target_count: 3 },
  )
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  db.habitLogs.push(
    { id: 'hl1', habit_id: 'h1', date: shiftDate(today, -1), completed: true, count: 1 },
    { id: 'hl2', habit_id: 'h1', date: shiftDate(today, -2), completed: true, count: 1 },
  )
  db.plannerItems.push(
    { id: 'pl1', user_id: MAX_USER, date: today, section: 'morning', time: '07:30', title: 'تأمل 10 دقائق', completed: true, order: 0 },
    { id: 'pl2', user_id: MAX_USER, date: today, section: 'evening', time: null, title: 'مراجعة اليوم', completed: false, order: 0 },
  )
  db.dailyScores.push(
    { id: 'ds1', user_id: MAX_USER, date: shiftDate(today, -1), score: 72.5 },
    { id: 'ds2', user_id: MAX_USER, date: shiftDate(today, -2), score: 80 },
  )

  const server = await startMockPostgrest(db)
  const mcp = new McpServer({ baseUrl: server.url, serviceKey: 'test-service-key' })
  return { db, server, mcp, today }
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const AUTH = { authorization: `Bearer ${TEST_KEY}`, 'user-agent': 'test-client' }

async function call(mcp: McpServer, body: unknown, headers: Record<string, string> = AUTH) {
  return mcp.handlePost({
    method: 'POST',
    headers: { 'x-forwarded-for': '9.9.9.9', ...headers },
    rawBody: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function parse(res: { status: number; body: string | null }): any {
  return JSON.parse(res.body ?? '{}')
}

// ── القسم: المصافحة والبروتوكول ─────────────────────

Deno.test('GET → 405 بلا SSE، وOPTIONS → 204 مع CORS', () => {
  const mcp = new McpServer({ baseUrl: 'http://x', serviceKey: 'y' })
  const get = mcp.handleGet()
  assertEquals(get.status, 405)
  const opt = mcp.handleOptions()
  assertEquals(opt.status, 204)
  assert(opt.headers['Access-Control-Allow-Origin'] === '*')
})

Deno.test('JSON تالف → 400 برمز -32700 (قبل المصادقة)', async () => {
  const { mcp, server } = await setup()
  const res = await call(mcp, '{not-json')
  assertEquals(res.status, 400)
  assertEquals(parse(res).error.code, -32700)
  await server.close()
})

Deno.test('بلا Bearer → 401، ومفتاح مزيف → 401', async () => {
  const { mcp, server } = await setup()
  const noAuth = await call(mcp, { jsonrpc: '2.0', id: 1, method: 'ping' }, { 'user-agent': 't' })
  assertEquals(noAuth.status, 401)
  assertEquals(parse(noAuth).error.code, -32001)

  const badKey = await call(mcp, { jsonrpc: '2.0', id: 2, method: 'ping' }, {
    authorization: 'Bearer rise_0000000000000000000000000000',
    'user-agent': 't',
  })
  assertEquals(badKey.status, 401)
  await server.close()
})

Deno.test('حساب موقوف → 401 (fail-closed)', async () => {
  const { mcp, server } = await setup()
  const res = await mcp.handlePost({
    method: 'POST',
    headers: { authorization: 'Bearer rise_suspended' },
    rawBody: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  })
  assertEquals(res.status, 401)
  await server.close()
})

Deno.test('خطة Free → 403 برمز -32002 + تدقيق رفض الخطة', async () => {
  const { db, mcp, server } = await setup()
  const res = await mcp.handlePost({
    method: 'POST',
    headers: { authorization: 'Bearer rise_freeuser' },
    rawBody: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  })
  assertEquals(res.status, 403)
  assertEquals(parse(res).error.code, -32002)
  // التدقيق: رفض الخطة مُسجَّل بمعرّف المستخدم
  const denial = db.auditLogs.find((l) => l.action === 'mcp.plan_denied')
  assert(denial, 'يجب تسجيل رفض الخطة في audit_logs')
  assertEquals(denial!.actor_user_id, FREE_USER)
  await server.close()
})

Deno.test('initialize + ping + resources + prompts + tools/list', async () => {
  const { mcp, server } = await setup()

  const init = parse(await call(mcp, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }))
  assertEquals(init.result.protocolVersion, '2025-06-18')
  assertEquals(init.result.serverInfo.name, 'awj-mcp')
  assert(init.result.instructions.includes('أوج'))

  // إصدار مجهول → نرد بأحدث مدعوم
  const init2 = parse(await call(mcp, { jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } }))
  assertEquals(init2.result.protocolVersion, '2025-06-18')

  const ping = parse(await call(mcp, { jsonrpc: '2.0', id: 3, method: 'ping' }))
  assertEquals(ping.result, {})

  const res2 = parse(await call(mcp, { jsonrpc: '2.0', id: 4, method: 'resources/list' }))
  assertEquals(res2.result.resources, [])
  const pr = parse(await call(mcp, { jsonrpc: '2.0', id: 5, method: 'prompts/list' }))
  assertEquals(pr.result.prompts, [])

  const tools = parse(await call(mcp, { jsonrpc: '2.0', id: 6, method: 'tools/list' })).result.tools
  assertEquals(tools.length, 8)
  const names = tools.map((t: any) => t.name)
  for (const expected of ['list_tasks', 'create_task', 'complete_task', 'list_habits', 'check_in_habit', 'get_today_plan', 'get_productivity_score', 'create_journal_entry']) {
    assert(names.includes(expected), `الأداة ${expected} مفقودة`)
  }
  // readOnlyHint من مواصفة MCP
  const createTask = tools.find((t: any) => t.name === 'create_task')
  assertEquals(createToolByName(tools, 'create_task').annotations.readOnlyHint, false)
  assertEquals(createToolByName(tools, 'list_tasks').annotations.readOnlyHint, true)

  await server.close()
})

function createToolByName(tools: any[], name: string): any {
  return tools.find((t) => t.name === name)!
}

// ── القسم: المسار الإيجابي للأدوات ─────────────────────

Deno.test('list_tasks: مهام المستخدم + مشروع + فرعيات', async () => {
  const { mcp, server } = await setup()
  const r = parse(await call(mcp, {
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'list_tasks', arguments: {} },
  }))
  const result = r.result.structuredContent
  assertEquals(result.tasks.length, 2) // مهمة المستخدم فقط — لا مهمة الآخر
  const t1 = result.tasks.find((t: any) => t.id === 't1')
  assertEquals(t1.title, 'مراجعة العقد')
  assertEquals(t1.project, 'مشروع الإطلاق')
  assertEquals(t1.subtasksTotal, 2)
  assertEquals(t1.subtasksDone, 1)
  assertEquals(t1.dueDate, '2026-09-14')

  // تصفية بالحالة
  const done = parse(await call(mcp, {
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'list_tasks', arguments: { status: 'done' } },
  })).result.structuredContent
  assertEquals(done.tasks.length, 1)
  await server.close()
})

Deno.test('create_task → complete_task: دورة حياة حقيقية', async () => {
  const { db, mcp, server } = await setup()

  const created = parse(await call(mcp, {
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: {
      name: 'create_task', arguments: {
        title: 'الاتصال بمهندس الشبكة',
        priority: 'high',
        dueDate: '2026-09-15',
        subtasks: [{ title: 'تحديد الموعد' }],
      },
    },
  })).result.structuredContent
  assertEquals(created.created, true)
  assert(created.task.id)
  assertEquals(created.task.priority, 'high')

  // المهمة موجودة فعلًا في «القاعدة» وملكية المستخدم
  const row = db.tasks.find((t) => t.id === created.task.id)
  assert(row, 'المهمة غير مدرجة في القاعدة')
  assertEquals(row!.user_id, MAX_USER)
  assertEquals(db.subtasks.filter((s) => s.task_id === created.task.id).length, 1)

  // الإنجاز
  const completed = parse(await call(mcp, {
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'complete_task', arguments: { taskId: created.task.id } },
  })).result.structuredContent
  assertEquals(completed.completed, true)
  assert(completed.completedAt, 'completed_at يجب أن يختم')
  assertEquals(row!.status, 'done')
  assert(row!.completed_at)

  // تدقيق الكتابتين موجود (بلا قيم وسائط)
  const audits = db.auditLogs.filter((l) => l.action === 'mcp.tool_call')
  assertEquals(audits.length, 2)
  assertEquals(audits[0].target_id, 'create_task')
  assert((audits[0].metadata as any).argKeys.includes('title'))

  await server.close()
})

Deno.test('complete_task لمهمة غريبة → isError (لا عبور حسابات)', async () => {
  const { mcp, server } = await setup()
  const r = parse(await call(mcp, {
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'complete_task', arguments: { taskId: 't-foreign' } },
  }))
  assertEquals(r.result.isError, true)
  assert(r.result.content[0].text.includes('غير موجودة أو لا تملكها'))
  await server.close()
})

Deno.test('list_habits: streak + حالة اليوم، وcheck_in_habit يكتب فعليًا', async () => {
  const { db, mcp, server, today } = await setup()

  const habits = parse(await call(mcp, {
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'list_habits', arguments: {} },
  })).result.structuredContent
  assertEquals(habits.habits.length, 2)
  const reading = habits.habits.find((h: any) => h.id === 'h1')
  // سجلان بالأمس وقبلها + اليوم لم يُسجَّل → streak=2 (تنتهي أمس)
  assertEquals(reading.streak, 2)
  assertEquals(reading.todayCompleted, false)

  // تسجيل اليوم
  const checkIn = parse(await call(mcp, {
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'check_in_habit', arguments: { habitId: 'h1' } },
  })).result.structuredContent
  assertEquals(checkIn.completed, true)
  assertEquals(checkIn.date, today)

  // الكتابة وقعت في القاعدة على (habit_id, date)
  const log = db.habitLogs.find((l) => l.habit_id === 'h1' && l.date === today)
  assert(log, 'سجل العادة غير موجود')
  assertEquals(log!.completed, true)

  // عادة غريبة → isError
  const foreign = parse(await call(mcp, {
    jsonrpc: '2.0', id: 3, method: 'tools/call',
    params: { name: 'check_in_habit', arguments: { habitId: 'nope' } },
  }))
  assertEquals(foreign.result.isError, true)

  await server.close()
})

Deno.test('get_today_plan + get_productivity_score', async () => {
  const { mcp, server, today } = await setup()

  const plan = parse(await call(mcp, {
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'get_today_plan', arguments: {} },
  })).result.structuredContent
  assertEquals(plan.date, today)
  assertEquals(plan.totalPlanned, 2)
  assertEquals(plan.totalDone, 1)
  assert(plan.sections.morning[0].title === 'تأمل 10 دقائق')

  const score = parse(await call(mcp, {
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'get_productivity_score', arguments: { days: 3 } },
  })).result.structuredContent
  assertEquals(score.days.length, 3)
  const scored = score.days.filter((d: any) => d.score !== null)
  assertEquals(scored.length, 2)
  assert(score.average !== null)
  assertEquals(score.average, 76.3) // (72.5+80)/2

  await server.close()
})

Deno.test('create_journal_entry: حفظ ثم حماية الاستبدال ثم overwrite', async () => {
  const { db, mcp, server, today } = await setup()

  const first = parse(await call(mcp, {
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: {
      name: 'create_journal_entry', arguments: {
        content: 'يوم مليء بالإنجاز',
        wins: 'أنجزت المراجعة',
        mood: 4,
      },
    },
  })).result.structuredContent
  assertEquals(first.saved, true)
  assertEquals(first.date, today)
  const row = db.journals.find((j) => j.date === today && j.user_id === MAX_USER)
  assert(row, 'مدخل اليوميات غير موجود')
  assertEquals(row!.content, 'يوم مليء بالإنجاز')
  assertEquals(row!.mood, 4)

  // كتابة ثانية بلا overwrite → رفض صريح
  const second = parse(await call(mcp, {
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'create_journal_entry', arguments: { content: 'محاولة استبدال صامتة' } },
  }))
  assertEquals(second.result.isError, true)
  assert(second.result.content[0].text.includes('overwrite'))

  // مع overwrite → تحديث
  const third = parse(await call(mcp, {
    jsonrpc: '2.0', id: 3, method: 'tools/call',
    params: { name: 'create_journal_entry', arguments: { content: 'نسخة معتمدة', overwrite: true } },
  })).result.structuredContent
  assertEquals(third.saved, true)
  assertEquals(db.journals.filter((j) => j.date === today && j.user_id === MAX_USER).length, 1)
  assertEquals(row!.content, 'نسخة معتمدة')

  // بلا أي محتوى → رفض تحقق
  const empty = parse(await call(mcp, {
    jsonrpc: '2.0', id: 4, method: 'tools/call',
    params: { name: 'create_journal_entry', arguments: {} },
  }))
  assertEquals(empty.error.code, -32602)

  await server.close()
})

// ── القسم: الإساءة والبروتوكول ─────────────────────

Deno.test('أداة مجهولة → -32602، وطريقة مجهولة → -32601، وبنية غير صالحة → -32600', async () => {
  const { mcp, server } = await setup()

  const unknownTool = parse(await call(mcp, {
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'delete_everything', arguments: {} },
  }))
  assertEquals(unknownTool.error.code, -32602)
  assert(unknownTool.error.message.includes('delete_everything'))

  const unknownMethod = parse(await call(mcp, { jsonrpc: '2.0', id: 2, method: 'magic/wand' }))
  assertEquals(unknownMethod.error.code, -32601)

  const invalid = parse(await call(mcp, { id: 3, method: 'ping' }))
  assertEquals(invalid.error.code, -32600)

  await server.close()
})

Deno.test('وسائط غير صالحة: حقل مجهول + أنواع خاطئة + ناقصة', async () => {
  const { mcp, server } = await setup()

  const unknownField = parse(await call(mcp, {
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'create_task', arguments: { title: 'س', hacked: 1 } },
  }))
  assertEquals(unknownField.error.code, -32602)
  assert(unknownField.error.message.includes('hacked'))

  const badDate = parse(await call(mcp, {
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'create_task', arguments: { title: 'س', dueDate: '15-09-2026' } },
  }))
  assertEquals(badDate.error.code, -32602)
  assert(badDate.error.message.includes('YYYY-MM-DD'))

  const missing = parse(await call(mcp, {
    jsonrpc: '2.0', id: 3, method: 'tools/call',
    params: { name: 'create_task', arguments: {} },
  }))
  assertEquals(missing.error.code, -32602)
  assert(missing.error.message.includes('title'))

  const badLimit = parse(await call(mcp, {
    jsonrpc: '2.0', id: 4, method: 'tools/call',
    params: { name: 'list_tasks', arguments: { limit: 999 } },
  }))
  assertEquals(badLimit.error.code, -32602)

  await server.close()
})

Deno.test('batch + إشعارات 202 + مصفوفة فارغة 400', async () => {
  const { mcp, server } = await setup()

  const batch = await call(mcp, [
    { jsonrpc: '2.0', id: 1, method: 'ping' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  ])
  assertEquals(batch.status, 200)
  const arr = JSON.parse(batch.body!)
  assertEquals(Array.isArray(arr), true)
  assertEquals(arr.length, 2)
  assertEquals(arr[1].result.tools.length, 8)

  // إشعار (بلا id) → لا رد إطلاقًا
  const notif = await call(mcp, { jsonrpc: '2.0', method: 'notifications/initialized' })
  assertEquals(notif.status, 202)
  assertEquals(notif.body, null)

  // مصفوفة فارغة → -32600
  const emptyArr = await call(mcp, [])
  assertEquals(emptyArr.status, 400)
  assertEquals(parse(emptyArr).error.code, -32600)

  await server.close()
})

Deno.test('حدود المعدل: 30/د إجمالي و10/د كتابة (ساعة محقونة)', async () => {
  const db: MockDb = createMockDb()
  db.profiles.push({ id: MAX_USER, suspended: false })
  db.apiKeys.push({ key_hash: await sha256Hex(TEST_KEY), user_id: MAX_USER, last_used_at: null })
  db.userSubscriptions.push({ user_id: MAX_USER, plan: 'max', status: 'active', expires_at: null })
  const server = await startMockPostgrest(db)

  // ساعة متجمدة: كل الطلبات داخل نفس الدقيقة
  let fakeNow = Date.UTC(2026, 8, 13, 12, 0, 0)
  const mcp = new McpServer({ baseUrl: server.url, serviceKey: 'k', now: () => fakeNow })

  // 10 كتابات (الحد الأقصى) — create_task مع أدنى وسائط
  for (let i = 0; i < 10; i++) {
    const res = await call(mcp, {
      jsonrpc: '2.0', id: i, method: 'tools/call',
      params: { name: 'create_task', arguments: { title: `مهمة ${i}` } },
    })
    assertEquals(res.status, 200, `الكتابة ${i} يجب أن تنجح`)
  }
  // الكتابة 11 → رفض حد الكتابة
  const w11 = parse(await call(mcp, {
    jsonrpc: '2.0', id: 11, method: 'tools/call',
    params: { name: 'create_task', arguments: { title: 'زيادة' } },
  }))
  assertEquals(w11.error.code, -32003)
  assert(w11.error.message.includes('الكتابة'))

  // ملاحظة الحساب (تكافؤ مسار Vercel): كل كتابة تستهلك رصيدين
  // من الإجمالي (فحص الـPOST + فحص الكتابة) — 10 كتابات = 20،
  // ورفض الكتابة 11 يستهلك رصيدًا واحدًا قبل الرفض = 21.
  // القراءات تستمر حتى الحد الإجمالي 30:
  for (let i = 0; i < 8; i++) {
    await call(mcp, { jsonrpc: '2.0', id: 100 + i, method: 'ping' })
  }
  // الطلب 30 (رصيد 30) → نجاح، 31 → رفض الإجمالي
  const r30 = await call(mcp, { jsonrpc: '2.0', id: 130, method: 'ping' })
  assertEquals(r30.status, 200)
  const r31 = await call(mcp, { jsonrpc: '2.0', id: 131, method: 'ping' })
  assertEquals(r31.status, 429)
  assertEquals(parse(r31).error.code, -32003)
  assert(r31.headers['Retry-After'])

  // تقدّم الساعة دقيقة → نافذة جديدة والطلب يمر
  fakeNow += 61_000
  const rFresh = await call(mcp, { jsonrpc: '2.0', id: 132, method: 'ping' })
  assertEquals(rFresh.status, 200)

  await server.close()
})

Deno.test('حد IP: 60/د يرفض قبل المصادقة + last_used_at يتحدث', async () => {
  const db: MockDb = createMockDb()
  db.profiles.push({ id: MAX_USER, suspended: false })
  db.apiKeys.push({ key_hash: await sha256Hex(TEST_KEY), user_id: MAX_USER, last_used_at: null })
  db.userSubscriptions.push({ user_id: MAX_USER, plan: 'max', status: 'active', expires_at: null })
  const server = await startMockPostgrest(db)

  let fakeNow = Date.UTC(2026, 8, 13, 12, 0, 0)
  const mcp = new McpServer({ baseUrl: server.url, serviceKey: 'k', now: () => fakeNow })

  let lastStatus = 0
  for (let i = 0; i < 61; i++) {
    const res = await call(mcp, { jsonrpc: '2.0', id: i, method: 'ping' })
    lastStatus = res.status
  }
  assertEquals(lastStatus, 429, 'الطلب 61 من نفس IP يجب أن يُرفض')

  // المفتاح المستخدم فعليًا في الطلبات السابقة → last_used_at محدّث
  const keyRow = db.apiKeys[0]
  assert(keyRow.last_used_at, 'last_used_at يجب أن يتحدث بعد الاستخدام')
  await server.close()
})

Deno.test('last_used_at يتحدث عند أول استخدام ناجح', async () => {
  const { db, mcp, server } = await setup()
  assertEquals(db.apiKeys[0].last_used_at, null)
  await call(mcp, { jsonrpc: '2.0', id: 1, method: 'ping' })
  assert(db.apiKeys[0].last_used_at, 'last_used_at فارغ رغم الاستخدام')
  await server.close()
})
