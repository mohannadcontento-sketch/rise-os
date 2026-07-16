# RiseOS MCP Server — دليل الإعداد الكامل

## ما هو MCP؟
MCP (Model Context Protocol) هو بروتوكول من Anthropic يتيح لنماذج الذكاء الاصطناعي التعامل مع تطبيقاتك مباشرة — قراءة البيانات، تعديل المهام، كتابة اليوميات، وعرض التحاليل.

---

## 🚀 طريقة الإعداد مع Claude Desktop

### الخطوة 1: نسخ المشروع محلياً
```bash
git clone https://github.com/mohannadcontento-sketch/rise-os.git
cd rise-os
cd mini-services/mcp-server && bun install && cd ../..
```

### الخطوة 2: إضافة الإعدادات في Claude Desktop

افتح ملف الإعدادات:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

أضف هذا المحتوى:
```json
{
  "mcpServers": {
    "riseos": {
      "command": "bun",
      "args": ["/المسار/الكامل/للمشروع/rise-os/mini-services/mcp-server/index.ts"],
      "env": {
        "RISE_API_URL": "https://rise-os-gamma.vercel.app"
      }
    }
  }
}
```

> ⚠️ استبدل `/المسار/الكامل/للمشروع/rise-os` بالمسار الفعلي على جهازك

### الخطوة 3: أعد تشغيل Claude Desktop

بعد الإعادة، Claude هيظهر رسالة "MCP server connected" ✅

### الخطوة 4: استخدمه!
اسأل Claude أي سؤال مثل:
- "شوف لوحة التحكم بتاعتي في RiseOS"
- "ضيف مهمة جديدة: إنهاء تقرير المشروع"
- "إيه تقدم أهدافي؟"
- "كتب لي يومية اليوم"

---

## 🔗 طريقة الربط مع أي AI آخر

### مع ChatGPT (OpenAI)

#### الطريقة 1: عبر MCP Proxy
```bash
# ثبّت mcp-proxy
npm install -g @anthropic-ai/mcp-proxy

# شغّل البروكسي
RISE_API_URL=https://rise-os-gamma.vercel.app \
mcp-proxy --port 8080 -- \
  bun run mini-services/mcp-server/index.ts
```
ثم أضف في OpenAI GPTs كـ External Tool endpoint `http://localhost:8080`

#### الطريقة 2: عبر Cursor IDE
افتح Cursor Settings → MCP → Add Server:
- **Name**: `riseos`
- **Command**: `bun`
- **Args**: `run /path/to/rise-os/mini-services/mcp-server/index.ts`
- **Env**: `RISE_API_URL=https://rise-os-gamma.vercel.app`

---

### مع VS Code + Copilot

1. ثبّت إضافة "MCP for VS Code"
2. أضف في `.vscode/mcp.json`:
```json
{
  "servers": {
    "riseos": {
      "command": "bun",
      "args": ["run", "/path/to/rise-os/mini-services/mcp-server/index.ts"],
      "env": {
        "RISE_API_URL": "https://rise-os-gamma.vercel.app"
      }
    }
  }
}
```

---

### مع Cursor IDE (مباشر)

افتح:
- `Cursor Settings → Features → MCP`
- اضغط "Add MCP Server"
- **Type**: `stdio`
- **Command**: `bun`
- **Args**: `run /path/to/rise-os/mini-services/mcp-server/index.ts`
- **Env Variable**: `RISE_API_URL` = `https://rise-os-gamma.vercel.app`

---

### مع Windsurf (Codeium)

في ملف `~/.codeium/windsurf/mcp_config.json`:
```json
{
  "mcpServers": {
    "riseos": {
      "command": "bun",
      "args": ["run", "/path/to/rise-os/mini-services/mcp-server/index.ts"],
      "env": {
        "RISE_API_URL": "https://rise-os-gamma.vercel.app"
      }
    }
  }
}
```

---

### مع أي تطبيق يدعم MCP (عبر npx)

لو التطبيق يدعم تشغيل MCP servers عبر npx:

```json
{
  "mcpServers": {
    "riseos": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "riseos-mcp@latest"],
      "env": {
        "RISE_API_URL": "https://rise-os-gamma.vercel.app"
      }
    }
  }
}
```

> ملاحظة: هذا يتطلب نشر الحزمة على npm (خطوة مستقبلية)

---

## 🛠️ الأدوات المتاحة (16 أداة)

### المصادقة
| الأداة | الوظيفة |
|--------|---------|
| `rise_auth` | تسجيل دخول بالإيميل والباسورد |

### القراءة والتحليل
| الأداة | الوظيفة |
|--------|---------|
| `rise_get_dashboard` | لوحة التحكم الكاملة |
| `rise_get_tasks` | عرض المهام (مع فلتر الحالة) |
| `rise_get_habits` | العادات وحالة اليوم |
| `rise_get_goals` | الأهداف والتقدم |
| `rise_get_finance` | السجلات المالية |
| `rise_get_journal` | يوميات اليوم |
| `rise_get_focus_sessions` | جلسات العمل العميق |
| `rise_get_health` | بيانات الصحة |
| `rise_get_projects` | المشروعات |
| `rise_get_productivity_score` | نتيجة الإنتاجية |

### الكتابة والتعديل
| الأداة | الوظيفة |
|--------|---------|
| `rise_add_task` | إضافة مهمة جديدة |
| `rise_toggle_habit` | تسجيل/إلغاء عادة |
| `rise_add_finance_record` | إضافة سجل مالي |
| `rise_write_journal` | كتابة يوميات |
| `rise_add_goal` | إضافة هدف جديد |

### الموارد (Resources)
| المورد | الوظيفة |
|--------|---------|
| `rise://analytics/overview` | تقرير التحليلات الكامل |
| `rise://finance/report` | التقرير المالي الشامل |

---

## 🔧 متغيرات البيئة

| المتغير | الوصف | الافتراضي |
|---------|-------|-----------|
| `RISE_API_URL` | رابط API التطبيق | `http://localhost:3000` |

---

## 📋 أمثلة على الاستخدام

بعد الربط، اسأل الـ AI أي سؤال:

**"إيه ملخص يومي في RiseOS؟"**
→ AI يستدعي `rise_auth` ثم `rise_get_dashboard` ويعرض لك ملخص

**"ضيف مهمة جديدة: مراجعة كود المشروع"**
→ AI يستدعي `rise_add_task` بالبيانات المناسبة

**"إيه ميزانيتي الشهرية؟"**
→ AI يستدعي `rise_get_finance` ويحلل لك المصروفات

**"سجّل أني خلصت عادة القراءة اليوم"**
→ AI يستدعي `rise_toggle_habit`

**"كتب لي يومية بتحفيز إيجابي"**
→ AI يستدعي `rise_write_journal` بمحتوى محفز

**"شوف تقدم أهدافي واقترحلي خطوات"**
→ AI يستدعي `rise_get_goals` ويحلل التقدم