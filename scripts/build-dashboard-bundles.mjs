#!/usr/bin/env node
// ============================================================
// scripts/build-dashboard-bundles.mjs — باني حزم Dashboard
//
// المشكلة التي يحلها: لوحة Supabase (Edge Functions → Create
// function) تقبل ملفًا واحدًا فقط. ملفات الوظائف في المستودع
// تستورد من ../_shared/*.ts فتفشل الحزم داخل اللوحة بـ:
//   Module not found ".../_shared/mcp-core.ts"
//
// الحل: هذا السكربت يدمج كل نواة _shared مع نقطة الدخول في
// ملف واحد بلا أي استيراد نسبي — يُلصق كما هو في اللوحة.
//
// التشغيل: node scripts/build-dashboard-bundles.mjs
// المخرجات:
//   supabase/dist/mcp.dashboard.ts
//   supabase/dist/push-dispatch.dashboard.ts
//   supabase/dist/README.md (تعليمات اللصق — تُحدّث تلقائيًا)
//
// قواعد الأمان في الدمج:
//   1) لا نلمس الاستيرادات غير النسبية (لا توجد أصلًا —
//      الوحدات بلا تبعيات خارجية عمدًا)
//   2) نفكّ كلمة export من التصريحات العلوية فقط (سطر يبدأ
//      بها) — لا نص داخل سلاسل
//   3) فحص تصادم أسماء التصريحات العلوية بين الوحدات
//   4) الترتيب: التبعيات أولًا (postgrest → … → index)
// ============================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fnsDir = join(root, 'supabase/functions')
const distDir = join(root, 'supabase/dist')
mkdirSync(distDir, { recursive: true })

/** استيراد نسبي إلى _shared أو داخلها — يُحذف بعد الدمج */
const RELATIVE_IMPORT = /^import\s[^;]*?from\s+['"]\.\.?\/[^'"]+\.ts['"];?\s*$/

/** فك export من بداية سطر تصريح فقط */
function stripExports(text) {
  return text
    .split('\n')
    .map((line) => (line.startsWith('export ') ? line.slice('export '.length) : line))
    .join('\n')
}

/** إزالة أسطر الاستيراد النسبي فقط */
function stripRelativeImports(text) {
  return text
    .split('\n')
    .filter((line) => !RELATIVE_IMPORT.test(line.trim()))
    .join('\n')
}

/** جمع أسماء التصريحات العلوية لكشف التصادم بين الوحدات */
const DECL_RE =
  /^(?:declare\s+)?(?:async\s+)?(?:function\*?\s+|class\s+|const\s+|let\s+|var\s+|interface\s+|type\s+|enum\s+)([A-Za-z_$][\w$]*)/
function topLevelNames(text) {
  const names = []
  for (const line of text.split('\n')) {
    const m = DECL_RE.exec(line)
    if (m) names.push(m[1])
  }
  return names
}

/** دمج وحدة واحدة: نزيل الاستيرادات النسبية ونفك التصدير */
function mergeModule(relPath) {
  const abs = join(fnsDir, relPath)
  let text = readFileSync(abs, 'utf8')
  text = stripRelativeImports(text)
  text = stripExports(text)
  return { relPath, text, names: topLevelNames(text) }
}

/** بناء حزمة كاملة من قائمة وحدات بترتيبها الصحيح */
function buildBundle(functionName, modules) {
  const seen = new Map()
  for (const mod of modules) {
    for (const name of mod.names) {
      if (seen.has(name) && seen.get(name) !== mod.relPath) {
        throw new Error(
          `تصادم اسم تصريح علوية «${name}» بين ${seen.get(name)} و ${mod.relPath} — أصلح قبل الحزم`,
        )
      }
      seen.set(name, mod.relPath)
    }
  }

  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
  const header = `// ════════════════════════════════════════════════════════════
// ملف مدموج آليًا للنشر من لوحة Supabase (الوظيفة: ${functionName})
// وُلِّد بواسطة scripts/build-dashboard-bundles.mjs — ${stamp}
// لا تحرر هذا الملف يدويًا؛ عدّل المصادر ثم أعد التوليد.
//
// طريقة النشر (Dashboard):
//   1) Edge Functions → «Create a new function»
//   2) الاسم: ${functionName} (بالضبط — الرابط يعتمد عليه)
//   3) عطّل «Verify JWT with legacy secret» إن ظهر الخيار
//   4) الصق كامل هذا الملف ثم Save/Deploy
//   المصادر الأصلية:
${modules.map((m) => `//     ${m.relPath}`).join('\n')}
// ════════════════════════════════════════════════════════════
`

  const body = modules
    .map(
      (m) => `// ──────────────────── من ${m.relPath} ────────────────────
${m.text.trimEnd()}
`,
    )
    .join('\n')

  return header + '\n' + body + '\n'
}

// ── حزمة MCP: postgrest → mcp-tools → mcp-core → index ──
const mcpBundle = buildBundle('mcp', [
  mergeModule('_shared/postgrest.ts'),
  mergeModule('_shared/mcp-tools.ts'),
  mergeModule('_shared/mcp-core.ts'),
  mergeModule('mcp/index.ts'),
])
writeFileSync(join(distDir, 'mcp.dashboard.ts'), mcpBundle)

// ── حزمة البوش: postgrest → webpush → push-core → index ──
const pushBundle = buildBundle('push-dispatch', [
  mergeModule('_shared/postgrest.ts'),
  mergeModule('_shared/webpush.ts'),
  mergeModule('_shared/push-core.ts'),
  mergeModule('push-dispatch/index.ts'),
])
writeFileSync(join(distDir, 'push-dispatch.dashboard.ts'), pushBundle)

// ── README قصير بجانب الحزم ──
const readme = `# حزم لوحة Supabase (ملفات مدموجة)

وُلِّدت آليًا بواسطة \`scripts/build-dashboard-bundles.mjs\` — لا تحررها يدويًا.

| الملف | الوظيفة في Supabase | طريقة النشر |
|---|---|---|
| \`mcp.dashboard.ts\` | \`mcp\` | Dashboard: Edge Functions → Create function → الاسم \`mcp\` → الصق → Deploy |
| \`push-dispatch.dashboard.ts\` | \`push-dispatch\` | نفس الطريقة بالاسم \`push-dispatch\` |

ملاحظات:
- عطّل خيار «Verify JWT» عند إنشاء الوظيفة في اللوحة (إن ظهر).
- المتغيران SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY يُحقنان تلقائيًا من المنصة.
- للتعديل: عدّل المصادر في \`supabase/functions/\` ثم \`node scripts/build-dashboard-bundles.mjs\`.
- مسار CLI البديل (المستودع كاملًا): راجع \`supabase/DEPLOY.md\`.
`
writeFileSync(join(distDir, 'README.md'), readme)

const lines = (mcpBundle.match(/\n/g) || []).length
const pushLines = (pushBundle.match(/\n/g) || []).length
console.log(`✓ supabase/dist/mcp.dashboard.ts (${lines} سطر)`)
console.log(`✓ supabase/dist/push-dispatch.dashboard.ts (${pushLines} سطر)`)
console.log(`✓ supabase/dist/README.md`)
