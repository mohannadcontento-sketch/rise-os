#!/usr/bin/env bun
/**
 * RiseOS MCP Server
 *
 * خادم MCP (Model Context Protocol) لـ RiseOS
 * يتيح لنماذج الذكاء الاصطناعي مثل Claude التعامل مع بيانات ومهام RiseOS
 *
 * Transport: stdio (متوافق مع Claude Desktop)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─── Configuration ───────────────────────────────────────────────
const RISE_API_URL = process.env.RISE_API_URL || "http://localhost:3000";
const RISE_API_KEY = process.env.RISE_API_KEY || null;

// ─── Auth State ──────────────────────────────────────────────────
let authToken: string | null = RISE_API_KEY; // Pre-set from env if provided

function getAuthHeaders(): Record<string, string> {
  if (!authToken) {
    throw new MCPAuthError("لم تتم المصادقة بعد. استخدم أداة rise_auth أولاً للمصادقة ببريدك الإلكتروني وكلمة المرور.");
  }
  return {
    "Authorization": `Bearer ${authToken}`,
    "Content-Type": "application/json",
  };
}

class MCPAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MCPAuthError";
  }
}

// ─── API Helper ──────────────────────────────────────────────────
async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<{ data: unknown; error?: string }> {
  // If using API key, route through the universal MCP endpoint
  if (authToken?.startsWith("rise_")) {
    try {
      const bodyObj = options.body ? JSON.parse(options.body as string) : {};
      const toolName = path.replace("/api/rise/", "").replace(/\//g, "_");
      const response = await fetch(`${RISE_API_URL}/api/rise/mcp/call`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tool: toolName, args: bodyObj }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        return { data: json, error: json?.error || `HTTP ${response.status}` };
      }
      return { data: json.data || json };
    } catch (err) {
      return {
        data: null,
        error: `فشل الاتصال بخادم RiseOS (${RISE_API_URL}).`,
      };
    }
  }

  // Standard JWT auth flow
  const url = `${RISE_API_URL}${path}`;
  const headers = options.headers
    ? { ...getAuthHeaders(), ...(options.headers as Record<string, string>) }
    : getAuthHeaders();

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (err) {
    return {
      data: null,
      error: `فشل الاتصال بخادم RiseOS (${RISE_API_URL}). تأكد أن التطبيق يعمل.`,
    };
  }

  if (response.status === 401) {
    authToken = null;
    return {
      data: null,
      error: "انتهت صلاحية الجلسة. استخدم rise_auth لإعادة المصادقة.",
    };
  }

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      data: json,
      error: json?.error || `خطأ من الخادم: HTTP ${response.status}`,
    };
  }

  return { data: json };
}

// ─── Date Helpers ────────────────────────────────────────────────
function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

// ─── Server Creation ─────────────────────────────────────────────
const server = new McpServer({
  name: "riseos",
  version: "1.0.0",
  description: "خادم RiseOS - نظام إدارة الحياة الشامل. يتيح قراءة وكتابة المهام والعادات والأهداف والمالية واليوميات والصحة والتركيز والمزيد.",
});

// ═══════════════════════════════════════════════════════════════════
// AUTH TOOL
// ═══════════════════════════════════════════════════════════════════

server.tool(
  "rise_auth",
  "المصادقة مع RiseOS باستخدام البريد الإلكتروني وكلمة المرور. يجب استدعاء هذه الأداة أولاً قبل استخدام أي أداة أخرى.",
  {
    email: z.string().email().describe("البريد الإلكتروني المسجل في RiseOS"),
    password: z.string().describe("كلمة المرور"),
  },
  async ({ email, password }) => {
    const url = `${RISE_API_URL}/api/auth/login`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      return {
        content: [{ type: "text" as const, text: `فشل الاتصال بخادم RiseOS (${RISE_API_URL}). تأكد أن التطبيق يعمل.` }],
        isError: true,
      };
    }

    const json = await response.json().catch(() => null);

    if (!response.ok) {
      authToken = null;
      const msg = json?.error || `فشل تسجيل الدخول (HTTP ${response.status})`;
      return {
        content: [{ type: "text" as const, text: `❌ فشل المصادقة: ${msg}` }],
        isError: true,
      };
    }

    authToken = json.session?.access_token;
    const userName = json.user?.email || email;

    return {
      content: [{
        type: "text" as const,
        text: `✅ تم المصادقة بنجاح!\nالمستخدم: ${userName}\nيمكنك الآن استخدام جميع أدوات RiseOS.`,
      }],
    };
  }
);

// ═══════════════════════════════════════════════════════════════════
// READ / ANALYTICS TOOLS
// ═══════════════════════════════════════════════════════════════════

// 1. Dashboard
server.tool(
  "rise_get_dashboard",
  "الحصول على نظرة عامة شاملة على لوحة التحكم: المهام والعادات والتركيز والإنجازات والنتيجة اليومية والمالية والمشاريع والأهداف",
  {},
  async () => {
    const { data, error } = await apiFetch("/api/rise/dashboard");
    if (error) return { content: [{ type: "text" as const, text: `❌ ${error}` }], isError: true };

    const d = data as Record<string, unknown>;
    const user = d.user as Record<string, unknown> | undefined;
    const today = d.today as Record<string, unknown> | undefined;

    const summary = [
      "📊 لوحة تحكم RiseOS",
      "═".repeat(40),
      `👤 المستخدم: ${user?.name || "غير معروف"}`,
      `🔥 المستوى: ${user?.level || 1} | XP: ${user?.xp || 0}`,
      `⚡ السلسلة: ${user?.streak || 0} يوم`,
      `🏆 أطول سلسلة: ${user?.longestStreak || 0} يوم`,
      "",
      "📋 اليوم:",
      `  • مهام مكتملة: ${today?.tasksCompleted || 0} من ${today?.tasksTotal || 0}`,
      `  • عادات مكتملة: ${today?.habitsCompleted || 0} من ${today?.habitsTotal || 0}`,
      `  • تركيز: ${today?.focusMin || 0} دقيقة`,
      `  • نتيجة الصباح: ${today?.morningScore || 0}`,
      "",
      `📝 المهام الأخيرة: ${JSON.stringify((d.tasks as unknown[])?.slice(0, 5) || [])}`,
      `🎯 الأهداف النشطة: ${JSON.stringify((d.goals as unknown[]) || [])}`,
    ].join("\n");

    return { content: [{ type: "text" as const, text: summary }] };
  }
);

// 2. Tasks
server.tool(
  "rise_get_tasks",
  "الحصول على جميع المهام مع إمكانية التصفية حسب الحالة",
  {
    status: z.enum(["pending", "in_progress", "completed"]).optional()
      .describe("تصفية حسب الحالة: pending (معلقة) أو in_progress (قيد التنفيذ) أو completed (مكتملة)"),
  },
  async ({ status }) => {
    const { data, error } = await apiFetch("/api/rise/tasks");
    if (error) return { content: [{ type: "text" as const, text: `❌ ${error}` }], isError: true };

    const d = data as { tasks?: Array<Record<string, unknown>> };
    let tasks = d.tasks || [];

    if (status) {
      const statusMap: Record<string, string> = {
        pending: "pending",
        in_progress: "in_progress",
        completed: "done",
      };
      tasks = tasks.filter((t) => t.status === statusMap[status]);
    }

    if (tasks.length === 0) {
      return { content: [{ type: "text" as const, text: status ? `لا توجد مهام بحالة "${status}"` : "لا توجد مهام حالياً" }] };
    }

    const list = tasks.map((t, i) => {
      const priority = t.priority ? ` [${t.priority}]` : "";
      const project = t.projectName ? ` 📁${t.projectName}` : "";
      const done = t.status === "done" ? " ✅" : "";
      return `  ${i + 1}. ${t.title}${priority}${project}${done}`;
    }).join("\n");

    const summary = `📋 المهام (${tasks.length}):\n${list}`;
    return { content: [{ type: "text" as const, text: summary }] };
  }
);

// 3. Habits
server.tool(
  "rise_get_habits",
  "الحصول على جميع العادات مع حالة الإكمال لليوم",
  {},
  async () => {
    const { data, error } = await apiFetch("/api/rise/habits");
    if (error) return { content: [{ type: "text" as const, text: `❌ ${error}` }], isError: true };

    const d = data as { habits?: Array<Record<string, unknown>>; logs?: Array<Record<string, unknown>> };
    const habits = d.habits || [];
    const logs = d.logs || [];
    const today = getToday();

    if (habits.length === 0) {
      return { content: [{ type: "text" as const, text: "لا توجد عادات مسجلة" }] };
    }

    const completedCount = logs.filter(
      (l) => l.date === today && l.completed
    ).length;

    const list = habits.map((h, i) => {
      const todayLog = logs.find((l) => l.habitId === h.id && l.date === today);
      const done = todayLog?.completed ? " ✅" : " ⬜";
      const icon = h.icon || "📌";
      return `  ${i + 1}. ${icon} ${h.name}${done} - ${h.description || ""}`;
    }).join("\n");

    const summary = [
      `🔄 العادات (${completedCount}/${habits.length} مكتملة اليوم):`,
      list,
      "",
      `📅 تاريخ اليوم: ${today}`,
    ].join("\n");

    return { content: [{ type: "text" as const, text: summary }] };
  }
);

// 4. Goals
server.tool(
  "rise_get_goals",
  "الحصول على جميع الأهداف مع التقدم والمعالم",
  {},
  async () => {
    const { data, error } = await apiFetch("/api/rise/goals");
    if (error) return { content: [{ type: "text" as const, text: `❌ ${error}` }], isError: true };

    const d = data as { goals?: Array<Record<string, unknown>> };
    const goals = d.goals || [];

    if (goals.length === 0) {
      return { content: [{ type: "text" as const, text: "لا توجد أهداف مسجلة" }] };
    }

    const list = goals.map((g, i) => {
      const status = g.status === "completed" ? " ✅" : g.status === "paused" ? " ⏸️" : " 🟢";
      const category = g.category ? ` [${g.category}]` : "";
      const target = g.targetDate ? ` 📅${g.targetDate}` : "";
      const milestones = g.milestones as Array<Record<string, unknown>> | undefined;
      const milestoneText = milestones?.length
        ? `\n     المعالم: ${milestones.filter(m => m.completed).length}/${milestones.length}`
        : "";
      return `  ${i + 1}. 🎯 ${g.title}${category}${status}${target}${milestoneText}`;
    }).join("\n");

    const summary = `🎯 الأهداف (${goals.length}):\n${list}`;
    return { content: [{ type: "text" as const, text: summary }] };
  }
);

// 5. Finance
server.tool(
  "rise_get_finance",
  "الحصول على السجلات المالية والملخص (إيرادات ومصروفات ورصيد)",
  {
    month: z.string().optional()
      .describe("تصفية حسب الشهر بصيغة YYYY-MM مثل 2025-01"),
  },
  async ({ month }) => {
    const { data, error } = await apiFetch("/api/rise/finance");
    if (error) return { content: [{ type: "text" as const, text: `❌ ${error}` }], isError: true };

    const d = data as { records?: Array<Record<string, unknown>> };
    let records = d.records || [];

    if (month) {
      records = records.filter((r) => {
        const dateStr = r.date as string;
        return dateStr?.startsWith(month);
      });
    }

    const income = records
      .filter((r) => r.type === "دخل")
      .reduce((sum, r) => sum + (r.amount as number || 0), 0);
    const expense = records
      .filter((r) => r.type === "مصروف")
      .reduce((sum, r) => sum + (r.amount as number || 0), 0);
    const savings = records
      .filter((r) => r.type === "ادخار")
      .reduce((sum, r) => sum + (r.amount as number || 0), 0);
    const investment = records
      .filter((r) => r.type === "استثمار")
      .reduce((sum, r) => sum + (r.amount as number || 0), 0);

    if (records.length === 0) {
      return { content: [{ type: "text" as const, text: month ? `لا توجد سجلات مالية لشهر ${month}` : "لا توجد سجلات مالية" }] };
    }

    const recent = records.slice(0, 10).map((r) => {
      const emoji = r.type === "دخل" ? "💚" : r.type === "مصروف" ? "🔴" : r.type === "ادخار" ? "🏦" : "📈";
      return `  ${emoji} ${r.description || r.category} - ${r.amount} ر.س (${r.type}) ${r.date || ""}`;
    }).join("\n");

    const summary = [
      `💰 التقرير المالي${month ? ` - ${month}` : ""}`,
      "═".repeat(40),
      `  💚 الإيرادات: ${income} ر.س`,
      `  🔴 المصروفات: ${expense} ر.س`,
      `  🏦 الادخار: ${savings} ر.س`,
      `  📈 الاستثمار: ${investment} ر.س`,
      `  📊 صافي التدفق: ${income - expense} ر.س`,
      "",
      `📋 آخر السجلات (${Math.min(records.length, 10)} من ${records.length}):`,
      recent,
    ].join("\n");

    return { content: [{ type: "text" as const, text: summary }] };
  }
);

// 6. Journal
server.tool(
  "rise_get_journal",
  "الحصول على يومية يوم معين (الافتراضي: اليوم)",
  {
    date: z.string().optional()
      .describe("التاريخ بصيغة YYYY-MM-DD. إذا لم يتم تحديده، يُرجع يومية اليوم"),
  },
  async ({ date }) => {
    const journalDate = date || getToday();
    const { data, error } = await apiFetch("/api/rise/journal");
    if (error) return { content: [{ type: "text" as const, text: `❌ ${error}` }], isError: true };

    const d = data as { journal?: Record<string, unknown> | null; recentJournals?: Array<Record<string, unknown>> };
    const journal = d.journal;

    if (!journal) {
      return { content: [{ type: "text" as const, text: `📝 لا توجد يومية لـ ${journalDate}` }] };
    }

    const summary = [
      `📝 اليومية - ${journalDate}`,
      "═".repeat(40),
      `😊 المزاج: ${journal.mood ?? "غير محدد"} / 10`,
      journal.gratitude ? `\n🙏 الامتنان:\n  ${journal.gratitude}` : "",
      journal.highlights ? `\n✨ أبرز اللحظات:\n  ${journal.highlights}` : "",
      journal.lessons ? `\n📚 الدروس المستفادة:\n  ${journal.lessons}` : "",
      journal.tomorrow ? `\n🚀 خطط الغد:\n  ${journal.tomorrow}` : "",
    ].filter(Boolean).join("\n");

    return { content: [{ type: "text" as const, text: summary }] };
  }
);

// 7. Focus Sessions
server.tool(
  "rise_get_focus_sessions",
  "الحصول على سجل جلسات التركيز والعمل العميق",
  {
    days: z.number().optional().describe("عدد الأيام الأخيرة لعرض الجلسات (الافتراضي: 7)"),
  },
  async ({ days }) => {
    const { data, error } = await apiFetch("/api/rise/focus");
    if (error) return { content: [{ type: "text" as const, text: `❌ ${error}` }], isError: true };

    const d = data as { sessions?: Array<Record<string, unknown>> };
    let sessions = d.sessions || [];
    const n = days || 7;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - n);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    sessions = sessions.filter((s) => {
      const dateStr = (s.startedAt as string)?.split("T")[0];
      return dateStr >= cutoffStr;
    });

    const totalMin = sessions
      .filter((s) => s.completed)
      .reduce((sum, s) => sum + (s.actualMin as number || 0), 0);
    const completedCount = sessions.filter((s) => s.completed).length;

    if (sessions.length === 0) {
      return { content: [{ type: "text" as const, text: `🧘 لا توجد جلسات تركيز في آخر ${n} أيام` }] };
    }

    const list = sessions.slice(0, 10).map((s, i) => {
      const done = s.completed ? "✅" : "⏹️";
      const date = (s.startedAt as string)?.split("T")[0] || "";
      const min = s.actualMin || s.plannedMin || 0;
      return `  ${i + 1}. ${done} ${s.title || "جلسة تركيز"} - ${min} دقيقة (${date})`;
    }).join("\n");

    const summary = [
      `🧘 جلسات التركيز (آخر ${n} أيام)`,
      "═".repeat(40),
      `  📊 إجمالي الجلسات: ${sessions.length}`,
      `  ✅ جلسات مكتملة: ${completedCount}`,
      `  ⏱️ إجمالي الوقت: ${totalMin} دقيقة (${Math.round(totalMin / 60 * 10) / 10} ساعة)`,
      "",
      list,
    ].join("\n");

    return { content: [{ type: "text" as const, text: summary }] };
  }
);

// 8. Health
server.tool(
  "rise_get_health",
  "الحصول على بيانات الصحة واللياقة (نوم، ماء، رياضة، مزاج، طاقة)",
  {
    days: z.number().optional().describe("عدد الأيام الأخيرة (الافتراضي: 7)"),
  },
  async ({ days }) => {
    const { data, error } = await apiFetch("/api/rise/health");
    if (error) return { content: [{ type: "text" as const, text: `❌ ${error}` }], isError: true };

    const d = data as { logs?: Array<Record<string, unknown>>; todayLog?: Record<string, unknown> | null };
    const todayLog = d.todayLog;
    const logs = d.logs || [];
    const n = days || 7;

    const recentLogs = logs.slice(0, n);

    if (!todayLog && recentLogs.length === 0) {
      return { content: [{ type: "text" as const, text: "🏥 لا توجد بيانات صحية مسجلة" }] };
    }

    let summary = "🏥 بيانات الصحة\n" + "═".repeat(40) + "\n";

    if (todayLog) {
      summary += `\n📋 سجل اليوم (${getToday()}):`;
      if (todayLog.sleepHours) summary += `\n  😴 النوم: ${todayLog.sleepHours} ساعات`;
      if (todayLog.sleepQuality) summary += ` (جودة: ${todayLog.sleepQuality}/10)`;
      if (todayLog.water) summary += `\n  💧 الماء: ${todayLog.water} أكواب`;
      if (todayLog.exercise) summary += `\n  🏃 الرياضة: ${todayLog.exerciseType || "تمارين"} - ${todayLog.exercise} دقيقة`;
      if (todayLog.mood) summary += `\n  😊 المزاج: ${todayLog.mood}/10`;
      if (todayLog.energy) summary += `\n  ⚡ الطاقة: ${todayLog.energy}/10`;
      if (todayLog.steps) summary += `\n  👟 الخطوات: ${todayLog.steps}`;
      if (todayLog.weight) summary += `\n  ⚖️ الوزن: ${todayLog.weight} كجم`;
    }

    if (recentLogs.length > 0) {
      const avgSleep = recentLogs
        .filter((l) => l.sleepHours)
        .reduce((s, l) => s + (l.sleepHours as number), 0) / Math.max(recentLogs.filter((l) => l.sleepHours).length, 1);
      const avgMood = recentLogs
        .filter((l) => l.mood)
        .reduce((s, l) => s + (l.mood as number), 0) / Math.max(recentLogs.filter((l) => l.mood).length, 1);

      summary += `\n\n📊 متوسطات آخر ${recentLogs.length} أيام:`;
      summary += `\n  😴 متوسط النوم: ${avgSleep.toFixed(1)} ساعات`;
      summary += `\n  😊 متوسط المزاج: ${avgMood.toFixed(1)}/10`;
    }

    return { content: [{ type: "text" as const, text: summary }] };
  }
);

// 9. Projects
server.tool(
  "rise_get_projects",
  "الحصول على جميع المشاريع",
  {},
  async () => {
    const { data, error } = await apiFetch("/api/rise/projects");
    if (error) return { content: [{ type: "text" as const, text: `❌ ${error}` }], isError: true };

    const d = data as { projects?: Array<Record<string, unknown>> };
    const projects = d.projects || [];

    if (projects.length === 0) {
      return { content: [{ type: "text" as const, text: "📁 لا توجد مشاريع" }] };
    }

    const list = projects.map((p, i) => {
      const status = p.status === "completed" ? " ✅" : p.status === "archived" ? " 📦" : " 🟢";
      const color = p.color ? ` (${p.color})` : "";
      const desc = p.description ? `\n     ${p.description}` : "";
      return `  ${i + 1}. 📁 ${p.name}${color}${status}${desc}`;
    }).join("\n");

    const summary = `📁 المشاريع (${projects.length}):\n${list}`;
    return { content: [{ type: "text" as const, text: summary }] };
  }
);

// 10. Productivity Score
server.tool(
  "rise_get_productivity_score",
  "الحصول على نتيجة الإنتاجية والتقييم اليومي مع تفصيل النقاط",
  {
    date: z.string().optional()
      .describe("التاريخ بصيغة YYYY-MM-DD. الافتراضي: اليوم"),
  },
  async ({ date }) => {
    const dateStr = date || getToday();
    const { data, error } = await apiFetch(`/api/rise/productivity-score?dates=${dateStr}`);
    if (error) return { content: [{ type: "text" as const, text: `❌ ${error}` }], isError: true };

    // Also get the detailed breakdown for today
    const { data: detailData } = await apiFetch("/api/rise/productivity-score");
    const detail = detailData as Record<string, unknown> | null;

    const d = data as { scores?: Array<{ date: string; score: number }> };
    const scoreEntry = d.scores?.[0];

    if (!scoreEntry) {
      return { content: [{ type: "text" as const, text: `📊 لا توجد بيانات إنتاجية لـ ${dateStr}` }] };
    }

    const breakdown = detail?.breakdown as Record<string, number> | undefined;
    const grade = detail?.grade as string | undefined;

    const bar = (val: number) => "█".repeat(Math.round(val / 10)) + "░".repeat(10 - Math.round(val / 10));

    const summary = [
      `📊 نتيجة الإنتاجية - ${dateStr}`,
      "═".repeat(40),
      `  النتيجة الإجمالية: ${scoreEntry.score}/100 ${bar(scoreEntry.score)}`,
      grade ? `  التقييم: ${grade}` : "",
      "",
      breakdown ? "  التفصيل:" : "",
      breakdown ? `  📋 المهام:    ${breakdown.tasks}% ${bar(breakdown.tasks)}` : "",
      breakdown ? `  🔄 العادات:   ${breakdown.habits}% ${bar(breakdown.habits)}` : "",
      breakdown ? `  🧘 التركيز:   ${breakdown.focus}% ${bar(breakdown.focus)}` : "",
      breakdown ? `  🌅 الصباح:    ${breakdown.morning}% ${bar(breakdown.morning)}` : "",
      breakdown ? `  ⚡ السلسلة:   ${breakdown.streak}% ${bar(breakdown.streak)}` : "",
    ].filter(Boolean).join("\n");

    return { content: [{ type: "text" as const, text: summary }] };
  }
);

// ═══════════════════════════════════════════════════════════════════
// WRITE / ACTION TOOLS
// ═══════════════════════════════════════════════════════════════════

// 11. Add Task
server.tool(
  "rise_add_task",
  "إضافة مهمة جديدة",
  {
    title: z.string().describe("عنوان المهمة"),
    description: z.string().optional().describe("وصف المهمة"),
    priority: z.enum(["low", "medium", "high"]).optional().describe("الأولوية: low (منخفضة) أو medium (متوسطة) أو high (عالية)"),
    dueDate: z.string().optional().describe("تاريخ الاستحقاق بصيغة YYYY-MM-DD"),
    projectId: z.string().optional().describe("معرف المشروع المرتبط بالمهمة"),
  },
  async ({ title, description, priority, dueDate, projectId }) => {
    const body: Record<string, unknown> = {
      title,
      status: "pending",
    };
    if (description) body.description = description;
    if (priority) body.priority = priority;
    if (dueDate) body.dueDate = dueDate;
    if (projectId) body.projectId = projectId;

    const { data, error } = await apiFetch("/api/rise/tasks", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (error) return { content: [{ type: "text" as const, text: `❌ فشل إضافة المهمة: ${error}` }], isError: true };

    return {
      content: [{
        type: "text" as const,
        text: `✅ تم إضافة المهمة: "${title}"${priority ? ` [${priority}]` : ""}${dueDate ? ` - استحقاق: ${dueDate}` : ""}`,
      }],
    };
  }
);

// 12. Toggle Habit
server.tool(
  "rise_toggle_habit",
  "تحديد عادة كمكتملة أو غير مكتملة لليوم",
  {
    habitId: z.string().describe("معرف العادة"),
    completed: z.boolean().describe("true لإكمال العادة، false لإلغاء الإكمال"),
  },
  async ({ habitId, completed }) => {
    const today = getToday();

    const { data, error } = await apiFetch("/api/rise/habits", {
      method: "PUT",
      body: JSON.stringify({ habitId, date: today, completed }),
    });

    if (error) return { content: [{ type: "text" as const, text: `❌ فشل تحديث العادة: ${error}` }], isError: true };

    const msg = completed ? "تم تحديد العادة كمكتملة ✅" : "تم إلغاء إكمال العادة ⬜";
    return { content: [{ type: "text" as const, text: msg }] };
  }
);

// 13. Add Finance Record
server.tool(
  "rise_add_finance_record",
  "إضافة سجل مالي جديد (دخل أو مصروف أو ادخار أو استثمار)",
  {
    type: z.enum(["دخل", "مصروف", "ادخار", "استثمار"]).describe("نوع السجل"),
    category: z.string().describe("التصنيف (مثل: طعام، مواصلات، راتب)"),
    description: z.string().describe("وصف السجل"),
    amount: z.number().describe("المبلغ بالريال"),
  },
  async ({ type, category, description, amount }) => {
    const body = {
      type,
      category,
      description,
      amount,
      date: getToday(),
    };

    const { data, error } = await apiFetch("/api/rise/finance", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (error) return { content: [{ type: "text" as const, text: `❌ فشل إضافة السجل المالي: ${error}` }], isError: true };

    const emoji = type === "دخل" ? "💚" : type === "مصروف" ? "🔴" : type === "ادخار" ? "🏦" : "📈";
    return {
      content: [{
        type: "text" as const,
        text: `✅ ${emoji} تم إضافة ${type}: ${description} - ${amount} ر.س (${category})`,
      }],
    };
  }
);

// 14. Write Journal
server.tool(
  "rise_write_journal",
  "كتابة أو تحديث يومية اليوم (المزاج، الامتنان، أبرز اللحظات، الدروس، خطط الغد)",
  {
    mood: z.number().min(1).max(10).optional().describe("المزاج من 1 إلى 10"),
    gratitude: z.string().optional().describe("ما أنت ممتن له اليوم"),
    highlights: z.string().optional().describe("أبرز لحظات اليوم"),
    lessons: z.string().optional().describe("الدروس المستفادة"),
    tomorrow: z.string().optional().describe("خطط وأهداف الغد"),
  },
  async ({ mood, gratitude, highlights, lessons, tomorrow }) => {
    const body: Record<string, unknown> = {};
    if (mood !== undefined) body.mood = mood;
    if (gratitude) body.gratitude = gratitude;
    if (highlights) body.highlights = highlights;
    if (lessons) body.lessons = lessons;
    if (tomorrow) body.tomorrow = tomorrow;

    if (Object.keys(body).length === 0) {
      return { content: [{ type: "text" as const, text: "⚠️ لم يتم تحديد أي بيانات لكتابتها في اليومية" }], isError: true };
    }

    const { data, error } = await apiFetch("/api/rise/journal", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (error) return { content: [{ type: "text" as const, text: `❌ فشل حفظ اليومية: ${error}` }], isError: true };

    return { content: [{ type: "text" as const, text: "✅ تم حفظ اليومية بنجاح 📝" }] };
  }
);

// 15. Add Goal
server.tool(
  "rise_add_goal",
  "إضافة هدف جديد",
  {
    title: z.string().describe("عنوان الهدف"),
    description: z.string().optional().describe("وصف الهدف"),
    category: z.string().optional().describe("تصنيف الهدف (مثل: صحة، مهنية، مالية)"),
    targetDate: z.string().optional().describe("تاريخ التحقيق المستهدف بصيغة YYYY-MM-DD"),
  },
  async ({ title, description, category, targetDate }) => {
    const body: Record<string, unknown> = {
      title,
      status: "active",
    };
    if (description) body.description = description;
    if (category) body.category = category;
    if (targetDate) body.targetDate = targetDate;

    const { data, error } = await apiFetch("/api/rise/goals", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (error) return { content: [{ type: "text" as const, text: `❌ فشل إضافة الهدف: ${error}` }], isError: true };

    return {
      content: [{
        type: "text" as const,
        text: `✅ تم إضافة الهدف: "${title}"${category ? ` [${category}]` : ""}${targetDate ? ` - مستهدف: ${targetDate}` : ""}`,
      }],
    };
  }
);

// ═══════════════════════════════════════════════════════════════════
// RESOURCE TEMPLATES
// ═══════════════════════════════════════════════════════════════════

// Resource: Analytics Overview
server.resource(
  "analytics-overview",
  "rise://analytics/overview",
  "نظرة عامة شاملة على جميع بيانات RiseOS التحليلية",
  async () => {
    const { data, error } = await apiFetch("/api/rise/dashboard");
    if (error) {
      return {
        contents: [{ uri: "rise://analytics/overview", mimeType: "application/json", text: JSON.stringify({ error }) }],
      };
    }
    return {
      contents: [{ uri: "rise://analytics/overview", mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// Resource: Finance Report
server.resource(
  "finance-report",
  "rise://finance/report",
  "تقرير مالي شامل مع ملخص الإيرادات والمصروفات",
  async () => {
    const { data, error } = await apiFetch("/api/rise/finance");
    if (error) {
      return {
        contents: [{ uri: "rise://finance/report", mimeType: "application/json", text: JSON.stringify({ error }) }],
      };
    }

    const d = data as { records?: Array<Record<string, unknown>> };
    const records = d.records || [];

    const income = records.filter((r) => r.type === "دخل").reduce((s, r) => s + (r.amount as number || 0), 0);
    const expense = records.filter((r) => r.type === "مصروف").reduce((s, r) => s + (r.amount as number || 0), 0);
    const savings = records.filter((r) => r.type === "ادخار").reduce((s, r) => s + (r.amount as number || 0), 0);
    const investment = records.filter((r) => r.type === "استثمار").reduce((s, r) => s + (r.amount as number || 0), 0);

    const report = {
      generatedAt: new Date().toISOString(),
      summary: { income, expense, savings, investment, netFlow: income - expense },
      totalRecords: records.length,
      records,
    };

    return {
      contents: [{ uri: "rise://finance/report", mimeType: "application/json", text: JSON.stringify(report, null, 2) }],
    };
  }
);

// ═══════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("MCP Server fatal error:", error);
  process.exit(1);
});