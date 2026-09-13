// Mock Supabase (PostgREST-compatible) — بمخطط قاعدة البيانات الإنتاجي الحقيقي لأوج
// Usage: node tests/mock_supabase.js  (listens on :8787)
// يدعم: فلاتر eq/neq/gt/gte/lt/lte/is/ilike/or + order + limit + on_conflict upsert
// + Accept vnd.pgrst.object+json (صف واحد) + /rpc/{fn} (دوال tasks/goals الذرية)
const http = require("http");
const crypto = require("crypto");

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

// ====== الأعمدة (نفس مخطط الميجرشن 002/016/025/026/030) ======
const COLS = {
  user_api_keys: { id: "string", user_id: "string", key_hash: "string", name: "string", created_at: "string", last_used_at: "string" },
  mcp_oauth_codes: { jti: "string", user_id: "string", expires_at: "string", created_at: "string" },
  app_config: { key: "string", value: "string", updated_at: "string" },
  audit_logs: { actor_user_id: "string", action: "string", target_type: "string", target_id: "string", metadata: "object", ip_address: "string", user_agent: "string", created_at: "string" },
  profiles: { id: "string", name: "string", email: "string", avatar: "string", role: "string", level: "number", xp: "number", xp_to_next_level: "number", streak: "number", longest_streak: "number", total_focus_min: "number", total_tasks_done: "number", is_default: "boolean", handle: "string", suspended: "boolean", created_at: "string", updated_at: "string" },
  projects: { id: "string", user_id: "string", name: "string", description: "string", color: "string", icon: "string", progress: "number", status: "string", created_at: "string", updated_at: "string" },
  tasks: { id: "string", user_id: "string", title: "string", description: "string", status: "string", priority: "string", label: "string", project_id: "string", due_date: "string", due_time: "string", is_recurring: "boolean", recurring_pattern: "string", estimated_min: "number", xp_reward: "number", completed_at: "string", created_at: "string", updated_at: "string", depends_on: "string", order: "number" },
  subtasks: { id: "string", task_id: "string", title: "string", completed: "boolean", order: "number", created_at: "string" },
  goals: { id: "string", user_id: "string", title: "string", vision: "string", why: "string", type: "string", progress: "number", status: "string", deadline: "string", created_at: "string", updated_at: "string" },
  milestones: { id: "string", goal_id: "string", title: "string", completed: "boolean", order: "number", created_at: "string" },
  habits: { id: "string", user_id: "string", name: "string", description: "string", icon: "string", color: "string", frequency: "string", target_count: "number", reminder_time: "string", xp_reward: "number", created_at: "string", updated_at: "string" },
  habit_logs: { id: "string", habit_id: "string", date: "string", completed: "boolean", count: "number", created_at: "string" },
  journals: { id: "string", user_id: "string", date: "string", content: "string", gratitude: "string", wins: "string", challenges: "string", mood: "number", energy: "number", ideas: "string", tomorrow_plan: "string", tags: "string", created_at: "string", updated_at: "string" },
  planner_items: { id: "string", user_id: "string", date: "string", section: "string", time: "string", title: "string", completed: "boolean", order: "number", created_at: "string", updated_at: "string" },
  daily_scores: { id: "string", user_id: "string", date: "string", score: "number", completed_items: "string", total_items: "number" },
  notifications: { id: "string", user_id: "string", title: "string", body: "string", type: "string", icon: "string", read: "boolean", read_at: "string", action_url: "string", metadata: "object", priority: "string", expires_at: "string", dedup_key: "string", created_at: "string" },
  community_posts: { id: "string", user_id: "string", title: "string", body: "string", status: "string", edited_at: "string", like_count: "number", reply_count: "number", last_activity_at: "string", created_at: "string", updated_at: "string" },
  community_comments: { id: "string", post_id: "string", user_id: "string", parent_comment_id: "string", body: "string", status: "string", edited_at: "string", like_count: "number", reply_count: "number", created_at: "string", updated_at: "string" },
  community_reactions: { id: "string", user_id: "string", target_type: "string", target_id: "string", reaction: "string", created_at: "string" },
  community_reports: { id: "string", reporter_id: "string", target_type: "string", target_id: "string", reason: "string", details: "string", status: "string", handled_by: "string", handled_at: "string", created_at: "string" },
  user_subscriptions: { user_id: "string", plan: "string", status: "string", started_at: "string", expires_at: "string", updated_at: "string", payment_method: "string", reference: "string", activated_by: "string" },
  usage_daily: { user_id: "string", day: "string", feature_key: "string", count: "number", updated_at: "string" },
  // ====== v3.0 — جداول كل الأقسام (نفس مخطط 001/005/009) ======
  books: { id: "string", user_id: "string", title: "string", author: "string", type: "string", status: "string", current_page: "number", total_pages: "number", notes: "string", highlights: "string", favorite_quote: "string", rating: "number", cover_url: "string", progress: "number", start_date: "string", end_date: "string", created_at: "string", updated_at: "string" },
  knowledge_items: { id: "string", user_id: "string", type: "string", title: "string", content: "string", folder: "string", tags: "string", source: "string", is_favorite: "boolean", created_at: "string", updated_at: "string" },
  finance_records: { id: "string", user_id: "string", type: "string", category: "string", description: "string", amount: "number", date: "string", recurring: "boolean", created_at: "string" },
  health_logs: { id: "string", user_id: "string", date: "string", sleep_hours: "number", sleep_quality: "number", water_glasses: "number", steps: "number", calories: "number", weight: "number", mood: "number", energy: "number", exercise_type: "string", exercise_min: "number", exercise_note: "string", created_at: "string" },
  morning_logs: { id: "string", user_id: "string", date: "string", score: "number", completed_items: "string", total_items: "number", started_at: "string", completed_at: "string", created_at: "string" },
  focus_sessions: { id: "string", user_id: "string", duration: "number", actual_min: "number", type: "string", notes: "string", task_id: "string", completed: "boolean", started_at: "string", completed_at: "string", created_at: "string" },
  work_sessions: { id: "string", user_id: "string", title: "string", planned_min: "number", active_min: "number", break_min: "number", breaks_count: "number", breaks_log: "string", task_ids: "string", tasks_completed: "number", quality_score: "number", notes: "string", status: "string", started_at: "string", completed_at: "string", created_at: "string" },
  user_achievements: { id: "string", user_id: "string", badge_id: "string", badge_name: "string", badge_icon: "string", badge_desc: "string", earned_at: "string" },
  user_settings: { id: "string", user_id: "string", theme: "string", language: "string", wake_up_time: "string", sleep_time: "string", focus_duration: "number", daily_water_goal: "number", daily_reading_goal: "number", weekly_exercise_goal: "number", notifications: "boolean", created_at: "string", updated_at: "string" },
};

const DB = {};
for (const t of Object.keys(COLS)) DB[t] = [];

// SHA-256 hex لمفتاح الاختبار — نفس منطق mcp-core (hashApiKey في التطبيق)
const KEY_HASH = crypto.createHash("sha256").update("rise_test_key_123").digest("hex");

function seed() {
  const now = new Date().toISOString();
  DB.profiles.push({ id: "u-111", name: "أحمد", email: "ahmed@test.local", avatar: "", role: "user", level: 3, xp: 850, xp_to_next_level: 1000, streak: 4, longest_streak: 9, total_focus_min: 320, total_tasks_done: 42, is_default: false, handle: "ahmed", suspended: false, created_at: "2026-01-01T00:00:00Z", updated_at: now });
  DB.profiles.push({ id: "u-222", name: "سارة", email: "sara@test.local", avatar: "", role: "user", level: 1, xp: 100, xp_to_next_level: 200, streak: 0, longest_streak: 2, total_focus_min: 10, total_tasks_done: 3, is_default: false, handle: "sara", suspended: false, created_at: "2026-02-01T00:00:00Z", updated_at: now });
  DB.user_api_keys.push({ id: "k-1", user_id: "u-111", key_hash: KEY_HASH, name: "مفتاح الاختبار", created_at: "2026-01-01T00:00:00Z", last_used_at: null });
  DB.user_api_keys.push({ id: "k-2", user_id: "u-222", key_hash: crypto.createHash("sha256").update("rise_other_user").digest("hex"), name: "مفتاح سارة", created_at: "2026-01-02T00:00:00Z", last_used_at: null });
  DB.app_config.push({ key: "mcp_oauth_client_id", value: "awj-7b7f7ba5e0502c4f68f7", updated_at: now });
  DB.app_config.push({ key: "mcp_oauth_client_secret", value: "test-oauth-secret", updated_at: now });
  DB.user_subscriptions.push({ user_id: "u-111", plan: "max", status: "active", started_at: "2026-08-01T00:00:00Z", expires_at: "2026-12-31T00:00:00Z", updated_at: now, payment_method: null, reference: null, activated_by: null });
  DB.projects.push({ id: "pr-1", user_id: "u-111", name: "مشروع الإطلاق", description: "إطلاق أوج", color: "#059669", icon: null, progress: 0.5, status: "active", created_at: "2026-08-01T00:00:00Z", updated_at: now });
  DB.tasks.push({ id: "t-1", user_id: "u-111", title: "تسليم التقرير الشهري", description: "تقرير سبتمبر", status: "todo", priority: "high", label: null, project_id: "pr-1", due_date: "2026-09-20", due_time: null, is_recurring: false, recurring_pattern: null, estimated_min: 90, xp_reward: 10, completed_at: null, created_at: "2026-09-10T10:00:00Z", updated_at: "2026-09-10T10:00:00Z", depends_on: null, order: 0 });
  DB.tasks.push({ id: "t-2", user_id: "u-222", title: "مهمة سارة", description: "", status: "todo", priority: "low", label: null, project_id: null, due_date: null, due_time: null, is_recurring: false, recurring_pattern: null, estimated_min: null, xp_reward: 10, completed_at: null, created_at: "2026-09-11T10:00:00Z", updated_at: "2026-09-11T10:00:00Z", depends_on: null, order: 0 });
  DB.subtasks.push({ id: "st-1", task_id: "t-1", title: "جمع البيانات", completed: true, order: 0, created_at: now });
  DB.subtasks.push({ id: "st-2", task_id: "t-1", title: "كتابة الملخص", completed: false, order: 1, created_at: now });
  DB.goals.push({ id: "g-1", user_id: "u-111", title: "قراءة 12 كتابًا", vision: "ثقافة أوسع", why: "النمو الشخصي", type: "yearly", progress: 0.25, status: "active", deadline: "2026-12-31", created_at: "2026-01-15T00:00:00Z", updated_at: now });
  DB.milestones.push({ id: "m-1", goal_id: "g-1", title: "الكتاب الأول", completed: true, order: 0, created_at: now });
  DB.milestones.push({ id: "m-2", goal_id: "g-1", title: "الكتاب الثاني", completed: false, order: 1, created_at: now });
  DB.habits.push({ id: "h-1", user_id: "u-111", name: "شرب 8 أكواب ماء", description: "ترطيب يومي", icon: null, color: "#059669", frequency: "daily", target_count: 8, reminder_time: null, xp_reward: 15, created_at: "2026-08-01T00:00:00Z", updated_at: now });
  DB.habit_logs.push({ id: "hl-1", habit_id: "h-1", date: today, completed: true, count: 5, created_at: now });
  DB.habit_logs.push({ id: "hl-2", habit_id: "h-1", date: yesterday, completed: true, count: 8, created_at: now });
  DB.journals.push({ id: "j-1", user_id: "u-111", date: today, content: "يوم جيد بدأت تنظيم المهام", gratitude: "شكرًا على الصحة", wins: "أنجزت التخطيط", challenges: "التشتت مساءً", mood: 4, energy: 3, ideas: "تقنية بومودورو", tomorrow_plan: "مراجعة الأهداف", tags: null, created_at: now, updated_at: now });
  DB.journals.push({ id: "j-2", user_id: "u-111", date: "2026-09-01", content: "بداية الشهر بدي", gratitude: null, wins: null, challenges: null, mood: 3, energy: 3, ideas: null, tomorrow_plan: null, tags: null, created_at: "2026-09-01T20:00:00Z", updated_at: now });
  DB.planner_items.push({ id: "pi-1", user_id: "u-111", date: today, section: "morning", time: "08:00", title: "مراجعة اليوميات", completed: false, order: 0, created_at: now, updated_at: now });
  DB.planner_items.push({ id: "pi-2", user_id: "u-111", date: today, section: "work", time: "10:00", title: "جلسة تركيز", completed: true, order: 1, created_at: now, updated_at: now });
  DB.daily_scores.push({ id: "ds-1", user_id: "u-111", date: today, score: 7.5, completed_items: "[]", total_items: 10 });
  DB.daily_scores.push({ id: "ds-2", user_id: "u-111", date: yesterday, score: 6, completed_items: "[]", total_items: 10 });
  DB.notifications.push({ id: "nt-1", user_id: "u-111", title: "مرحبًا بك في أوج", body: "أهلاً بك! هذه أول رسالة.", type: "system", icon: null, read: false, read_at: null, action_url: null, metadata: {}, priority: "normal", expires_at: null, dedup_key: null, created_at: "2026-09-01T00:00:00Z" });
  DB.notifications.push({ id: "nt-2", user_id: "u-111", title: "رد جديد", body: "سارة ردت على منشورك.", type: "community", icon: null, read: true, read_at: "2026-09-02T10:00:00Z", action_url: null, metadata: {}, priority: "high", expires_at: null, dedup_key: null, created_at: "2026-09-02T00:00:00Z" });
  DB.community_posts.push({ id: "p-1", user_id: "u-222", title: "نصائح للإنتاجية", body: "جربوا تقنية بومودورو 25 دقيقة!", status: "published", edited_at: null, like_count: 3, reply_count: 1, last_activity_at: "2026-09-08T12:00:00Z", created_at: "2026-09-08T00:00:00Z", updated_at: now });
  DB.community_posts.push({ id: "p-2", user_id: "u-111", title: "كيف تنظّمون أهدافكم؟", body: "شاركوني طريقتكم في تتبع الأهداف.", status: "published", edited_at: null, like_count: 1, reply_count: 0, last_activity_at: "2026-09-09T09:00:00Z", created_at: "2026-09-09T00:00:00Z", updated_at: now });
  DB.community_comments.push({ id: "c-1", post_id: "p-1", user_id: "u-111", parent_comment_id: null, body: "جربتها وفادت جدًا", status: "published", edited_at: null, like_count: 2, reply_count: 0, created_at: "2026-09-09T00:00:00Z", updated_at: now });
  DB.community_reactions.push({ id: "r-1", user_id: "u-222", target_type: "post", target_id: "p-1", reaction: "like", created_at: now });
  DB.usage_daily.push({ user_id: "u-111", day: today, feature_key: "mcp_tools", count: 12, updated_at: now });
  DB.usage_daily.push({ user_id: "u-111", day: today, feature_key: "ai_chat", count: 3, updated_at: now });
  // ====== v3.0 — بذور الأقسام الجديدة (نفس عقود الوحدات) ======
  DB.books.push({ id: "b-1", user_id: "u-111", title: "العادات الذرية", author: "جيمس كلير", type: "book", status: "reading", current_page: 120, total_pages: 320, notes: "كتاب ممتاز عن بناء العادات", highlights: null, favorite_quote: "التغيير يبدأ صغيراً", rating: 4, cover_url: null, progress: 37.5, start_date: "2026-09-01", end_date: null, created_at: "2026-09-01T10:00:00Z", updated_at: now });
  DB.books.push({ id: "b-2", user_id: "u-111", title: "فن اللامبالاة", author: "مارك مانسون", type: "book", status: "completed", current_page: 210, total_pages: 210, notes: null, highlights: null, favorite_quote: null, rating: 5, cover_url: null, progress: 100, start_date: "2026-08-01", end_date: "2026-08-15", created_at: "2026-08-01T10:00:00Z", updated_at: now });
  DB.books.push({ id: "b-3", user_id: "u-111", title: "تفكير سريع وبطيء", author: "دانيال كانمان", type: "book", status: "want_to_read", current_page: 0, total_pages: 500, notes: null, highlights: null, favorite_quote: null, rating: null, cover_url: null, progress: 0, start_date: null, end_date: null, created_at: "2026-09-05T10:00:00Z", updated_at: now });
  DB.knowledge_items.push({ id: "k-1", user_id: "u-111", type: "learning-goal", title: "إتقان الإنجليزية", content: "الوصول لمستوى C1", folder: null, tags: JSON.stringify({ progress: 40, status: "active" }), source: null, is_favorite: false, created_at: "2026-09-01T10:00:00Z", updated_at: now });
  DB.knowledge_items.push({ id: "k-2", user_id: "u-111", type: "learning-course", title: "دورة Deno الأساسية", content: "", folder: null, tags: JSON.stringify({ platform: "Udemy", progress: 60, status: "in_progress", certificate: false }), source: null, is_favorite: false, created_at: "2026-09-02T10:00:00Z", updated_at: now });
  DB.knowledge_items.push({ id: "k-3", user_id: "u-111", type: "learning-skill", title: "الكتابة الإبداعية", content: "", folder: null, tags: JSON.stringify({ level: 3, colorIdx: 2 }), source: null, is_favorite: false, created_at: "2026-09-02T11:00:00Z", updated_at: now });
  DB.knowledge_items.push({ id: "k-4", user_id: "u-111", type: "learning-log", title: "سجل تعلم", content: "راجعت درس المتغيرات في Deno", folder: null, tags: JSON.stringify({ minutes: 45, date: today }), source: null, is_favorite: false, created_at: "2026-09-10T10:00:00Z", updated_at: now });
  DB.knowledge_items.push({ id: "k-5", user_id: "u-111", type: "note", title: "فكرة تطبيق لتتبع القراءة", content: "تطبيق يسجل دقائق القراءة اليومية ويعطي إحصائيات", folder: "أفكار", tags: "قراءة، إنتاجية", source: null, is_favorite: true, created_at: "2026-09-03T10:00:00Z", updated_at: now });
  DB.finance_records.push({ id: "f-1", user_id: "u-111", type: "income", category: "راتب", description: "راتب سبتمبر", amount: 15000, date: "2026-09-01", recurring: false, created_at: now });
  DB.finance_records.push({ id: "f-2", user_id: "u-111", type: "expense", category: "تسوق", description: "مشتريات البقالة", amount: 500, date: "2026-09-05", recurring: false, created_at: now });
  DB.finance_records.push({ id: "f-3", user_id: "u-111", type: "ادخار", category: "ادخار شهري", description: "ادخار الشهر", amount: 2000, date: "2026-09-06", recurring: true, created_at: now });
  DB.health_logs.push({ id: "hl-1", user_id: "u-111", date: today, sleep_hours: 7, sleep_quality: 4, water_glasses: 6, steps: 8000, calories: null, weight: null, mood: 4, energy: 3, exercise_type: "مشي", exercise_min: 30, exercise_note: null, created_at: now });
  DB.morning_logs.push({ id: "ml-1", user_id: "u-111", date: today, score: 80, completed_items: JSON.stringify(["wake", "water", "exercise"]), total_items: 5, started_at: "2026-09-13T05:00:00Z", completed_at: null, created_at: now });
  DB.focus_sessions.push({ id: "fs-1", user_id: "u-111", duration: 50, actual_min: 48, type: "pomodoro", notes: "جلسة على تقرير سبتمبر", task_id: "t-1", completed: true, started_at: new Date().toISOString(), completed_at: new Date().toISOString(), created_at: now });
  DB.work_sessions.push({ id: "ws-1", user_id: "u-111", title: "جلسة برمجة", planned_min: 240, active_min: 200, break_min: 20, breaks_count: 2, breaks_log: null, task_ids: null, tasks_completed: 3, quality_score: 85, notes: null, status: "completed", started_at: new Date(Date.now() - 86400000).toISOString(), completed_at: now, created_at: now });
  DB.user_achievements.push({ id: "a-1", user_id: "u-111", badge_id: "reader_10", badge_name: "قارئ نَهِم", badge_icon: "📚", badge_desc: "قرأت 10 كتب", earned_at: "2026-08-20T10:00:00Z" });
  DB.user_achievements.push({ id: "a-2", user_id: "u-111", badge_id: "organizer", badge_name: "مُنظّم", badge_icon: "🗂️", badge_desc: "نظّمت 100 مهمة", earned_at: "2026-09-01T10:00:00Z" });
  // صفوف وحدات أخرى في جدول knowledge المشترك — تختبر عزل BRAIN_TYPES
  DB.knowledge_items.push({ id: "k-99", user_id: "u-111", type: "budget-config", title: "cfg مالية", content: "{}", folder: null, tags: null, source: null, is_favorite: false, created_at: "2026-09-01T00:00:00Z", updated_at: now });
}
seed();

// ====== محرك الاستعلامات (PostgREST-compatible) ======
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function ilike(pattern, value) {
  // PostgREST ilike: % كعنصر بادئ/لاحق
  const rx = new RegExp("^" + String(pattern).split("%").map(esc).join(".*") + "$", "i");
  return rx.test(String(value ?? ""));
}
function splitTop(str) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of str) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function matchCond(row, cond) {
  const m = cond.match(/^(.+)\.(eq|neq|gt|gte|lt|lte|is|cs|ilike)\.([^]*)$/s);
  if (!m) return true;
  const [, col, op, rawVal] = m;
  const rv = row[col];
  switch (op) {
    case "eq": return String(rv ?? "") === rawVal;
    case "neq": return String(rv ?? "") !== rawVal;
    case "gt": return String(rv ?? "") > rawVal;
    case "gte": return String(rv ?? "") >= rawVal;
    case "lt": return String(rv ?? "") < rawVal;
    case "lte": return String(rv ?? "") <= rawVal;
    case "is": return rawVal === "null" ? rv == null : String(rv ?? "") === rawVal;
    case "ilike": return ilike(rawVal, rv);
    case "cs": {
      try { const arr = JSON.parse(rawVal); return Array.isArray(rv) && arr.every((x) => rv.includes(x)); } catch { return false; }
    }
    default: return true;
  }
}
function rowMatches(row, params) {
  for (const [key, raw] of params.entries()) {
    if (["select", "order", "limit", "offset", "on_conflict"].includes(key)) continue;
    if (key === "or") {
      const group = raw.startsWith("(") ? raw.slice(1, -1) : raw;
      const conds = splitTop(group);
      if (!conds.some((c) => matchCond(row, c))) return false;
      continue;
    }
    if (!matchCond(row, `${key}.${raw}`)) return false;
  }
  return true;
}

function json(res, body, status = 200, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

// ====== دوال RPC الذرية (نفس منطق 016) ======
function rpcCall(fn, args) {
  if (fn === "create_task_with_subtasks") {
    const { p_user_id, p_task, p_subtasks } = args;
    const task = {
      id: crypto.randomUUID(), user_id: p_user_id,
      title: p_task.title, description: p_task.description ?? null,
      status: "todo", priority: p_task.priority ?? "medium",
      label: null, project_id: null,
      due_date: p_task.due_date ?? null, due_time: p_task.due_time ?? null,
      is_recurring: false, recurring_pattern: null,
      estimated_min: p_task.estimated_min ?? null, xp_reward: 10,
      completed_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      depends_on: null, order: 0,
    };
    DB.tasks.push(task);
    const subs = (p_subtasks ?? []).map((s, i) => {
      const st = { id: crypto.randomUUID(), task_id: task.id, title: s.title, completed: false, order: s.order ?? i, created_at: new Date().toISOString() };
      DB.subtasks.push(st);
      return st;
    });
    return { task, subtasks: subs };
  }
  if (fn === "update_task_with_subtasks") {
    const { p_user_id, p_task_id, p_task, p_subtasks } = args;
    const task = DB.tasks.find((t) => t.id === p_task_id && t.user_id === p_user_id);
    if (!task) { const e = new Error("task not found or not owned"); e.status = 400; throw e; }
    if (p_task.title !== undefined) task.title = p_task.title;
    if ("description" in p_task) task.description = p_task.description;
    if (p_task.status !== undefined) {
      task.status = p_task.status;
      task.completed_at = p_task.status === "done" ? (task.completed_at ?? new Date().toISOString()) : null;
    }
    if (p_task.priority !== undefined) task.priority = p_task.priority;
    if ("due_date" in p_task) task.due_date = p_task.due_date;
    if ("due_time" in p_task) task.due_time = p_task.due_time;
    if ("estimated_min" in p_task) task.estimated_min = p_task.estimated_min === "" ? null : p_task.estimated_min;
    task.updated_at = new Date().toISOString();
    if (p_subtasks !== null && p_subtasks !== undefined) {
      DB.subtasks = DB.subtasks.filter((s) => s.task_id !== p_task_id);
      if (Array.isArray(p_subtasks)) {
        for (const s of p_subtasks) {
          DB.subtasks.push({ id: crypto.randomUUID(), task_id: p_task_id, title: s.title, completed: s.completed ?? false, order: s.order ?? 0, created_at: new Date().toISOString() });
        }
      }
    }
    return { task, subtasks: DB.subtasks.filter((s) => s.task_id === p_task_id).sort((a, b) => a.order - b.order) };
  }
  if (fn === "create_goal_with_milestones") {
    const { p_user_id, p_goal, p_milestones } = args;
    const goal = {
      id: crypto.randomUUID(), user_id: p_user_id,
      title: p_goal.title, vision: p_goal.vision ?? null, why: p_goal.why ?? null,
      type: p_goal.type || "quarterly", progress: Number(p_goal.progress ?? 0) || 0,
      status: "active", deadline: p_goal.deadline ?? null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    DB.goals.push(goal);
    const ms = (p_milestones ?? []).map((m, i) => {
      const st = { id: crypto.randomUUID(), goal_id: goal.id, title: m.title, completed: false, order: m.order ?? i, created_at: new Date().toISOString() };
      DB.milestones.push(st);
      return st;
    });
    return { goal, milestones: ms };
  }
  const e = new Error(`function ${fn} does not exist`); e.status = 404; throw e;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost:8787");
  const path = decodeURIComponent(url.pathname);

  // auth check (service key يتضمن "test")
  const apikey = req.headers["apikey"];
  const auth = req.headers["authorization"] ?? "";
  if (!apikey || !auth.includes("test")) {
    return json(res, { message: "missing apikey/auth", code: "401" }, 401);
  }

  // OpenAPI root
  if (path === "/rest/v1" || path === "/rest/v1/") {
    const definitions = {};
    for (const [t, cols] of Object.entries(COLS)) {
      const props = {};
      for (const [c, ty] of Object.entries(cols)) {
        props[c] = ty === "object" ? { type: "object" } : { type: ty, ...(ty === "array" ? { items: { type: "string" } } : {}) };
      }
      definitions[t] = { properties: props };
    }
    return json(res, { swagger: "2.0", definitions });
  }

  // RPC endpoints
  const rpcMatch = path.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
  if (rpcMatch) {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const args = JSON.parse(body || "{}");
        const result = rpcCall(rpcMatch[1], args);
        return json(res, result);
      } catch (err) {
        return json(res, { message: err.message, code: String(err.status ?? 404) }, err.status ?? 404);
      }
    });
    return;
  }

  const m = path.match(/^\/rest\/v1\/([a-z_]+)$/);
  if (!m) return json(res, { message: "not found" }, 404);
  const table = m[1];
  if (!DB[table]) return json(res, { message: `relation "${table}" does not exist`, code: "42P01" }, 404);

  const params = url.searchParams;
  const accept = String(req.headers["accept"] ?? "");
  const single = accept.includes("vnd.pgrst.object+json");

  if (req.method === "GET") {
    let rows = DB[table].filter((r) => rowMatches(r, params));
    const order = params.get("order");
    if (order) {
      const [col, rest] = order.split(".");
      const desc = rest?.startsWith("desc");
      rows = [...rows].sort((a, b) => {
        const av = a[col] ?? "", bv = b[col] ?? "";
        const cmp = String(av) < String(bv) ? -1 : String(av) > String(bv) ? 1 : 0;
        return desc ? -cmp : cmp;
      });
    }
    const limit = params.get("limit");
    if (limit) rows = rows.slice(0, Number(limit));
    if (single) {
      if (rows.length === 0) return json(res, { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116", details: "Results contain 0 rows" }, 406);
      return json(res, rows[0]);
    }
    return json(res, rows);
  }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let data = [];
    try { data = JSON.parse(body); if (!Array.isArray(data)) data = [data]; } catch { /* empty */ }
    const prefer = String(req.headers["prefer"] ?? "");
    const minimal = prefer.includes("return=minimal");
    const merge = prefer.includes("resolution=merge-duplicates");

    if (req.method === "POST") {
      // upsert (on_conflict + merge-duplicates)
      const onConflict = params.get("on_conflict");
      if (onConflict && merge) {
        const conflictCols = onConflict.split(",").map((s) => s.trim());
        const row = data[0] ?? {};
        const existing = DB[table].find((r) => conflictCols.every((c) => String(r[c]) === String(row[c])));
        if (existing) { Object.assign(existing, row); return json(res, existing); }
        const full = { ...row };
        if (COLS[table].id && full.id == null) full.id = crypto.randomUUID();
        if (COLS[table].created_at && full.created_at == null) full.created_at = new Date().toISOString();
        DB[table].push(full);
        return json(res, full);
      }
      // إدراج عادي — تفرد jti لمسار الأكواد الأحادية الاستخدام
      for (const row of data) {
        if (table === "mcp_oauth_codes" && DB.mcp_oauth_codes.some((r) => r.jti === row.jti)) {
          return json(res, { message: "duplicate key value violates unique constraint", code: "23505" }, 409);
        }
      }
      const created = [];
      for (const row of data) {
        const full = { ...row };
        if (COLS[table].id && full.id == null) full.id = crypto.randomUUID();
        if (COLS[table].created_at && full.created_at == null) full.created_at = new Date().toISOString();
        DB[table].push(full);
        created.push(full);
        // تريجر العدادات للمجتمع (نفس سلوك 030 trg_community_recount)
        if (table === "community_reactions" && full.target_type === "post") {
          const p = DB.community_posts.find((x) => x.id === full.target_id);
          if (p) p.like_count = (p.like_count ?? 0) + 1;
        }
        // تريجر reply_count للتعليقات (نفس community_comment_counts)
        if (table === "community_comments") {
          const p = DB.community_posts.find((x) => x.id === full.post_id);
          if (p) { p.reply_count = (p.reply_count ?? 0) + 1; p.last_activity_at = new Date().toISOString(); }
        }
      }
      if (minimal) return json(res, null, 201);
      return json(res, created, 201);
    }

    const patch = Array.isArray(data) ? (data[0] ?? {}) : data;
    if (req.method === "PATCH") {
      const matched = DB[table].filter((r) => rowMatches(r, params));
      for (const r of matched) {
        Object.assign(r, patch);
        // تريجر read_at عند قراءة الإشعار (نفس سلوك 026)
        if (table === "notifications" && patch.read === true && !r.read_at) r.read_at = new Date().toISOString();
      }
      if (minimal) return json(res, null, 204);
      return json(res, matched);
    }
    if (req.method === "DELETE") {
      const matched = DB[table].filter((r) => rowMatches(r, params));
      // تريجر العدادات للمجتمع عند حذف reaction
      if (table === "community_reactions") {
        for (const r of matched) {
          if (r.target_type === "post") {
            const p = DB.community_posts.find((x) => x.id === r.target_id);
            if (p) p.like_count = Math.max((p.like_count ?? 1) - 1, 0);
          }
        }
      }
      DB[table] = DB[table].filter((r) => !matched.includes(r));
      if (minimal) return json(res, null, 204);
      return json(res, matched);
    }
    return json(res, { message: "method not allowed" }, 405);
  });
});

server.listen(8787, () => console.log("mock supabase (real schema) on :8787"));
