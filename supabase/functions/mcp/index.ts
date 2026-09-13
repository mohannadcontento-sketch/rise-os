// ============================================================================
// أوج (Awj) — خادم MCP موسّع | Supabase Edge Function
// File: supabase/functions/mcp/index.ts
// ----------------------------------------------------------------------------
// MCP server (Streamable HTTP / JSON-RPC over POST) + OAuth 2.1 + PKCE.
//
// ما الجديد في هذه النسخة:
//  - كتالوج أدوات شامل يغطي كل أجزاء الموقع (مهام، ملاحظات، عادات، تذكيرات،
//    يوميات، أهداف، تقويم، إشعارات، مجتمع، اشتراك واستخدام، بحث شامل).
//  - اكتشاف تلقائي لمخطط قاعدة البيانات (Supabase REST OpenAPI) — تظهر فقط
//    الأدوات التي جداولها موجودة فعلًا، وتُطبَّق أسماء الأعمدة تلقائيًا.
//  - توافق كامل مع النسخة السابقة: نفس مسارات OAuth (?oauth=authorize/token)،
//    نفس قبول مفتاح rise_… كـ Bearer، نفس أكواد الأخطاء والرسائل.
//  - جاهز لـ ChatGPT Connector و Gemini CLI و Google AI Studio.
//
// متغيرات البيئة (الافتراضية كافية عادة):
//  - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (تحقنها Supabase تلقائيًا)
//  - MCP_SITE_URL      : موقع صفحة التفويض (افتراضي https://rise-os-gamma.vercel.app)
//  - MCP_CLIENT_ID     : معرّف العميل الثابت (افتراضي awj-7b7f7ba5e0502c4f68f7)
//  - MCP_DEBUG         : "1" لعرض تفاصيل التشخيص في رسائل الأخطاء
//  - MCP_TABLES_JSON   : (اختياري) JSON لتثبيت أسماء الجداول يدويًا، مثال:
//      {"keys":"mcp_keys","tokens":"mcp_tokens","codes":"mcp_auth_codes",
//       "audit":"mcp_audit_logs","tasks":"tasks","notes":"notes"}
//    مفيد إن كان الاكتشاف التلقائي غير دقيق في مشروعك.
// ============================================================================

// ============================== الإعدادات ===================================
const CFG = {
  SITE_URL: (Deno.env.get("MCP_SITE_URL") ?? "https://rise-os-gamma.vercel.app").replace(/\/+$/, ""),
  FIXED_CLIENT_ID: Deno.env.get("MCP_CLIENT_ID") ?? "awj-7b7f7ba5e0502c4f68f7",
  SCOPE: "mcp:tools",
  CODE_TTL_SEC: 600,          // صلاحية كود التفويض: 10 دقائق
  ACCESS_TTL_SEC: 3600,       // access token: ساعة
  REFRESH_TTL_SEC: 60 * 60 * 24 * 30, // refresh token: 30 يوم
  DEBUG: Deno.env.get("MCP_DEBUG") === "1",
  RATE: { perMinute: 60, perHour: 600 },
  MAX_LIST: 100,              // أقصى عدد صفوف تُرجعها أدوات القوائم
  MAX_TEXT: 12000,            // أقصى طول نص (ملاحظة/يومية/منشور)
  MAX_TITLE: 300,
};

const SB_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// أسماء الجداول: ترتيب مرشّحات للاكتشاف التلقائي + إمكانية التثبيت اليدوي
const PINNED: Record<string, string> = (() => {
  try { return JSON.parse(Deno.env.get("MCP_TABLES_JSON") ?? "{}"); } catch { return {}; }
})();

const TABLE_CANDIDATES: Record<string, string[]> = {
  keys:    ["mcp_keys", "mcp_api_keys", "user_mcp_keys", "api_keys"],
  tokens:  ["mcp_tokens", "oauth_tokens", "mcp_access_tokens", "oauth_access_tokens", "mcp_sessions"],
  codes:   ["mcp_auth_codes", "oauth_auth_codes", "mcp_codes", "oauth_codes", "mcp_authorization_codes"],
  audit:   ["mcp_audit_logs", "mcp_call_logs", "mcp_audit"],
  profiles: ["profiles", "users_public", "user_profiles", "users"],
  tasks:   ["tasks", "user_tasks", "todo_tasks", "todos", "task_items"],
  notes:   ["notes", "user_notes", "note_items"],
  habits:  ["habits", "user_habits", "habit_items"],
  habit_logs: ["habit_logs", "habit_entries", "habit_completions", "user_habit_logs"],
  reminders: ["reminders", "user_reminders", "reminder_items"],
  journal: ["journal_entries", "journal", "daily_journal", "reflections", "journal_items"],
  goals:   ["goals", "user_goals", "goal_items"],
  events:  ["events", "calendar_events", "user_events", "schedule_events"],
  notifications: ["notifications", "user_notifications", "notification_items"],
  notif_prefs: ["notification_preferences", "notification_prefs", "user_notification_settings", "notification_settings"],
  posts:   ["posts", "community_posts", "social_posts", "feed_posts"],
  comments: ["comments", "post_comments", "community_comments"],
  likes:   ["post_likes", "community_likes", "reactions", "post_reactions", "likes"],
  reports: ["reports", "content_reports", "community_reports"],
  subs:    ["subscriptions", "user_subscriptions", "plan_subscriptions"],
  usage_daily: ["usage_daily", "daily_usage", "usage_events"],
  usage_monthly: ["usage_monthly", "monthly_usage"],
  plans:   ["plans", "plan_definitions"],
};

// مرشّحات أسماء الأعمدة الشائعة (تُطابَق مع الأعمدة الفعلية من المخطط)
const COL = {
  userId:   ["user_id", "userId", "owner_id", "author_id", "owner"],
  id:       ["id", "uuid"],
  title:    ["title", "name", "label", "summary"],
  content:  ["content", "body", "text", "description", "details", "entry", "note", "message"],
  done:     ["done", "completed", "is_completed", "is_done", "complete"],
  status:   ["status", "state"],
  priority: ["priority", "importance", "urgency"],
  due:      ["due_date", "due_at", "due", "deadline", "dueDate"],
  tags:     ["tags", "labels"],
  created:  ["created_at", "createdAt", "date_created", "created"],
  updated:  ["updated_at", "updatedAt", "modified_at"],
  deleted:  ["deleted_at", "deleted", "archived_at", "is_deleted"],
  readAt:   ["read_at", "readAt", "is_read", "read"],
  // مفاتيح MCP
  key:      ["key", "api_key", "key_hash", "hash", "secret", "token_value"],
  keyActive: ["active", "is_active", "enabled", "is_enabled", "status"],
  keyRevoked: ["revoked", "is_revoked", "revoked_at", "disabled"],
  keyName:  ["name", "label", "title", "key_name"],
  // رموز OAuth
  token:    ["token", "access_token", "token_value"],
  refresh:  ["refresh_token", "refresh"],
  tokenUser: ["user_id", "userId", "owner_id"],
  tokenClient: ["client_id", "clientId"],
  tokenExp: ["expires_at", "expiresAt", "expiry", "expires"],
  tokenRevoked: ["revoked", "is_revoked", "revoked_at"],
  code:     ["code", "authorization_code", "auth_code"],
  codeChallenge: ["code_challenge", "challenge", "pkce_challenge"],
  codeRedirect: ["redirect_uri", "redirectUri"],
  codeUsed: ["used", "is_used", "used_at"],
  codeExp:  ["expires_at", "expiresAt", "expiry"],
  // الاشتراك
  plan:     ["plan", "plan_id", "tier", "plan_tier", "plan_name"],
  subStatus: ["status", "state", "sub_status"],
  subEnd:   ["end_at", "ends_at", "current_period_end", "end_date", "expires_at"],
  // المجتمع
  author:   ["author_id", "user_id", "userId", "owner_id"],
  postTitle: ["title", "subject"],
  postBody: ["content", "body", "text", "message"],
  postComments: ["comments_count", "comment_count", "comments"],
  postLikes: ["likes_count", "like_count", "likes", "reactions_count"],
};

// ============================== أدوات مساعدة ================================
const enc = new TextEncoder();
const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
};
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...corsHeaders, ...extra } });
}
function redirect(location: string, extra: Record<string, string> = {}): Response {
  return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store", ...corsHeaders, ...extra } });
}
function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(input)));
}
async function sha256B64url(input: string): Promise<string> {
  return b64urlEncode(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(input))));
}
function randomToken(prefix: string): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return prefix + b64urlEncode(bytes);
}
function nowSec(): number { return Math.floor(Date.now() / 1000); }
function isoNow(): string { return new Date().toISOString(); }
function isoPlus(sec: number): string { return new Date(Date.now() + sec * 1000).toISOString(); }
function safeStr(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : v == null ? "" : String(v).slice(0, max);
}
function isSafeId(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
}
function arDate(iso: unknown): string {
  if (typeof iso !== "string" || !iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" }) +
    (iso.includes("T") ? " • " + d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }) : "");
}
function dbg(...args: unknown[]): void { if (CFG.DEBUG) console.log("[mcp]", ...args); }

// ======================= عميل Supabase REST (PostgREST) =====================
async function sbFetch(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 15000, ...rest } = init;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${SB_URL}/rest/v1${path}`, {
      ...rest,
      signal: ctrl.signal,
      headers: {
        "apikey": SB_KEY,
        "Authorization": `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...(rest.headers ?? {}),
      },
    });
  } finally { clearTimeout(t); }
}

async function sbSelect(table: string, params: {
  select?: string; filters?: string[]; order?: string; limit?: number; offset?: number;
}): Promise<{ rows: Record<string, unknown>[]; error?: string; code?: string }> {
  // نبني مرشّحات PostgREST يدويًا لأن الصيغة ليست key=value عادية
  const qs: string[] = [`select=${encodeURIComponent(params.select ?? "*")}`];
  for (const f of params.filters ?? []) qs.push(f);
  if (params.order) qs.push(`order=${params.order}`);
  if (params.limit != null) qs.push(`limit=${params.limit}`);
  if (params.offset != null) qs.push(`offset=${params.offset}`);
  const res = await sbFetch(`/${table}?${qs.join("&")}`);
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    let msg = errText, code = String(res.status);
    try { const j = JSON.parse(errText); msg = j.message ?? errText; code = j.code ?? code; } catch { /* raw */ }
    return { rows: [], error: msg, code };
  }
  const rows = await res.json().catch(() => []);
  return { rows: Array.isArray(rows) ? rows : [rows] };
}

async function sbInsert(table: string, row: Record<string, unknown>): Promise<{ row?: Record<string, unknown>; error?: string; code?: string }> {
  const res = await sbFetch(`/${table}?select=*`, {
    method: "POST",
    body: JSON.stringify([row]),
    headers: { "Prefer": "return=representation" },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    let msg = t, code = String(res.status);
    try { const j = JSON.parse(t); msg = j.message ?? t; code = j.code ?? code; } catch { /* raw */ }
    return { error: msg, code };
  }
  const rows = await res.json().catch(() => []);
  return { row: Array.isArray(rows) ? rows[0] : rows };
}

async function sbUpdate(table: string, filters: string[], patch: Record<string, unknown>): Promise<{ rows: Record<string, unknown>[]; error?: string; code?: string }> {
  const res = await sbFetch(`/${table}?${filters.join("&")}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
    headers: { "Prefer": "return=representation" },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    let msg = t, code = String(res.status);
    try { const j = JSON.parse(t); msg = j.message ?? t; code = j.code ?? code; } catch { /* raw */ }
    return { rows: [], error: msg, code };
  }
  const rows = await res.json().catch(() => []);
  return { rows: Array.isArray(rows) ? rows : [] };
}

async function sbDelete(table: string, filters: string[]): Promise<{ rows: Record<string, unknown>[]; ok: boolean; error?: string }> {
  const res = await sbFetch(`/${table}?${filters.join("&")}`, {
    method: "DELETE",
    headers: { "Prefer": "return=representation" },
  });
  if (!res.ok) return { rows: [], ok: false, error: await res.text().catch(() => "delete failed") };
  const rows = await res.json().catch(() => []);
  return { rows: Array.isArray(rows) ? rows : [], ok: true };
}

// ==================== اكتشاف مخطط قاعدة البيانات (OpenAPI) ==================
type SchemaInfo = { tables: Record<string, Record<string, { type?: string; format?: string }>>; at: number };
let schemaCache: SchemaInfo | null = null;

async function getSchema(): Promise<Record<string, Record<string, { type?: string; format?: string }>>> {
  if (schemaCache && Date.now() - schemaCache.at < 300_000) return schemaCache.tables;
  try {
    const res = await sbFetch("/", { headers: { "Accept": "application/openapi+json" } });
    if (!res.ok) { dbg("schema fetch failed", res.status); schemaCache = { tables: {}, at: Date.now() }; return {}; }
    const spec = await res.json();
    // PostgREST: definitions.{table}.properties.{column}
    const defs = (spec?.definitions ?? {}) as Record<string, { properties?: Record<string, { type?: string; format?: string }> }>;
    const tables: Record<string, Record<string, { type?: string; format?: string }>> = {};
    for (const [t, def] of Object.entries(defs)) {
      if (def?.properties && typeof def.properties === "object") tables[t] = def.properties;
    }
    schemaCache = { tables, at: Date.now() };
    dbg("schema tables:", Object.keys(tables).join(","));
    return tables;
  } catch (e) {
    dbg("schema error", e);
    schemaCache = { tables: {}, at: Date.now() };
    return {};
  }
}

const tableResolveCache = new Map<string, string | null>();

async function resolveTable(key: string): Promise<string | null> {
  if (PINNED[key]) return PINNED[key];
  if (tableResolveCache.has(key)) return tableResolveCache.get(key) ?? null;
  const schema = await getSchema();
  for (const cand of TABLE_CANDIDATES[key] ?? []) {
    if (schema[cand]) { tableResolveCache.set(key, cand); return cand; }
  }
  tableResolveCache.set(key, null);
  return null;
}

/** يطابق قائمة مرشّحات أسماء الأعمدة مع أعمدة الجدول الفعلية */
async function resolveCol(table: string | null, candidates: string[]): Promise<string | null> {
  if (!table) return null;
  const schema = await getSchema();
  const cols = schema[table];
  if (!cols) return null;
  for (const cand of candidates) if (cols[cand]) return cand;
  // مطابقة غير حساسة لحالة الأحرف كخطة بديلة
  const lower = Object.keys(cols);
  for (const cand of candidates) {
    const hit = lower.find((c) => c.toLowerCase() === cand.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

// ============================ المصادقة والصلاحيات ============================
type AuthCtx = { userId: string; source: "api_key" | "token"; plan: string; rateKey: string };

/** يتحقق من Bearer: مفتاح rise_… أو access token صادر من OAuth */
async function authenticate(req: Request): Promise<AuthCtx | { error: string }> {
  const header = req.headers.get("Authorization") ?? "";
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  if (!bearer) {
    return { error: "مطلوب مفتاح MCP: Authorization: Bearer rise_… — أنشئه من الإعدادات (خطة ماكس)" };
  }

  // 1) جدول مفاتيح API
  const keysTable = await resolveTable("keys");
  if (keysTable) {
    const keyCol = (await resolveCol(keysTable, COL.key)) ?? "key";
    const res = await sbSelect(keysTable, { filters: [`${keyCol}=eq.${encodeURIComponent(bearer)}`], limit: 2 });
    let row = res.rows[0];
    // ربما يُخزَّن المفتاح كـ SHA-256
    if (!row && !/^(awjt_|awjr_|awjc_)/.test(bearer)) {
      const hash = await sha256Hex(bearer);
      const res2 = await sbSelect(keysTable, { filters: [`${keyCol}=eq.${encodeURIComponent(hash)}`], limit: 2 });
      row = res2.rows[0];
    }
    if (row) {
      const revokedCol = await resolveCol(keysTable, COL.keyRevoked);
      const activeCol = await resolveCol(keysTable, COL.keyActive);
      const userIdCol = (await resolveCol(keysTable, COL.userId)) ?? "user_id";
      if (revokedCol && row[revokedCol] === true) return { error: "مفتاح MCP غير صالح أو ملغى" };
      if (activeCol && (row[activeCol] === false || row[activeCol] === "revoked" || row[activeCol] === "inactive")) {
        return { error: "مفتاح MCP غير صالح أو ملغى" };
      }
      const uid = row[userIdCol];
      if (!uid) return { error: "مفتاح MCP غير مرتبط بمستخدم — راجع إعدادات التكامل داخل أوج" };
      const plan = await getUserPlan(String(uid));
      return { userId: String(uid), source: "api_key", plan, rateKey: `k:${bearer.slice(-8)}` };
    }
  }

  // 2) جدول رموز OAuth (access token)
  const tokensTable = await resolveTable("tokens");
  if (tokensTable) {
    const tokenCol = (await resolveCol(tokensTable, COL.token)) ?? "token";
    const res = await sbSelect(tokensTable, { filters: [`${tokenCol}=eq.${encodeURIComponent(bearer)}`], limit: 2 });
    const row = res.rows[0];
    if (row) {
      const expCol = await resolveCol(tokensTable, COL.tokenExp);
      const revCol = await resolveCol(tokensTable, COL.tokenRevoked);
      const userIdCol = (await resolveCol(tokensTable, COL.userId)) ?? "user_id";
      if (revCol && row[revCol] === true) return { error: "انتهت صلاحية الجلسة — أعد ربط الموصل من إعدادات أوج" };
      if (expCol && row[expCol] && new Date(String(row[expCol])).getTime() < Date.now()) {
        return { error: "انتهت صلاحية الرمز — سيجدده العميل تلقائيًا أو أعد الاتصال" };
      }
      const uid = row[userIdCol];
      if (!uid) return { error: "رمز غير مرتبط بمستخدم" };
      const plan = await getUserPlan(String(uid));
      return { userId: String(uid), source: "token", plan, rateKey: `t:${bearer.slice(-8)}` };
    }
  }

  return { error: "مفتاح MCP غير صالح أو ملغى" };
}

/** خطة المستخدم الحالية (إن توفرت أعمدة/جداول الاشتراك) */
async function getUserPlan(userId: string): Promise<string> {
  try {
    const profilesTable = await resolveTable("profiles");
    if (profilesTable) {
      const uidCol = (await resolveCol(profilesTable, COL.userId)) ?? "user_id";
      const planCol = await resolveCol(profilesTable, COL.plan);
      if (planCol) {
        const res = await sbSelect(profilesTable, { filters: [`${uidCol}=eq.${encodeURIComponent(userId)}`], limit: 1 });
        const p = res.rows[0]?.[planCol];
        if (p) return String(p);
      }
    }
    const subsTable = await resolveTable("subs");
    if (subsTable) {
      const uidCol = (await resolveCol(subsTable, COL.userId)) ?? "user_id";
      const planCol = await resolveCol(subsTable, COL.plan);
      const statusCol = await resolveCol(subsTable, COL.subStatus);
      if (planCol) {
        const res = await sbSelect(subsTable, { filters: [`${uidCol}=eq.${encodeURIComponent(userId)}`], order: "created_at.desc", limit: 1 });
        const row = res.rows[0];
        if (row && (!statusCol || ["active", "trialing", "trial", "paid", "مفعل"].includes(String(row[statusCol]).toLowerCase()))) {
          return String(row[planCol] ?? "");
        }
      }
    }
  } catch (e) { dbg("plan lookup failed", e); }
  return "";
}

// ============================ تحديد معدل الاستخدام ===========================
const rateWindows = new Map<string, { mStart: number; mCount: number; hStart: number; hCount: number }>();

function checkRate(key: string): { ok: boolean; retryAfterSec?: number } {
  const now = nowSec();
  let w = rateWindows.get(key);
  if (!w || now - w.hStart >= 3600) w = { mStart: now, mCount: 0, hStart: now, hCount: 0 };
  if (now - w.mStart >= 60) { w.mStart = now; w.mCount = 0; }
  w.mCount++; w.hCount++;
  rateWindows.set(key, w);
  if (rateWindows.size > 5000) rateWindows.clear();
  if (w.mCount > CFG.RATE.perMinute) return { ok: false, retryAfterSec: 60 - (now - w.mStart) };
  if (w.hCount > CFG.RATE.perHour) return { ok: false, retryAfterSec: 3600 - (now - w.hStart) };
  return { ok: true };
}

// سجل تدقيق (أفضل جهد — يتجاهل الصمت إن لم يوجد الجدول)
async function audit(userId: string, tool: string, ok: boolean, detail = ""): Promise<void> {
  try {
    const t = await resolveTable("audit");
    if (!t) return;
    const schema = await getSchema();
    const cols = schema[t] ?? {};
    const row: Record<string, unknown> = {};
    for (const [field, cand] of Object.entries({
      user_id: COL.userId, tool_name: ["tool_name", "tool", "action", "method"],
      ok: ["ok", "success", "status"], detail: ["detail", "details", "message", "meta"], created_at: COL.created,
    })) {
      for (const c of cand) if (cols[c]) { row[c] = field === "user_id" ? userId : field === "tool_name" ? tool : field === "ok" ? ok : safeStr(detail, 500); break; }
    }
    if (!row.user_id || !row.tool_name) return;
    await sbInsert(t, row);
  } catch { /* تجاهل */ }
}

// ============================ مسارات OAuth 2.1 ===============================

/** نطاقات redirect المسموح بها: ChatGPT / OpenAI / Google / AI Studio / loopback لأدوات CLI */
function allowedRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol === "http:" && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(u.hostname)) return true;
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return (
      host.endsWith(".chatgpt.com") || host === "chatgpt.com" ||
      host.endsWith(".openai.com") || host === "openai.com" ||
      host.endsWith(".google.com") || host === "google.com" ||
      host.endsWith(".googleusercontent.com") ||
      host.endsWith(".aistudio.google.com") || host === "aistudio.google.com"
    );
  } catch { return false; }
}

async function handleAuthorize(req: Request, url: URL): Promise<Response> {
  const p = url.searchParams;
  const forwardToSite = (err?: string) => {
    const q = new URLSearchParams();
    for (const k of ["response_type", "client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope"]) {
      const v = p.get(k); if (v) q.set(k, v);
    }
    if (err) q.set("error", err);
    return redirect(`${CFG.SITE_URL}/mcp/authorize?${q.toString()}`);
  };

  const clientId = p.get("client_id") ?? "";
  const redirectUri = p.get("redirect_uri") ?? "";
  const responseType = p.get("response_type") ?? "";
  const challenge = p.get("code_challenge") ?? "";
  const challengeMethod = p.get("code_challenge_method") ?? "";
  const state = p.get("state") ?? "";
  const apiKey = p.get("api_key") ?? "";

  if (responseType !== "code") return forwardToSite("unsupported_response_type");
  if (clientId !== CFG.FIXED_CLIENT_ID) return forwardToSite("invalid_client");
  if (!redirectUri || !allowedRedirect(redirectUri)) return forwardToSite("invalid_redirect_uri");
  if (!challenge || challengeMethod !== "S256") return forwardToSite("invalid_request");
  if (!apiKey) return forwardToSite(); // صفحة تسجيل الدخول/الموافقة على الموقع

  // التحقق من مفتاح MCP الشخصي
  const auth = await authenticate(new Request("https://mcp.local/", { headers: { Authorization: `Bearer ${apiKey}` } }));
  if ("error" in auth) return forwardToSite("invalid_key");

  // إنشاء كود تفويض أحادي الاستخدام
  const code = randomToken("awjc_");
  const codesTable = await resolveTable("codes");
  if (!codesTable) {
    return json({ error: "server_error", error_description: "جدول أكواد التفويض غير موجود — راجع MCP_TABLES_JSON (codes)" }, 500);
  }
  const schema = await getSchema();
  const cols = schema[codesTable] ?? {};
  const codeCol = (await resolveCol(codesTable, COL.code)) ?? "code";
  const pick = async (cands: string[], fallback: string) => (await resolveCol(codesTable, cands)) ?? (cols[fallback] ? fallback : null);
  const row: Record<string, unknown> = { [codeCol]: code };
  const map: Array<[string[], string, unknown]> = [
    [COL.codeChallenge, "code_challenge", challenge],
    [COL.codeRedirect, "redirect_uri", redirectUri],
    [COL.tokenClient, "client_id", clientId],
    [COL.userId, "user_id", auth.userId],
    [COL.codeExp, "expires_at", isoPlus(CFG.CODE_TTL_SEC)],
    [COL.codeUsed, "used", false],
    [["scope"], "scope", CFG.SCOPE],
    [["state"], "state", state],
  ];
  for (const [cands, fallback, value] of map) {
    const col = await pick(cands, fallback);
    if (col) row[col] = value;
  }
  // أعمدة إضافية شائعة
  if (cols["created_at"]) row["created_at"] = isoNow();
  const ins = await sbInsert(codesTable, row);
  if (ins.error) {
    return json({ error: "server_error", error_description: `فشل حفظ كود التفويض: ${ins.code ?? ""} ${CFG.DEBUG ? ins.error : ""}`.trim() }, 500);
  }

  const back = new URL(redirectUri);
  back.searchParams.set("code", code);
  if (state) back.searchParams.set("state", state);
  await audit(auth.userId, "oauth.authorize", true);
  return redirect(back.toString());
}

async function readBodyParams(req: Request): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const ct = req.headers.get("Content-Type") ?? "";
  if (ct.includes("application/json")) {
    try {
      const j = await req.json();
      for (const [k, v] of Object.entries(j ?? {})) if (v != null) out[k] = String(v);
      return out;
    } catch { /* fallthrough */ }
  }
  try {
    const form = await req.formData();
    for (const [k, v] of form.entries()) out[k] = String(v);
  } catch { /* empty */ }
  return out;
}

async function handleToken(req: Request): Promise<Response> {
  const p = await readBodyParams(req);
  const grant = p["grant_type"] ?? "";
  const tokensTable = await resolveTable("tokens");
  if (!tokensTable) {
    return json({ error: "server_error", error_description: "جدول رموز MCP غير موجود — راجع MCP_TABLES_JSON (tokens)" }, 500);
  }
  const schema = await getSchema();
  const tCols = schema[tokensTable] ?? {};
  const tc = async (cands: string[], fallback: string) => (await resolveCol(tokensTable, cands)) ?? (tCols[fallback] ? fallback : null);

  if (grant === "authorization_code") {
    const code = p["code"] ?? "";
    if (!code.startsWith("awjc_")) return json({ error: "invalid_grant", error_description: "code is invalid (malformed)" }, 400);
    const verifier = p["code_verifier"] ?? "";
    const clientId = p["client_id"] ?? "";
    const redirectUri = p["redirect_uri"] ?? "";
    const codesTable = await resolveTable("codes");
    if (!codesTable) return json({ error: "server_error", error_description: "codes store missing" }, 500);

    const codeCol = (await resolveCol(codesTable, COL.code)) ?? "code";
    const res = await sbSelect(codesTable, { filters: [`${codeCol}=eq.${encodeURIComponent(code)}`], limit: 2 });
    const row = res.rows[0];
    if (!row) return json({ error: "invalid_grant", error_description: "code is invalid (not found)" }, 400);

    const expCol = await resolveCol(codesTable, COL.codeExp);
    const usedCol = await resolveCol(codesTable, COL.codeUsed);
    const chalCol = (await resolveCol(codesTable, COL.codeChallenge)) ?? "code_challenge";
    const redCol = (await resolveCol(codesTable, COL.codeRedirect)) ?? "redirect_uri";
    const clientCol = (await resolveCol(codesTable, COL.tokenClient)) ?? "client_id";
    const userIdCol = (await resolveCol(codesTable, COL.userId)) ?? "user_id";

    if (usedCol && (row[usedCol] === true || (typeof row[usedCol] === "string" && row[usedCol]))) {
      return json({ error: "invalid_grant", error_description: "code already used" }, 400);
    }
    if (expCol && row[expCol] && new Date(String(row[expCol])).getTime() < Date.now()) {
      return json({ error: "invalid_grant", error_description: "code expired" }, 400);
    }
    if (String(row[redCol] ?? "") !== redirectUri) return json({ error: "invalid_grant", error_description: "redirect_uri mismatch" }, 400);
    if (String(row[clientCol] ?? "") !== clientId) return json({ error: "invalid_grant", error_description: "client mismatch" }, 400);
    if (verifier) {
      const computed = await sha256B64url(verifier);
      if (computed !== String(row[chalCol] ?? "")) {
        return json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
      }
    } else if (String(row[chalCol] ?? "")) {
      return json({ error: "invalid_grant", error_description: "code_verifier required" }, 400);
    }
    const userId = String(row[userIdCol] ?? "");
    if (!userId) return json({ error: "invalid_grant", error_description: "code has no user" }, 400);

    // تعليم الكود كمستهلك
    if (usedCol) await sbUpdate(codesTable, [`${codeCol}=eq.${encodeURIComponent(code)}`], { [usedCol]: true });
    else await sbDelete(codesTable, [`${codeCol}=eq.${encodeURIComponent(code)}`]);

    return await issueTokens(tokensTable, tCols, tc, userId, clientId);
  }

  if (grant === "refresh_token") {
    const refresh = p["refresh_token"] ?? "";
    if (!refresh) return json({ error: "invalid_grant", error_description: "refresh_token required" }, 400);
    const refreshCol = (await resolveCol(tokensTable, COL.refresh)) ?? "refresh_token";
    const res = await sbSelect(tokensTable, { filters: [`${refreshCol}=eq.${encodeURIComponent(refresh)}`], limit: 2 });
    const row = res.rows[0];
    if (!row) return json({ error: "invalid_grant", error_description: "refresh token invalid" }, 400);
    const revCol = await resolveCol(tokensTable, COL.tokenRevoked);
    const expCol = await resolveCol(tokensTable, COL.tokenExp);
    const userIdCol = (await resolveCol(tokensTable, COL.userId)) ?? "user_id";
    const clientCol = await resolveCol(tokensTable, COL.tokenClient);
    if (revCol && row[revCol] === true) return json({ error: "invalid_grant", error_description: "refresh token revoked" }, 400);
    if (expCol && row[expCol] && new Date(String(row[expCol])).getTime() < Date.now()) {
      return json({ error: "invalid_grant", error_description: "refresh token expired" }, 400);
    }
    const userId = String(row[userIdCol] ?? "");
    if (!userId) return json({ error: "invalid_grant", error_description: "no user" }, 400);
    return await issueTokens(tokensTable, tCols, tc, userId, clientCol ? String(row[clientCol] ?? "") : (p["client_id"] ?? ""));
  }

  return json({ error: "unsupported_grant_type", error_description: "المعتمد: authorization_code / refresh_token" }, 400);
}

async function issueTokens(
  tokensTable: string, tCols: Record<string, unknown>, tc: (c: string[], f: string) => Promise<string | null>,
  userId: string, clientId: string,
): Promise<Response> {
  const accessToken = randomToken("awjt_");
  const refreshToken = randomToken("awjr_");
  const tokenCol = await tc(COL.token, "token");
  const refreshCol = await tc(COL.refresh, "refresh_token");
  const userCol = await tc(COL.userId, "user_id");
  const clientCol = await tc(COL.tokenClient, "client_id");
  const expCol = await tc(COL.tokenExp, "expires_at");
  const scopeCol = tCols["scope"] ? "scope" : null;

  const row: Record<string, unknown> = {};
  if (tokenCol) row[tokenCol] = accessToken;
  if (refreshCol) row[refreshCol] = refreshToken;
  if (userCol) row[userCol] = userId;
  if (clientCol) row[clientCol] = clientId;
  if (expCol) row[expCol] = isoPlus(CFG.REFRESH_TTL_SEC);
  if (scopeCol) row[scopeCol] = CFG.SCOPE;
  if (tCols["created_at"]) row["created_at"] = isoNow();
  if (tCols["type"]) row["type"] = "mcp_oauth";

  const ins = await sbInsert(tokensTable, row);
  if (ins.error) {
    return json({ error: "server_error", error_description: `فشل حفظ الرموز: ${ins.code ?? ""} ${CFG.DEBUG ? ins.error : ""}`.trim() }, 500);
  }
  return json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: CFG.ACCESS_TTL_SEC,
    refresh_token: refreshToken,
    scope: CFG.SCOPE,
  });
}

async function handleRevoke(req: Request): Promise<Response> {
  const p = await readBodyParams(req);
  const token = p["token"] ?? "";
  if (!token) return json({ error: "invalid_request", error_description: "token required" }, 400);
  const tokensTable = await resolveTable("tokens");
  if (tokensTable) {
    const tokenCol = (await resolveCol(tokensTable, COL.token)) ?? "token";
    const revCol = await resolveCol(tokensTable, COL.tokenRevoked);
    if (revCol) await sbUpdate(tokensTable, [`${tokenCol}=eq.${encodeURIComponent(token)}`], { [revCol]: true });
    else await sbDelete(tokensTable, [`${tokenCol}=eq.${encodeURIComponent(token)}`]);
  }
  return json({}, 200);
}

function handleRegister(): Response {
  const secret = randomToken("csecret_");
  return json({
    client_id: CFG.FIXED_CLIENT_ID,
    client_secret: secret,
    client_id_issued_at: Date.now(),
    client_name: "Awj MCP",
    redirect_uris: ["https://chatgpt.com/connector/oauth", "http://localhost/oauth2/callback"],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: CFG.SCOPE,
  });
}

function wellKnown(kind: "protected" | "auth"): Response {
  const here = `${SB_URL}/functions/v1/mcp`;
  if (kind === "protected") {
    return json({
      resource: here,
      authorization_servers: [here],
      scopes_supported: [CFG.SCOPE],
    });
  }
  return json({
    issuer: here,
    authorization_endpoint: `${CFG.SITE_URL}/mcp/authorize`,
    token_endpoint: `${here}?oauth=token`,
    registration_endpoint: `${here}/register`,
    revocation_endpoint: `${here}?oauth=revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
    scopes_supported: [CFG.SCOPE],
  });
}

// ======================= سجل الأدوات (MCP Tools) ============================
type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};
type ToolCtx = { userId: string; plan: string };
type ToolDef = {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  tables: string[];
  run: (ctx: ToolCtx, args: Record<string, unknown>) => Promise<ToolResult>;
};

function txt(text: string, data?: Record<string, unknown>): ToolResult {
  return { content: [{ type: "text", text }], ...(data ? { structuredContent: data } : {}) };
}
function toolErr(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

async function colType(table: string, col: string): Promise<string | undefined> {
  const schema = await getSchema();
  return schema[table]?.[col]?.type;
}
function pickRow(row: Record<string, unknown>, cands: string[]): unknown {
  for (const c of cands) if (row[c] !== undefined && row[c] !== null) return row[c];
  return undefined;
}
function short(v: unknown, n = 120): string {
  const s = typeof v === "string" ? v : v == null ? "" : JSON.stringify(v);
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// ---- إعدادات كل كيان (تُولّد الأدوات القياسية تلقائيًا) ----
interface FieldSpec {
  arg: string;               // اسم الوسيط في schema
  cands: string[];           // مرشّحات اسم العمود في قاعدة البيانات
  max?: number;
  required?: boolean;
  type?: "text" | "date" | "number" | "tags" | "bool";
  desc?: string;
}
interface EntityCfg {
  tableKey: string;
  arPlural: string;  arSingular: string;  icon: string;
  titleCands: string[];
  contentCands: string[];
  fields: FieldSpec[];       // حقول الإنشاء/التعديل (title أولًا)
  hasDone?: boolean;
  doneValues?: { true: string | true; false: string | false }; // لعمود status نصي
  defaultOrderCol?: "created" | "due" | "title";
  dueCands?: string[];
}

const ENTITIES: Record<string, EntityCfg> = {
  tasks: {
    tableKey: "tasks", arPlural: "المهام", arSingular: "مهمة", icon: "✅",
    titleCands: COL.title, contentCands: [...COL.content, "notes", "note"],
    fields: [
      { arg: "title", cands: COL.title, max: CFG.MAX_TITLE, required: true, desc: "عنوان المهمة" },
      { arg: "notes", cands: [...COL.content, "notes", "note"], max: CFG.MAX_TEXT, desc: "تفاصيل المهمة" },
      { arg: "priority", cands: COL.priority, desc: "الأولوية: عالية/متوسطة/منخفضة أو high/medium/low" },
      { arg: "due_date", cands: COL.due, type: "date", desc: "تاريخ الاستحقاق بصيغة ISO مثل 2026-09-20" },
      { arg: "tags", cands: COL.tags, type: "tags", desc: "وسوم" },
    ],
    hasDone: true, defaultOrderCol: "created", dueCands: COL.due,
  },
  notes: {
    tableKey: "notes", arPlural: "الملاحظات", arSingular: "ملاحظة", icon: "📝",
    titleCands: COL.title, contentCands: COL.content,
    fields: [
      { arg: "title", cands: COL.title, max: CFG.MAX_TITLE, desc: "عنوان الملاحظة (اختياري)" },
      { arg: "content", cands: COL.content, max: CFG.MAX_TEXT, required: true, desc: "نص الملاحظة" },
      { arg: "tags", cands: COL.tags, type: "tags", desc: "وسوم" },
      { arg: "pinned", cands: ["pinned", "is_pinned", "is_favorite", "favorite"], type: "bool", desc: "تثبيت الملاحظة" },
      { arg: "color", cands: ["color", "colour"], desc: "لون" },
    ],
    hasDone: false, defaultOrderCol: "created",
  },
  habits: {
    tableKey: "habits", arPlural: "العادات", arSingular: "عادة", icon: "🔁",
    titleCands: COL.title, contentCands: [...COL.content, "notes"],
    fields: [
      { arg: "title", cands: COL.title, max: CFG.MAX_TITLE, required: true, desc: "اسم العادة" },
      { arg: "notes", cands: [...COL.content, "notes"], max: 2000, desc: "وصف اختياري" },
      { arg: "frequency", cands: ["frequency", "repeat", "recurrence", "repeat_rule", "schedule"], desc: "التكرار: يومي/أسبوعي أو daily/weekly" },
      { arg: "target", cands: ["target", "target_value", "goal_value", "daily_target", "target_count"], type: "number", desc: "الهدف اليومي (عدد)" },
      { arg: "unit", cands: ["unit", "target_unit"], desc: "وحدة القياس" },
    ],
    hasDone: false, defaultOrderCol: "created",
  },
  reminders: {
    tableKey: "reminders", arPlural: "التذكيرات", arSingular: "تذكير", icon: "⏰",
    titleCands: COL.title, contentCands: COL.content,
    fields: [
      { arg: "title", cands: COL.title, max: CFG.MAX_TITLE, required: true, desc: "نص التذكير" },
      { arg: "remind_at", cands: [...COL.due, "remind_at", "remindAt", "time", "scheduled_at", "fire_at"], type: "date", required: true, desc: "موعد التذكير بصيغة ISO" },
      { arg: "repeat", cands: ["repeat", "recurrence", "repeat_rule", "frequency"], desc: "تكرار: none/daily/weekly/monthly" },
    ],
    hasDone: true, doneValues: { true: "completed", false: "pending" }, defaultOrderCol: "due", dueCands: [...COL.due, "remind_at", "remindAt", "time"],
  },
  journal: {
    tableKey: "journal", arPlural: "اليوميات", arSingular: "يومية", icon: "📔",
    titleCands: [...COL.title, "date", "day"], contentCands: [...COL.content, "entry", "reflection"],
    fields: [
      { arg: "content", cands: [...COL.content, "entry", "reflection"], max: CFG.MAX_TEXT, required: true, desc: "نص اليومية" },
      { arg: "date", cands: ["date", "entry_date", "day", "journal_date"], type: "date", desc: "تاريخ اليومية (افتراضي اليوم)" },
      { arg: "mood", cands: ["mood", "mood_rating", "feeling"], desc: "المزاج أو تقييمه" },
      { arg: "gratitude", cands: ["gratitude", "grateful_for"], max: 2000, desc: "الامتنان" },
      { arg: "title", cands: COL.title, max: CFG.MAX_TITLE, desc: "عنوان اختياري" },
    ],
    hasDone: false, defaultOrderCol: "created",
  },
  goals: {
    tableKey: "goals", arPlural: "الأهداف", arSingular: "هدف", icon: "🎯",
    titleCands: COL.title, contentCands: [...COL.content, "notes", "description"],
    fields: [
      { arg: "title", cands: COL.title, max: CFG.MAX_TITLE, required: true, desc: "اسم الهدف" },
      { arg: "notes", cands: [...COL.content, "notes", "description"], max: 4000, desc: "وصف الهدف" },
      { arg: "target", cands: ["target", "target_value", "goal_value", "target_amount"], type: "number", desc: "القيمة المستهدفة" },
      { arg: "current", cands: ["current", "current_value", "progress", "progress_value", "current_amount"], type: "number", desc: "القيمة الحالية" },
      { arg: "unit", cands: ["unit", "target_unit"], desc: "وحدة القياس" },
      { arg: "deadline", cands: [...COL.due, "deadline", "target_date"], type: "date", desc: "الموعد النهائي" },
      { arg: "status", cands: COL.status, desc: "الحالة" },
    ],
    hasDone: true, doneValues: { true: "completed", false: "active" }, defaultOrderCol: "created",
  },
  events: {
    tableKey: "events", arPlural: "أحداث التقويم", arSingular: "حدث", icon: "📅",
    titleCands: COL.title, contentCands: [...COL.content, "notes", "description"],
    fields: [
      { arg: "title", cands: COL.title, max: CFG.MAX_TITLE, required: true, desc: "عنوان الحدث" },
      { arg: "start", cands: ["start_time", "start", "starts_at", "start_at", "begin_at", "from"], type: "date", required: true, desc: "وقت البدء ISO" },
      { arg: "end", cands: ["end_time", "end", "ends_at", "end_at", "to"], type: "date", desc: "وقت الانتهاء ISO" },
      { arg: "notes", cands: [...COL.content, "notes", "description"], max: 2000, desc: "ملاحظات" },
      { arg: "location", cands: ["location", "place"], max: 200, desc: "المكان" },
    ],
    hasDone: false, defaultOrderCol: "due", dueCands: ["start_time", "start", "starts_at", "start_at"],
  },
};

// ---------- مصانع الأدوات القياسية (list / create / get / update / delete / complete) ----------

function statusFilterLine(row: Record<string, unknown>, cfg: EntityCfg, doneCol: string | null, statusCol: string | null): string {
  if (doneCol && typeof row[doneCol] === "boolean") return row[doneCol] ? "مكتمل" : "قيد التنفيذ";
  if (statusCol && row[statusCol] != null) return String(row[statusCol]);
  return "";
}

async function entityRowLine(i: number, row: Record<string, unknown>, cfg: EntityCfg, table: string): Promise<string> {
  const title = pickRow(row, cfg.titleCands);
  const content = pickRow(row, cfg.contentCands);
  const doneCol = await resolveCol(table, COL.done);
  const statusCol = await resolveCol(table, COL.status);
  const prio = pickRow(row, COL.priority);
  const due = pickRow(row, cfg.dueCands ?? COL.due);
  const tags = pickRow(row, COL.tags);
  const parts: string[] = [];
  const st = statusFilterLine(row, cfg, doneCol, statusCol);
  if (st) parts.push(st === "مكتمل" ? "✅" : st === "قيد التنفيذ" ? "⏳" : `[${st}]`);
  if (prio) parts.push(`[${String(prio)}]`);
  parts.push(title ? String(title) : (content ? short(content, 60) : `#${pickRow(row, COL.id) ?? ""}`));
  if (due) parts.push(`— ${arDate(due)}`);
  if (tags) parts.push(`#${Array.isArray(tags) ? tags.join(" #") : String(tags)}`);
  return `${i}. ${parts.join(" ")}`;
}

function makeListTool(entity: string, cfg: EntityCfg): ToolDef {
  return {
    name: entity === "journal" ? "journal_list" : `${entity}_list`,
    description: `عرض ${cfg.arPlural} الخاصة بالمستخدم. يدعم التصفية (status: open/done/all)، البحث النصي (search)، تاريخ الاستحقاق (due: overdue/upcoming/today)، والوسوم (tag).`,
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["open", "done", "all"], description: "التصفية بالحالة" },
        search: { type: "string", description: "بحث نصي في العنوان والمحتوى" },
        tag: { type: "string", description: "تصفية بوسم" },
        due: { type: "string", enum: ["overdue", "upcoming", "today"], description: "تصفية بالتاريخ" },
        limit: { type: "number", description: `أقصى عدد نتائج (1–${CFG.MAX_LIST}، افتراضي 20)` },
      },
    },
    tables: [cfg.tableKey],
    run: async (ctx, args) => {
      const t = await resolveTable(cfg.tableKey);
      if (!t) return toolErr(`جدول ${cfg.tableKey} غير موجود في قاعدة البيانات.`);
      const uidCol = (await resolveCol(t, COL.userId)) ?? "user_id";
      const filters: string[] = [`${uidCol}=eq.${encodeURIComponent(ctx.userId)}`];
      const status = String(args.status ?? (cfg.hasDone ? "open" : "all"));

      const doneCol = await resolveCol(t, COL.done);
      const statusCol = await resolveCol(t, COL.status);
      const doneIsBool = doneCol ? (await colType(t, doneCol)) === "boolean" : false;
      if (status !== "all") {
        if (cfg.doneValues && statusCol && !doneIsBool) {
          filters.push(`${statusCol}=eq.${encodeURIComponent(status === "done" ? String(cfg.doneValues.true) : String(cfg.doneValues.false))}`);
        } else if (doneCol) {
          filters.push(`${doneCol}=eq.${status === "done"}`);
        } else if (statusCol) {
          filters.push(`${statusCol}=eq.${encodeURIComponent(status)}`);
        }
      }

      const search = safeStr(args.search, 100).trim();
      if (search) {
        const textCands = [...new Set([...cfg.titleCands, ...cfg.contentCands])];
        const resolvedCols = (await Promise.all(textCands.map((c) => resolveCol(t, [c])))).filter(Boolean) as string[];
        // البحث النصي فقط على الأعمدة النصية (ilike لا يعمل على التواريخ)
        const textCols: string[] = [];
        for (const c of resolvedCols) if ((await colType(t, c)) === "string") textCols.push(c);
        if (textCols.length) {
          const conds = textCols.map((c) => `${c}.ilike.*${encodeURIComponent(search)}*`);
          // PostgREST يتوقع الأقواس والفواصل في or=() خامًا (غير مُرمَّزة) والقيم مُرمَّزة
          filters.push(`or=(${conds.join(",")})`);
        }
      }
      const tag = safeStr(args.tag, 60).trim();
      if (tag) {
        const tagsCol = await resolveCol(t, COL.tags);
        if (tagsCol && (await colType(t, tagsCol)) === "array") filters.push(`${tagsCol}=cs.${JSON.stringify([tag])}`);
        else if (tagsCol) filters.push(`${tagsCol}=ilike.*${encodeURIComponent(tag)}*`);
      }
      const due = String(args.due ?? "");
      if (due) {
        const dueCol = await resolveCol(t, cfg.dueCands ?? COL.due);
        if (dueCol) {
          const now = new Date();
          if (due === "overdue") {
            filters.push(`${dueCol}=lt.${now.toISOString()}`);
            if (doneCol) filters.push(`${doneCol}=eq.false`);
          } else if (due === "upcoming") filters.push(`${dueCol}=gte.${now.toISOString()}`);
          else if (due === "today") {
            const end = new Date(now); end.setHours(23, 59, 59, 999);
            filters.push(`${dueCol}=gte.${now.toISOString()}`);
            filters.push(`${dueCol}=lte.${end.toISOString()}`);
          }
        }
      }

      let orderCol: string | null = null;
      if (cfg.defaultOrderCol === "due") orderCol = await resolveCol(t, cfg.dueCands ?? COL.due);
      if (!orderCol) orderCol = await resolveCol(t, COL.created) ?? await resolveCol(t, COL.id);
      const order = orderCol ? `order=${orderCol}.${cfg.defaultOrderCol === "due" ? "asc.nullslast" : "desc"}` : "";
      const limit = Math.max(1, Math.min(Number(args.limit) || 20, CFG.MAX_LIST));

      const res = await sbSelect(t, { filters, order, limit });
      if (res.error) return toolErr(`تعذر جلب ${cfg.arPlural}: ${res.code ?? ""} ${CFG.DEBUG ? res.error : ""}`.trim());
      if (!res.rows.length) return txt(`لا توجد ${cfg.arPlural} مطابقة. 🗂️`);

      const lines = await Promise.all(res.rows.slice(0, 25).map((r, i) => entityRowLine(i + 1, r, cfg, t)));
      const more = res.rows.length > 25 ? `\n(+${res.rows.length - 25} أخرى…)` : "";
      return txt(`${cfg.icon} ${res.rows.length} من ${cfg.arPlural}:\n${lines.join("\n")}${more}`,
        { count: res.rows.length, items: res.rows });
    },
  };
}

function makeCreateTool(entity: string, cfg: EntityCfg): ToolDef {
  const required = cfg.fields.filter((f) => f.required);
  return {
    name: entity === "journal" ? "journal_entry_create" : `${entity.slice(0, -1)}_create`,
    description: `إنشاء ${cfg.arSingular} جديدة في حساب المستخدم في أوج.`,
    inputSchema: {
      type: "object",
      properties: Object.fromEntries(cfg.fields.map((f) => [f.arg, {
        type: f.type === "tags" ? "array" : f.type === "number" ? "number" : f.type === "bool" ? "boolean" : "string",
        description: f.desc ?? f.arg,
        ...(f.type === "tags" ? { items: { type: "string" } } : {}),
      }])),
      ...(required.length ? { required: required.map((f) => f.arg) } : {}),
    },
    tables: [cfg.tableKey],
    run: async (ctx, args) => {
      const t = await resolveTable(cfg.tableKey);
      if (!t) return toolErr(`جدول ${cfg.tableKey} غير موجود.`);
      for (const f of required) {
        const v = args[f.arg];
        if (v == null || (typeof v === "string" && !v.trim())) return toolErr(`الحقل «${f.arg}» مطلوب.`);
      }
      const schema = await getSchema();
      const cols = schema[t] ?? {};
      const row: Record<string, unknown> = {};
      for (const f of cfg.fields) {
        const v = args[f.arg];
        if (v == null || v === "") continue;
        const col = await resolveCol(t, f.cands);
        if (!col) continue;
        if (f.type === "date") {
          const d = new Date(String(v));
          if (isNaN(d.getTime())) return toolErr(`تاريخ غير صالح للحقل «${f.arg}» — استخدم صيغة ISO.`);
          row[col] = d.toISOString();
        } else if (f.type === "number") {
          const n = Number(v);
          if (isNaN(n)) return toolErr(`قيمة رقمية غير صالحة للحقل «${f.arg}».`);
          row[col] = n;
        } else if (f.type === "tags") {
          const isArr = cols[col]?.type === "array";
          row[col] = isArr ? (Array.isArray(v) ? v : String(v).split(",").map((s) => s.trim()).filter(Boolean))
                           : (Array.isArray(v) ? v.join(", ") : String(v));
        } else if (f.type === "bool") {
          row[col] = v === true || String(v) === "true" || v === 1;
        } else {
          row[col] = safeStr(v, f.max ?? 2000);
        }
      }
      const uidCol = await resolveCol(t, COL.userId);
      if (uidCol) row[uidCol] = ctx.userId;
      if (cols["created_at"]) row["created_at"] = isoNow();
      // قيم افتراضية للحالة حتى تظهر العناصر الجديدة في القوائم المفلترة
      if (cfg.hasDone) {
        const doneCol = await resolveCol(t, COL.done);
        const statusCol2 = await resolveCol(t, COL.status);
        if (doneCol && (await colType(t, doneCol)) === "boolean" && row[doneCol] === undefined) row[doneCol] = false;
        if (statusCol2 && cfg.doneValues && row[statusCol2] === undefined) row[statusCol2] = String(cfg.doneValues.false);
      }
      if (!Object.keys(row).some((k) => cfg.fields.some((f) => f.cands.includes(k)))) {
        return toolErr(`تعذر مطابقة أعمدة ${cfg.arSingular} في جدول «${t}» — راجع أسماء الأعمدة (MCP_TABLES_JSON).`);
      }
      const ins = await sbInsert(t, row);
      if (ins.error || !ins.row) {
        return toolErr(`فشل إنشاء ${cfg.arSingular}: ${ins.code ?? ""} ${CFG.DEBUG ? (ins.error ?? "") : ""}`.trim());
      }
      await audit(ctx.userId, `${entity}.create`, true);
      const title = pickRow(ins.row, cfg.titleCands) ?? pickRow(ins.row, cfg.contentCands) ?? "";
      return txt(`${cfg.icon} تم إنشاء ${cfg.arSingular} بنجاح: «${short(title, 80)}»`, { item: ins.row });
    },
  };
}

function makeGetTool(entity: string, cfg: EntityCfg): ToolDef {
  return {
    name: entity === "journal" ? "journal_entry_get" : `${entity.slice(0, -1)}_get`,
    description: `عرض تفاصيل ${cfg.arSingular} واحدة عبر المعرف (id).`,
    inputSchema: { type: "object", properties: { id: { type: "string", description: "معرف العنصر" } }, required: ["id"] },
    tables: [cfg.tableKey],
    run: async (ctx, args) => {
      if (!isSafeId(args.id)) return toolErr("معرف غير صالح.");
      const t = await resolveTable(cfg.tableKey);
      if (!t) return toolErr(`جدول ${cfg.tableKey} غير موجود.`);
      const uidCol = (await resolveCol(t, COL.userId)) ?? "user_id";
      const idCol = (await resolveCol(t, COL.id)) ?? "id";
      const res = await sbSelect(t, { filters: [`${idCol}=eq.${encodeURIComponent(String(args.id))}`, `${uidCol}=eq.${encodeURIComponent(ctx.userId)}`], limit: 1 });
      if (res.error) return toolErr(`تعذر الجلب: ${res.code ?? ""}`.trim());
      const row = res.rows[0];
      if (!row) return toolErr(`لم يتم العثور على ${cfg.arSingular} بهذا المعرف.`);
      const lines = Object.entries(row).map(([k, v]) => `${k}: ${short(v, 200)}`).join("\n");
      return txt(`${cfg.icon} تفاصيل ${cfg.arSingular}:\n${lines}`, { item: row });
    },
  };
}

function makeUpdateTool(entity: string, cfg: EntityCfg): ToolDef {
  return {
    name: entity === "journal" ? "journal_entry_update" : `${entity.slice(0, -1)}_update`,
    description: `تعديل ${cfg.arSingular} موجودة (أي من الحقول: ${cfg.fields.map((f) => f.arg).join("، ")}) عبر المعرف.`,
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "معرف العنصر" }, ...Object.fromEntries(cfg.fields.map((f) => [f.arg, { type: "string", description: f.desc ?? f.arg }])) },
      required: ["id"],
    },
    tables: [cfg.tableKey],
    run: async (ctx, args) => {
      if (!isSafeId(args.id)) return toolErr("معرف غير صالح.");
      const t = await resolveTable(cfg.tableKey);
      if (!t) return toolErr(`جدول ${cfg.tableKey} غير موجود.`);
      const uidCol = (await resolveCol(t, COL.userId)) ?? "user_id";
      const idCol = (await resolveCol(t, COL.id)) ?? "id";
      const patch: Record<string, unknown> = {};
      for (const f of cfg.fields) {
        const v = args[f.arg];
        if (v == null || v === "") continue;
        const col = await resolveCol(t, f.cands);
        if (!col) continue;
        if (f.type === "date") {
          const d = new Date(String(v));
          if (!isNaN(d.getTime())) patch[col] = d.toISOString();
        } else if (f.type === "number") {
          const n = Number(v); if (!isNaN(n)) patch[col] = n;
        } else if (f.type === "tags") {
          patch[col] = Array.isArray(v) ? v.join(", ") : String(v);
        } else if (f.type === "bool") {
          patch[col] = v === true || String(v) === "true";
        } else {
          patch[col] = safeStr(v, f.max ?? 2000);
        }
      }
      const updCol = await resolveCol(t, COL.updated);
      if (updCol) patch[updCol] = isoNow();
      if (!Object.keys(patch).length) return toolErr("لا توجد حقول صالحة للتعديل.");
      const res = await sbUpdate(t, [`${idCol}=eq.${encodeURIComponent(String(args.id))}`, `${uidCol}=eq.${encodeURIComponent(ctx.userId)}`], patch);
      if (res.error) return toolErr(`فشل التعديل: ${res.code ?? ""}`.trim());
      if (!res.rows.length) return toolErr(`لم يتم العثور على ${cfg.arSingular} بهذا المعرف (أو أنها ليست ملكك).`);
      await audit(ctx.userId, `${entity}.update`, true);
      return txt(`${cfg.icon} تم تعديل ${cfg.arSingular} بنجاح.`, { item: res.rows[0] });
    },
  };
}

function makeDeleteTool(entity: string, cfg: EntityCfg): ToolDef {
  return {
    name: entity === "journal" ? "journal_entry_delete" : `${entity.slice(0, -1)}_delete`,
    description: `حذف ${cfg.arSingular} نهائيًا عبر المعرف. متطلب توكيد من المستخدم قبل التنفيذ.`,
    inputSchema: { type: "object", properties: { id: { type: "string", description: "معرف العنصر" }, confirm: { type: "boolean", description: "يجب أن يكون true" } }, required: ["id", "confirm"] },
    tables: [cfg.tableKey],
    run: async (ctx, args) => {
      if (!isSafeId(args.id)) return toolErr("معرف غير صالح.");
      if (args.confirm !== true) return toolErr("الحذف نهائي — اطلب توكيد المستخدم بـ confirm=true.");
      const t = await resolveTable(cfg.tableKey);
      if (!t) return toolErr(`جدول ${cfg.tableKey} غير موجود.`);
      const uidCol = (await resolveCol(t, COL.userId)) ?? "user_id";
      const idCol = (await resolveCol(t, COL.id)) ?? "id";
      const res = await sbDelete(t, [`${idCol}=eq.${encodeURIComponent(String(args.id))}`, `${uidCol}=eq.${encodeURIComponent(ctx.userId)}`]);
      if (!res.ok) return toolErr("فشل الحذف.");
      if (!res.rows.length) return toolErr(`لم يتم العثور على ${cfg.arSingular} بهذا المعرف (أو أنها ليست ملكك).`);
      await audit(ctx.userId, `${entity}.delete`, true);
      return txt(`🗑️ تم حذف ${cfg.arSingular}: «${short(pickRow(res.rows[0], cfg.titleCands) ?? pickRow(res.rows[0], cfg.contentCands), 80)}»`);
    },
  };
}

function makeDoneTool(entity: string, cfg: EntityCfg, complete: boolean): ToolDef {
  const verb = complete ? "إكمال" : "إعادة فتح";
  return {
    name: `${entity.slice(0, -1)}_${complete ? "complete" : "reopen"}`,
    description: `${verb} ${cfg.arSingular} عبر المعرف.`,
    inputSchema: { type: "object", properties: { id: { type: "string", description: "معرف العنصر" } }, required: ["id"] },
    tables: [cfg.tableKey],
    run: async (ctx, args) => {
      if (!isSafeId(args.id)) return toolErr("معرف غير صالح.");
      const t = await resolveTable(cfg.tableKey);
      if (!t) return toolErr(`جدول ${cfg.tableKey} غير موجود.`);
      const uidCol = (await resolveCol(t, COL.userId)) ?? "user_id";
      const idCol = (await resolveCol(t, COL.id)) ?? "id";
      const doneCol = await resolveCol(t, COL.done);
      const statusCol = await resolveCol(t, COL.status);
      const patch: Record<string, unknown> = {};
      if (doneCol && (await colType(t, doneCol)) === "boolean") patch[doneCol] = complete;
      if (statusCol) patch[statusCol] = cfg.doneValues ? String(complete ? cfg.doneValues.true : cfg.doneValues.false) : (complete ? "done" : "open");
      const compCol = await resolveCol(t, ["completed_at", "completedAt", "done_at"]);
      if (compCol) patch[compCol] = complete ? isoNow() : null;
      if (!Object.keys(patch).length) return toolErr(`لا يحتوي جدول «${t}» على عمود حالة قابل للتعديل.`);
      const res = await sbUpdate(t, [`${idCol}=eq.${encodeURIComponent(String(args.id))}`, `${uidCol}=eq.${encodeURIComponent(ctx.userId)}`], patch);
      if (res.error) return toolErr(`فشل ${verb}: ${res.code ?? ""}`.trim());
      if (!res.rows.length) return toolErr(`لم يتم العثور على ${cfg.arSingular} بهذا المعرف (أو أنها ليست ملكك).`);
      await audit(ctx.userId, `${entity}.${complete ? "complete" : "reopen"}`, true);
      return txt(`${complete ? "🎉" : "↩️"} تم ${verb} ${cfg.arSingular}: «${short(pickRow(res.rows[0], cfg.titleCands) ?? "", 80)}»`);
    },
  };
}

// تسجيل الأدوات القياسية لكل كيان
const TOOLS: ToolDef[] = [];
for (const [entity, cfg] of Object.entries(ENTITIES)) {
  TOOLS.push(makeListTool(entity, cfg));
  TOOLS.push(makeCreateTool(entity, cfg));
  TOOLS.push(makeGetTool(entity, cfg));
  TOOLS.push(makeUpdateTool(entity, cfg));
  TOOLS.push(makeDeleteTool(entity, cfg));
  if (cfg.hasDone) {
    TOOLS.push(makeDoneTool(entity, cfg, true));
    TOOLS.push(makeDoneTool(entity, cfg, false));
  }
}

// ================= الأدوات الخاصة (النظام، الملف، الاشتراك، الإشعارات…) =========

// --- حالة النظام ---
TOOLS.push({
  name: "awj_status",
  description: "حالة خادم MCP لأوج: الوقت، الخطة، عدد الأدوات المتاحة. ابدأ بها عند بدء جلسة جديدة أو عند الاشتباه في مشكلة اتصال.",
  inputSchema: { type: "object", properties: {} },
  tables: [],
  run: async (ctx) => {
    const schema = await getSchema();
    const available: string[] = [];
    for (const tool of TOOLS) {
      let ok = true;
      for (const tk of tool.tables) if (!(await resolveTable(tk))) ok = false;
      if (ok) available.push(tool.name);
    }
    return txt(
      `🟢 خادم أوج MCP يعمل.\n⏰ ${isoNow()}\n👤 المستخدم: ${ctx.userId}\n💳 الخطة: ${ctx.plan || "غير محددة (افتراض: Max نشطة)"}\n🧰 أدوات متاحة: ${available.length} من ${TOOLS.length}\n🗄️ جداول مكتشفة: ${Object.keys(schema).length}`,
      { server: "awj-mcp", time: isoNow(), plan: ctx.plan, toolsAvailable: available.length, toolsTotal: TOOLS.length },
    );
  },
});

// --- الملف الشخصي ---
TOOLS.push({
  name: "profile_get",
  description: "عرض الملف الشخصي للمستخدم (الاسم، البريد، المزاج، المنطقة الزمنية…).",
  inputSchema: { type: "object", properties: {} },
  tables: ["profiles"],
  run: async (ctx) => {
    const t = await resolveTable("profiles");
    if (!t) return toolErr("جدول الملف الشخصي غير موجود.");
    const uidCol = (await resolveCol(t, COL.userId)) ?? "user_id";
    const res = await sbSelect(t, { filters: [`${uidCol}=eq.${encodeURIComponent(ctx.userId)}`], limit: 1 });
    const row = res.rows[0];
    if (!row) return toolErr("لم يتم العثور على ملف شخصي لهذا المستخدم.");
    const lines = Object.entries(row).map(([k, v]) => `${k}: ${short(v, 200)}`).join("\n");
    return txt(`👤 الملف الشخصي:\n${lines}`, { profile: row });
  },
});

TOOLS.push({
  name: "profile_update",
  description: "تعديل الملف الشخصي (الاسم المعروض، النبذة، المنطقة الزمنية). لا يمكن تعديل البريد أو الخطة من هنا.",
  inputSchema: {
    type: "object",
    properties: {
      display_name: { type: "string", description: "الاسم المعروض" },
      bio: { type: "string", description: "نبذة شخصية" },
      timezone: { type: "string", description: "المنطقة الزمنية مثل Africa/Cairo" },
      avatar_url: { type: "string", description: "رابط صورة الحساب" },
    },
  },
  tables: ["profiles"],
  run: async (ctx, args) => {
    const t = await resolveTable("profiles");
    if (!t) return toolErr("جدول الملف الشخصي غير موجود.");
    const uidCol = (await resolveCol(t, COL.userId)) ?? "user_id";
    const fields: Array<[string, string[], number]> = [
      ["display_name", ["display_name", "full_name", "name", "username"], CFG.MAX_TITLE],
      ["bio", ["bio", "about", "description"], 1000],
      ["timezone", ["timezone", "time_zone", "tz"], 60],
      ["avatar_url", ["avatar_url", "avatar", "image_url", "photo_url"], 500],
    ];
    const patch: Record<string, unknown> = {};
    for (const [arg, cands, max] of fields) {
      if (args[arg] == null || args[arg] === "") continue;
      const col = await resolveCol(t, cands);
      if (col) patch[col] = safeStr(args[arg], max);
    }
    if (!Object.keys(patch).length) return toolErr("لا توجد حقول قابلة للتعديل (قد تكون الأعمدة غير موجودة).");
    const res = await sbUpdate(t, [`${uidCol}=eq.${encodeURIComponent(ctx.userId)}`], patch);
    if (res.error) return toolErr(`فشل التعديل: ${res.code ?? ""}`.trim());
    if (!res.rows.length) return toolErr("لم يتم العثور على الملف الشخصي.");
    await audit(ctx.userId, "profile.update", true);
    return txt("👤 تم تحديث الملف الشخصي.", { profile: res.rows[0] });
  },
});

// --- الاشتراك والاستخدام ---
TOOLS.push({
  name: "subscription_get",
  description: "عرض خطة الاشتراك الحالية وحالتها وتاريخ التجديد وحدود الخطة.",
  inputSchema: { type: "object", properties: {} },
  tables: ["subs"],
  run: async (ctx) => {
    const t = await resolveTable("subs");
    if (!t) return toolErr("جدول الاشتراكات غير موجود.");
    const uidCol = (await resolveCol(t, COL.userId)) ?? "user_id";
    const createdCol = await resolveCol(t, COL.created);
    const res = await sbSelect(t, {
      filters: [`${uidCol}=eq.${encodeURIComponent(ctx.userId)}`],
      order: createdCol ? `order=${createdCol}.desc` : "",
      limit: 5,
    });
    if (!res.rows.length) return txt("لا يوجد اشتراك مسجل — المستخدم على الخطة المجانية على الأرجح.");
    const plansTable = await resolveTable("plans");
    let plansInfo = "";
    if (plansTable) {
      const pr = await sbSelect(plansTable, { limit: 10 });
      plansInfo = pr.rows.map((p) => `- ${pickRow(p, ["name", "plan", "title"])}: ${short(pickRow(p, ["price", "price_egp", "amount", "monthly_price"]), 30)} جنيه/شهر`).join("\n");
    }
    const lines = res.rows.map((r, i) =>
      `${i + 1}. ${pickRow(r, COL.plan) ?? "?"} — ${pickRow(r, COL.subStatus) ?? "?"}${pickRow(r, COL.subEnd) ? ` — ينتهي: ${arDate(pickRow(r, COL.subEnd))}` : ""}`
    ).join("\n");
    return txt(`💳 الاشتراكات:\n${lines}${plansInfo ? `\n\nالخطط المتاحة:\n${plansInfo}` : ""}`, { subscriptions: res.rows });
  },
});

TOOLS.push({
  name: "usage_get",
  description: "عرض استهلاك المستخدم اليومي/الشهري مقابل حدود الخطة (مفيد قبل اقتراب الحدود).",
  inputSchema: { type: "object", properties: { period: { type: "string", enum: ["today", "month", "both"], description: "افتراضي both" } } },
  tables: ["usage_daily"],
  run: async (ctx) => {
    const t = await resolveTable("usage_daily");
    if (!t) return toolErr("جدول الاستخدام اليومي غير موجود.");
    const uidCol = (await resolveCol(t, COL.userId)) ?? "user_id";
    const dateCol = await resolveCol(t, ["date", "day", "usage_date", "created_at"]) ?? "date";
    const today = new Date().toISOString().slice(0, 10);
    const resToday = await sbSelect(t, { filters: [`${uidCol}=eq.${encodeURIComponent(ctx.userId)}`, `${dateCol}=gte.${today}`], limit: 10 });
    const month = today.slice(0, 7);
    const resMonth = await sbSelect(t, { filters: [`${uidCol}=eq.${encodeURIComponent(ctx.userId)}`, `${dateCol}=gte.${month + "-01"}`], limit: 31 });
    const fmt = (rows: Record<string, unknown>[]) => rows.map((r) => Object.entries(r).filter(([k]) => k !== uidCol).map(([k, v]) => `${k}=${short(v, 20)}`).join(" | ")).join("\n") || "(لا شيء)";
    return txt(`📊 الاستخدام اليوم (${today}):\n${fmt(resToday.rows)}\n\n📊 إجمالي الشهر (${month}):\n${fmt(resMonth.rows)}`, { today: resToday.rows, month: resMonth.rows });
  },
});

// --- الإشعارات ---
TOOLS.push({
  name: "notifications_list",
  description: "عرض إشعارات المستخدم (الأحدث أولًا) مع إمكانية عرض غير المقروءة فقط.",
  inputSchema: { type: "object", properties: { unread_only: { type: "boolean", description: "غير المقروءة فقط" }, limit: { type: "number" } } },
  tables: ["notifications"],
  run: async (ctx, args) => {
    const t = await resolveTable("notifications");
    if (!t) return toolErr("جدول الإشعارات غير موجود.");
    const uidCol = (await resolveCol(t, COL.userId)) ?? "user_id";
    const readCol = await resolveCol(t, COL.readAt);
    const filters: string[] = [`${uidCol}=eq.${encodeURIComponent(ctx.userId)}`];
    if (args.unread_only === true && readCol) filters.push(`${readCol}=is.null`);
    const createdCol = await resolveCol(t, COL.created);
    const limit = Math.max(1, Math.min(Number(args.limit) || 20, CFG.MAX_LIST));
    const res = await sbSelect(t, { filters, order: createdCol ? `order=${createdCol}.desc` : "", limit });
    if (res.error) return toolErr(`تعذر جلب الإشعارات: ${res.code ?? ""}`.trim());
    if (!res.rows.length) return txt("🔕 لا توجد إشعارات.");
    const lines = res.rows.map((r, i) => {
      const title = pickRow(r, ["title", "subject", "heading"]) ?? "";
      const body = pickRow(r, ["body", "content", "message", "text"]) ?? "";
      const unread = readCol && r[readCol] == null ? "🔔" : "📖";
      return `${i + 1}. ${unread} ${title}${body ? ": " + short(body, 100) : ""}`;
    }).join("\n");
    return txt(`🔕 ${res.rows.length} إشعار:\n${lines}`, { count: res.rows.length, items: res.rows });
  },
});

TOOLS.push({
  name: "notifications_unread_count",
  description: "عدد الإشعارات غير المقروءة.",
  inputSchema: { type: "object", properties: {} },
  tables: ["notifications"],
  run: async (ctx) => {
    const t = await resolveTable("notifications");
    if (!t) return toolErr("جدول الإشعارات غير موجود.");
    const uidCol = (await resolveCol(t, COL.userId)) ?? "user_id";
    const readCol = await resolveCol(t, COL.readAt);
    const filters = [`${uidCol}=eq.${encodeURIComponent(ctx.userId)}`];
    if (readCol) filters.push(`${readCol}=is.null`);
    const res = await sbSelect(t, { filters, limit: 100 });
    return txt(`🔔 لديك ${res.rows.length} إشعار غير مقروء.`, { unread: res.rows.length });
  },
});

TOOLS.push({
  name: "notification_mark_read",
  description: "تعليم إشعار واحد كمقروء عبر المعرف.",
  inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  tables: ["notifications"],
  run: async (ctx, args) => {
    if (!isSafeId(args.id)) return toolErr("معرف غير صالح.");
    const t = await resolveTable("notifications");
    if (!t) return toolErr("جدول الإشعارات غير موجود.");
    const uidCol = (await resolveCol(t, COL.userId)) ?? "user_id";
    const idCol = (await resolveCol(t, COL.id)) ?? "id";
    const readCol = await resolveCol(t, COL.readAt);
    if (!readCol) return toolErr("لا يحتوي جدول الإشعارات على عمود قراءة.");
    const boolRead = (await colType(t, readCol)) === "boolean" ? true : isoNow();
    const res = await sbUpdate(t, [`${idCol}=eq.${encodeURIComponent(String(args.id))}`, `${uidCol}=eq.${encodeURIComponent(ctx.userId)}`], { [readCol]: boolRead });
    if (res.error) return toolErr(`فشل التعليم: ${res.code ?? ""}`.trim());
    if (!res.rows.length) return toolErr("لم يتم العثور على الإشعار.");
    return txt("✅ تم تعليم الإشعار كمقروء.");
  },
});

TOOLS.push({
  name: "notifications_mark_all_read",
  description: "تعليم كل الإشعارات كمقروءة.",
  inputSchema: { type: "object", properties: {} },
  tables: ["notifications"],
  run: async (ctx) => {
    const t = await resolveTable("notifications");
    if (!t) return toolErr("جدول الإشعارات غير موجود.");
    const uidCol = (await resolveCol(t, COL.userId)) ?? "user_id";
    const readCol = await resolveCol(t, COL.readAt);
    if (!readCol) return toolErr("لا يحتوي جدول الإشعارات على عمود قراءة.");
    const boolRead = (await colType(t, readCol)) === "boolean" ? true : isoNow();
    const res = await sbUpdate(t, [`${uidCol}=eq.${encodeURIComponent(ctx.userId)}`, `${readCol}=is.null`], { [readCol]: boolRead });
    if (res.error) return toolErr(`فشل: ${res.code ?? ""}`.trim());
    return txt(`✅ تم تعليم ${res.rows.length} إشعار كمقروء.`);
  },
});

TOOLS.push({
  name: "notification_preferences_get",
  description: "عرض تفضيلات الإشعارات (داخل التطبيق / Web Push لكل فئة).",
  inputSchema: { type: "object", properties: {} },
  tables: ["notif_prefs"],
  run: async (ctx) => {
    const t = await resolveTable("notif_prefs");
    if (!t) return toolErr("جدول تفضيلات الإشعارات غير موجود.");
    const uidCol = (await resolveCol(t, COL.userId)) ?? "user_id";
    const res = await sbSelect(t, { filters: [`${uidCol}=eq.${encodeURIComponent(ctx.userId)}`], limit: 1 });
    const row = res.rows[0];
    if (!row) return txt("لم تُضبط تفضيلات مخصصة — الافتراضي مطبق.");
    return txt(`⚙️ تفضيلات الإشعارات:\n${Object.entries(row).map(([k, v]) => `${k}: ${short(v, 80)}`).join("\n")}`, { prefs: row });
  },
});

TOOLS.push({
  name: "notification_preferences_update",
  description: "تعديل تفضيلات الإشعارات لكل فئة (in_app / push بقيم true أو false).",
  inputSchema: {
    type: "object",
    properties: {
      category: { type: "string", enum: ["important", "community", "reminders", "security", "marketing"], description: "فئة الإشعارات" },
      in_app: { type: "boolean", description: "تشغيل داخل التطبيق" },
      push: { type: "boolean", description: "تشغيل Web Push" },
    },
    required: ["category", "in_app", "push"],
  },
  tables: ["notif_prefs"],
  run: async (ctx, args) => {
    const t = await resolveTable("notif_prefs");
    if (!t) return toolErr("جدول تفضيلات الإشعارات غير موجود.");
    const uidCol = (await resolveCol(t, COL.userId)) ?? "user_id";
    const cat = String(args.category ?? "");
    const cands: Record<string, string[]> = {
      important: ["important", "updates", "important_in_app", "system"],
      community: ["community", "community_activity"],
      reminders: ["reminders", "personal_reminders"],
      security: ["security", "security_alerts"],
      marketing: ["marketing", "promo"],
    };
    const catCols = cands[cat] ?? [cat];
    // جرب أعمدة {cat}_in_app و {cat}_push أو JSONB واحد
    const inAppCol = await resolveCol(t, catCols.flatMap((c) => [`${c}_in_app`, `in_app_${c}`]));
    const pushCol = await resolveCol(t, catCols.flatMap((c) => [`${c}_push`, `push_${c}`]));
    const jsonCol = await resolveCol(t, ["preferences", "prefs", "settings", "channels"]);
    const filters = [`${uidCol}=eq.${encodeURIComponent(ctx.userId)}`];
    const existing = await sbSelect(t, { filters, limit: 1 });
    const row = existing.rows[0];
    if (inAppCol && pushCol) {
      const patch = { [inAppCol]: args.in_app === true, [pushCol]: args.push === true };
      if (row) await sbUpdate(t, filters, patch);
      else await sbInsert(t, { [uidCol]: ctx.userId, ...patch });
    } else if (jsonCol) {
      const base = (typeof row?.[jsonCol] === "object" && row?.[jsonCol] ? JSON.parse(JSON.stringify(row[jsonCol])) : {}) as Record<string, unknown>;
      base[cat] = { in_app: args.in_app === true, push: args.push === true };
      if (row) await sbUpdate(t, filters, { [jsonCol]: base });
      else await sbInsert(t, { [uidCol]: ctx.userId, [jsonCol]: base });
    } else {
      return toolErr("تعذر تحديد أعمدة التفضيلات في الجدول — راجع بنية الجدول.");
    }
    await audit(ctx.userId, "notification_prefs.update", true);
    return txt(`⚙️ تم ضبط إشعارات «${cat}»: داخل التطبيق=${args.in_app === true} — Push=${args.push === true}`);
  },
});

// --- تسجيل العادات وتقدمها ---
TOOLS.push({
  name: "habit_log",
  description: "تسجيل تنفيذ عادة اليوم (أو بتاريخ محدد) مع قيمة اختيارية (مثل عدد الكؤوس).",
  inputSchema: {
    type: "object",
    properties: {
      habit_id: { type: "string", description: "معرف العادة" },
      date: { type: "string", description: "تاريخ التسجيل ISO (افتراضي اليوم)" },
      value: { type: "number", description: "قيمة اختيارية (عدد/كمية)" },
    },
    required: ["habit_id"],
  },
  tables: ["habits", "habit_logs"],
  run: async (ctx, args) => {
    if (!isSafeId(args.habit_id)) return toolErr("معرف غير صالح.");
    const ht = await resolveTable("habits");
    const lt = await resolveTable("habit_logs");
    if (!ht || !lt) return toolErr("جداول العادات أو سجلاتها غير موجودة.");
    const hUid = (await resolveCol(ht, COL.userId)) ?? "user_id";
    const hId = (await resolveCol(ht, COL.id)) ?? "id";
    const habit = (await sbSelect(ht, { filters: [`${hId}=eq.${encodeURIComponent(String(args.habit_id))}`, `${hUid}=eq.${encodeURIComponent(ctx.userId)}`], limit: 1 })).rows[0];
    if (!habit) return toolErr("لم يتم العثور على العادة (أو أنها ليست ملكك).");
    const schema = await getSchema();
    const lCols = schema[lt] ?? {};
    const lUid = await resolveCol(lt, COL.userId);
    const lHabit = await resolveCol(lt, ["habit_id", "habitId", "habit"]) ?? "habit_id";
    const lDate = await resolveCol(lt, ["date", "day", "log_date", "entry_date"]) ?? "date";
    const lValue = await resolveCol(lt, ["value", "count", "amount", "progress"]);
    const row: Record<string, unknown> = { [lHabit]: args.habit_id };
    const day = args.date ? new Date(String(args.date)) : new Date();
    if (isNaN(day.getTime())) return toolErr("تاريخ غير صالح.");
    row[lDate] = day.toISOString().slice(0, 10);
    if (lValue && args.value != null) row[lValue] = Number(args.value);
    if (lUid) row[lUid] = ctx.userId;
    if (lCols["created_at"]) row["created_at"] = isoNow();
    const ins = await sbInsert(lt, row);
    if (ins.error) return toolErr(`فشل تسجيل العادة: ${ins.code ?? ""} ${CFG.DEBUG ? ins.error : ""}`.trim());
    await audit(ctx.userId, "habit.log", true);
    return txt(`🔁 تم تسجيل عادة «${short(pickRow(habit, COL.title), 60)}» بتاريخ ${row[lDate]}.`, { log: ins.row });
  },
});

TOOLS.push({
  name: "habits_progress",
  description: "عرض تقدم العادات: آخر 14 يومًا والسلاسل المتصلة (streaks) لكل عادة.",
  inputSchema: { type: "object", properties: {} },
  tables: ["habits", "habit_logs"],
  run: async (ctx) => {
    const ht = await resolveTable("habits");
    const lt = await resolveTable("habit_logs");
    if (!ht || !lt) return toolErr("جداول العادات أو سجلاتها غير موجودة.");
    const hUid = (await resolveCol(ht, COL.userId)) ?? "user_id";
    const habits = (await sbSelect(ht, { filters: [`${hUid}=eq.${encodeURIComponent(ctx.userId)}`], limit: 50 })).rows;
    if (!habits.length) return txt("لا توجد عادات بعد.");
    const lHabit = await resolveCol(lt, ["habit_id", "habitId", "habit"]) ?? "habit_id";
    const lDate = await resolveCol(lt, ["date", "day", "log_date", "entry_date"]) ?? "date";
    const since = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);
    const logs = (await sbSelect(lt, { filters: [`${lDate}=gte.${since}`], limit: 500 })).rows;
    const byHabit = new Map<string, Set<string>>();
    for (const log of logs) {
      const hid = String(log[lHabit] ?? "");
      const d = String(log[lDate] ?? "").slice(0, 10);
      if (!hid || !d) continue;
      if (!byHabit.has(hid)) byHabit.set(hid, new Set());
      byHabit.get(hid)!.add(d);
    }
    const lines: string[] = [];
    const data: Record<string, unknown>[] = [];
    for (const h of habits) {
      const hid = String(pickRow(h, COL.id) ?? "");
      const days = byHabit.get(hid) ?? new Set<string>();
      let streak = 0;
      const cur = new Date();
      while (days.has(cur.toISOString().slice(0, 10))) { streak++; cur.setDate(cur.getDate() - 1); }
      lines.push(`- ${pickRow(h, COL.title) ?? "?"}: ${days.size}/14 يوم — سلسلة ${streak} 🔥`);
      data.push({ habit: pickRow(h, COL.title), daysLast14: days.size, streak });
    }
    return txt(`🔁 تقدم العادات (آخر 14 يومًا):\n${lines.join("\n")}`, { habits: data });
  },
});

// --- المجتمع ---
TOOLS.push({
  name: "community_feed",
  description: "عرض آخر منشورات مجتمع أوج (منشورات عامة). يدعم التصنيف وعدد النتائج.",
  inputSchema: { type: "object", properties: { category: { type: "string", description: "تصنيف/قسم" }, limit: { type: "number" } } },
  tables: ["posts"],
  run: async (_ctx, args) => {
    const t = await resolveTable("posts");
    if (!t) return toolErr("جدول منشورات المجتمع غير موجود.");
    const filters: string[] = [];
    const cat = safeStr(args.category, 60).trim();
    if (cat) {
      const catCol = await resolveCol(t, ["category", "channel", "topic", "section", "tag"]);
      if (catCol) filters.push(`${catCol}=eq.${encodeURIComponent(cat)}`);
    }
    const createdCol = await resolveCol(t, COL.created);
    const limit = Math.max(1, Math.min(Number(args.limit) || 20, CFG.MAX_LIST));
    const res = await sbSelect(t, { filters, order: createdCol ? `order=${createdCol}.desc` : "", limit });
    if (res.error) return toolErr(`تعذر جلب المجتمع: ${res.code ?? ""}`.trim());
    if (!res.rows.length) return txt("🌐 لا توجد منشورات بعد.");
    const lines = res.rows.map((r, i) => {
      const title = pickRow(r, COL.postTitle);
      const body = pickRow(r, COL.postBody);
      const author = pickRow(r, COL.author);
      const likes = pickRow(r, COL.postLikes);
      const cmts = pickRow(r, COL.postComments);
      const id = pickRow(r, COL.id);
      return `${i + 1}. ${title ? "«" + short(title, 80) + "»" : short(body, 80)}${author ? ` — بواسطة ${short(author, 20)}` : ""}${likes != null ? ` — 👍${likes}` : ""}${cmts != null ? ` 💬${cmts}` : ""} (id: ${id})`;
    }).join("\n");
    return txt(`🌐 ${res.rows.length} منشور:\n${lines}`, { count: res.rows.length, items: res.rows });
  },
});

TOOLS.push({
  name: "community_post_get",
  description: "عرض منشور واحد بالتفصيل مع تعليقاته.",
  inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  tables: ["posts"],
  run: async (_ctx, args) => {
    if (!isSafeId(args.id)) return toolErr("معرف غير صالح.");
    const t = await resolveTable("posts");
    if (!t) return toolErr("جدول المنشورات غير موجود.");
    const idCol = (await resolveCol(t, COL.id)) ?? "id";
    const res = await sbSelect(t, { filters: [`${idCol}=eq.${encodeURIComponent(String(args.id))}`], limit: 1 });
    const post = res.rows[0];
    if (!post) return toolErr("لم يتم العثور على المنشور.");
    let cmtTxt = "";
    const ct = await resolveTable("comments");
    if (ct) {
      const postCol = await resolveCol(ct, ["post_id", "postId", "post"]) ?? "post_id";
      const createdCol = await resolveCol(ct, COL.created);
      const cRes = await sbSelect(ct, { filters: [`${postCol}=eq.${encodeURIComponent(String(args.id))}`], order: createdCol ? `order=${createdCol}.asc` : "", limit: 50 });
      cmtTxt = cRes.rows.length ? "\n\n💬 التعليقات:\n" + cRes.rows.map((c, i) => `${i + 1}. ${short(pickRow(c, COL.postBody), 150)}`).join("\n") : "";
    }
    const lines = Object.entries(post).map(([k, v]) => `${k}: ${short(v, 300)}`).join("\n");
    return txt(`🌐 تفاصيل المنشور:\n${lines}${cmtTxt}`, { post });
  },
});

TOOLS.push({
  name: "community_post_create",
  description: "إنشاء منشور جديد في مجتمع أوج باسم المستخدم.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "عنوان المنشور" },
      content: { type: "string", description: "نص المنشور" },
      category: { type: "string", description: "تصنيف/قسم" },
    },
    required: ["content"],
  },
  tables: ["posts"],
  run: async (ctx, args) => {
    const t = await resolveTable("posts");
    if (!t) return toolErr("جدول المنشورات غير موجود.");
    const content = safeStr(args.content, CFG.MAX_TEXT).trim();
    if (!content) return toolErr("نص المنشور مطلوب.");
    const row: Record<string, unknown> = {};
    const titleCol = await resolveCol(t, COL.postTitle);
    const bodyCol = (await resolveCol(t, COL.postBody)) ?? (await resolveCol(t, COL.content));
    const authorCol = (await resolveCol(t, COL.author)) ?? "user_id";
    const catCol = await resolveCol(t, ["category", "channel", "topic", "section"]);
    if (bodyCol) row[bodyCol] = content;
    if (titleCol && args.title) row[titleCol] = safeStr(args.title, CFG.MAX_TITLE);
    if (authorCol) row[authorCol] = ctx.userId;
    if (catCol && args.category) row[catCol] = safeStr(args.category, 60);
    const schema = await getSchema();
    if (schema[t]?.["created_at"]) row["created_at"] = isoNow();
    if (!bodyCol) return toolErr("تعذر تحديد عمود نص المنشور.");
    const ins = await sbInsert(t, row);
    if (ins.error) return toolErr(`فشل النشر: ${ins.code ?? ""} ${CFG.DEBUG ? ins.error : ""}`.trim());
    await audit(ctx.userId, "community.post_create", true);
    return txt(`🌐 تم نشر المنشور بنجاح.`, { post: ins.row });
  },
});

TOOLS.push({
  name: "community_post_comment",
  description: "إضافة تعليق على منشور في المجتمع.",
  inputSchema: {
    type: "object",
    properties: { post_id: { type: "string" }, content: { type: "string" } },
    required: ["post_id", "content"],
  },
  tables: ["comments"],
  run: async (ctx, args) => {
    if (!isSafeId(args.post_id)) return toolErr("معرف غير صالح.");
    const ct = await resolveTable("comments");
    if (!ct) return toolErr("جدول التعليقات غير موجود.");
    const content = safeStr(args.content, 4000).trim();
    if (!content) return toolErr("نص التعليق مطلوب.");
    const postCol = (await resolveCol(ct, ["post_id", "postId", "post"])) ?? "post_id";
    const bodyCol = (await resolveCol(ct, COL.postBody)) ?? "content";
    const authorCol = (await resolveCol(ct, COL.author)) ?? "user_id";
    const row: Record<string, unknown> = { [postCol]: args.post_id, [bodyCol]: content };
    if (authorCol) row[authorCol] = ctx.userId;
    const schema = await getSchema();
    if (schema[ct]?.["created_at"]) row["created_at"] = isoNow();
    const ins = await sbInsert(ct, row);
    if (ins.error) return toolErr(`فشل التعليق: ${ins.code ?? ""}`.trim());
    await audit(ctx.userId, "community.comment", true);
    return txt(`💬 تم إضافة تعليقك على المنشور.`, { comment: ins.row });
  },
});

TOOLS.push({
  name: "community_post_like",
  description: "الإعجاب بمنشور (أو إلغاء الإعجاب عند like=false).",
  inputSchema: {
    type: "object",
    properties: { post_id: { type: "string" }, like: { type: "boolean", description: "true للإعجاب (افتراضي) وfalse للإلغاء" } },
    required: ["post_id"],
  },
  tables: ["likes"],
  run: async (ctx, args) => {
    if (!isSafeId(args.post_id)) return toolErr("معرف غير صالح.");
    const lt = await resolveTable("likes");
    if (!lt) return toolErr("جدول الإعجابات غير موجود.");
    const postCol = (await resolveCol(lt, ["post_id", "postId", "post"])) ?? "post_id";
    const authorCol = (await resolveCol(lt, COL.author)) ?? "user_id";
    const filters = [`${postCol}=eq.${encodeURIComponent(String(args.post_id))}`];
    if (authorCol) filters.push(`${authorCol}=eq.${encodeURIComponent(ctx.userId)}`);
    const existing = (await sbSelect(lt, { filters, limit: 1 })).rows[0];
    if (args.like === false) {
      if (existing) await sbDelete(lt, filters);
      return txt("👍 تم إلغاء الإعجاب.");
    }
    if (!existing) {
      const row: Record<string, unknown> = { [postCol]: args.post_id };
      if (authorCol) row[authorCol] = ctx.userId;
      const schema = await getSchema();
      if (schema[lt]?.["created_at"]) row["created_at"] = isoNow();
      const ins = await sbInsert(lt, row);
      if (ins.error) return toolErr(`فشل الإعجاب: ${ins.code ?? ""}`.trim());
    }
    return txt("👍 تم الإعجاب بالمنشور.");
  },
});

TOOLS.push({
  name: "community_post_report",
  description: "الإبلاغ عن منشور مخالف (يدخل مسار مراجعة المشرفين).",
  inputSchema: {
    type: "object",
    properties: { post_id: { type: "string" }, reason: { type: "string", description: "سبب البلاغ" } },
    required: ["post_id", "reason"],
  },
  tables: ["reports"],
  run: async (ctx, args) => {
    if (!isSafeId(args.post_id)) return toolErr("معرف غير صالح.");
    const rt = await resolveTable("reports");
    if (!rt) return toolErr("جدول البلاغات غير موجود.");
    const reason = safeStr(args.reason, 500).trim();
    if (!reason) return toolErr("سبب البلاغ مطلوب.");
    const schema = await getSchema();
    const cols = schema[rt] ?? {};
    const postCol = await resolveCol(rt, ["post_id", "postId", "post", "content_id", "target_id"]) ?? "post_id";
    const reporterCol = await resolveCol(rt, ["reporter_id", "user_id", "userId", "reporter"]) ?? "user_id";
    const reasonCol = await resolveCol(rt, ["reason", "note", "details", "description"]) ?? "reason";
    const row: Record<string, unknown> = { [postCol]: args.post_id, [reporterCol]: ctx.userId, [reasonCol]: reason };
    if (cols["created_at"]) row["created_at"] = isoNow();
    if (cols["status"]) row["status"] = "pending";
    const ins = await sbInsert(rt, row);
    if (ins.error) return toolErr(`فشل الإبلاغ: ${ins.code ?? ""}`.trim());
    await audit(ctx.userId, "community.report", true);
    return txt("🚩 تم إرسال البلاغ وسيراجعه المشرفون.");
  },
});

// --- البحث الشامل ---
TOOLS.push({
  name: "search_everything",
  description: "بحث نصي واحد في كل بيانات المستخدم: المهام والملاحظات واليوميات والأهداف. أداة البحث الافتراضية عندما لا يحدد المستخدم النوع.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" }, limit: { type: "number" } },
    required: ["query"],
  },
  tables: [],
  run: async (ctx, args) => {
    const query = safeStr(args.query, 100).trim();
    if (!query) return toolErr("نص البحث مطلوب.");
    const per = Math.max(1, Math.min(Number(args.limit) || 5, 20));
    const sections: string[] = [];
    const data: Record<string, unknown> = {};
    const targets: Array<[string, EntityCfg]> = [["tasks", ENTITIES.tasks], ["notes", ENTITIES.notes], ["journal", ENTITIES.journal], ["goals", ENTITIES.goals]];
    for (const [key, cfg] of targets) {
      const t = await resolveTable(key);
      if (!t) continue;
      const uidCol = (await resolveCol(t, COL.userId)) ?? "user_id";
      const textCands = [...new Set([...cfg.titleCands, ...cfg.contentCands])];
      const resolvedCols = (await Promise.all(textCands.map((c) => resolveCol(t, [c])))).filter(Boolean) as string[];
      const textCols: string[] = [];
      for (const c of resolvedCols) if ((await colType(t, c)) === "string") textCols.push(c);
      if (!textCols.length) continue;
      const conds = textCols.map((c) => `${c}.ilike.*${encodeURIComponent(query)}*`);
      const res = await sbSelect(t, {
        filters: [`${uidCol}=eq.${encodeURIComponent(ctx.userId)}`, `or=(${conds.join(",")})`],
        limit: per,
      });
      if (res.rows.length) {
        const lines = res.rows.map((r, i) => `${i + 1}. ${short(pickRow(r, cfg.titleCands) ?? pickRow(r, cfg.contentCands), 90)}`);
        sections.push(`${cfg.icon} ${cfg.arPlural} (${res.rows.length}):\n${lines.join("\n")}`);
        data[key] = res.rows;
      }
    }
    if (!sections.length) return txt(`🔍 لا نتائج لـ «${query}».`);
    return txt(`🔍 نتائج البحث عن «${query}»:\n\n${sections.join("\n\n")}`, data);
  },
});

// ========================= معالجة JSON-RPC (MCP) ============================
const PROTOCOL_VERSIONS = new Set(["2024-11-05", "2025-03-26", "2025-06-18"]);

async function toolAvailable(tool: ToolDef): Promise<boolean> {
  for (const tk of tool.tables) {
    if (!(await resolveTable(tk))) return false;
  }
  return true;
}

async function handleJsonRpc(req: Request): Promise<Response> {
  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error — JSON غير صالح" } }, 400);
  }
  const id = body?.id ?? null;
  const method = body?.method ?? "";

  const send = (result: unknown) => json({ jsonrpc: "2.0", id, result });
  const rpcErr = (code: number, message: string) => json({ jsonrpc: "2.0", id, error: { code, message } });

  // المصادقة قبل أي شيء (نفس سلوك النسخة السابقة)
  const auth = await authenticate(req);
  if ("error" in auth) return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: auth.error } }, 401);

  // الإشعارات (بدون id) — نجاح صامت
  if (id === null || id === undefined) {
    if (method.startsWith("notifications/")) return new Response(null, { status: 202, headers: corsHeaders });
    return rpcErr(-32600, "طلب غير صالح");
  }

  // تحديد المعدل
  const rl = checkRate(auth.rateKey);
  if (!rl.ok) {
    return json({ jsonrpc: "2.0", id, error: { code: -32002, message: `تم تجاوز الحد المسموح من طلبات MCP — أعد المحاولة بعد ${Math.max(rl.retryAfterSec ?? 60, 1)} ثانية.` } }, 429);
  }

  const ctx: ToolCtx = { userId: auth.userId, plan: auth.plan };

  switch (method) {
    case "initialize":
      return send({
        protocolVersion: PROTOCOL_VERSIONS.has(String(body?.params?.protocolVersion ?? "")) ? body?.params?.protocolVersion : "2025-03-26",
        capabilities: {
          tools: { listChanged: false },
          resources: {},
          prompts: {},
          logging: {},
        },
        serverInfo: { name: "awj-mcp", version: "2.0.0", title: "أوج MCP" },
        instructions:
          "أنت متصل بخادم MCP الخاص بمنصة أوج (awj) لإنتاجية المستخدم. " +
          "يمكنك إدارة المهام والملاحظات والعادات والتذكيرات واليوميات والأهداف والتقويم والإشعارات، " +
          "والتفاعل مع مجتمع أوج، وقراءة حالة الاشتراك والاستخدام. " +
          "ابدأ بأداة awj_status عند الحاجة لمعرفة ما هو متاح، واستخدم search_everything للبحث العام. " +
          "أكواد الحالة المعتمدة: open/done. ردّ دائمًا بلغة المستخدم.",
      });
    case "tools/list": {
      const available: ToolDef[] = [];
      for (const tool of TOOLS) if (await toolAvailable(tool)) available.push(tool);
      return send({
        tools: available.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      });
    }
    case "tools/call": {
      const name = String(body?.params?.name ?? "");
      const args = (body?.params?.arguments ?? {}) as Record<string, unknown>;
      const tool = TOOLS.find((tl) => tl.name === name);
      if (!tool) return rpcErr(-32602, `أداة غير معروفة: ${name}`);
      if (!(await toolAvailable(tool))) {
        return send({
          content: [{ type: "text", text: `الأداة «${name}» غير متاحة حاليًا (الجداول المطلوبة غير موجودة في قاعدة البيانات).` }],
          isError: true,
        });
      }
      try {
        const result = await tool.run(ctx, args);
        await audit(auth.userId, name, !result.isError);
        return send(result);
      } catch (e) {
        await audit(auth.userId, name, false, String(e));
        return send({
          content: [{ type: "text", text: `خطأ غير متوقع أثناء تنفيذ «${name}»: ${CFG.DEBUG ? String(e) : "أعد المحاولة، وإن تكرر راجع سجلات الدالة."}` }],
          isError: true,
        });
      }
    }
    case "resources/list":
      return send({ resources: [] });
    case "resources/templates/list":
      return send({ resourceTemplates: [] });
    case "prompts/list":
      return send({ prompts: [] });
    case "ping":
      return send({});
    case "logging/setLevel":
      return send({});
    default:
      return rpcErr(-32601, `Method not found: ${method}`);
  }
}

// ============================== نقطة الدخول ==================================
Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const route = path.split("/").pop() ?? "";
  const oauth = url.searchParams.get("oauth");

  // CORS preflight
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  // مسارات OAuth metadata
  if (route === ".well-known" || path.includes("/.well-known/")) {
    const kind = path.includes("oauth-authorization-server") ? "auth" : path.includes("oauth-protected-resource") ? "protected" : null;
    if (kind && req.method === "GET") return wellKnown(kind as "auth" | "protected");
  }

  // تسجيل عميل OAuth الديناميكي (RFC 7591)
  if (route === "register" && req.method === "POST") return handleRegister();

  // مسارات OAuth الوظيفية
  if (oauth === "authorize" && (req.method === "GET" || req.method === "POST")) {
    try {
      return await handleAuthorize(req, url);
    } catch (e) {
      dbg("authorize error", e);
      return json({ error: "server_error", error_description: "خطأ داخلي في التفويض" }, 500);
    }
  }
  if (oauth === "token" && req.method === "POST") {
    try {
      return await handleToken(req);
    } catch (e) {
      dbg("token error", e);
      return json({ error: "server_error", error_description: "خطأ داخلي في إصدار الرموز" }, 500);
    }
  }
  if (oauth === "revoke" && req.method === "POST") return handleRevoke(req);

  // بروتوكول MCP عبر POST فقط
  if (req.method === "POST") {
    try {
      return await handleJsonRpc(req);
    } catch (e) {
      dbg("rpc error", e);
      return json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } }, 500);
    }
  }

  if (req.method === "GET") {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "هذه النقطة تدعم POST فقط (JSON-RPC) — لا تدعم بث SSE" } });
  }
  return json({ error: "method_not_allowed" }, 405);
});
