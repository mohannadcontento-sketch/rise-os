'use client'

// ============================================================
// explore-hub.tsx — المرحلة 18: مركز الاستكشف (Explore Hub)
//
// UX_FOUNDATION §1.4/§3/§9-3: يستبدل الوصول الشبكي لـ 20+ وحدة —
// كل الوحدات تبقى محفوظة لكن الوصول يجري عبر العوالم الأربعة
// (أنجز ٦ · تطور ٣ · توازن ٤ · إدارة حياتي ٥ = ١٨ + مستقلة).
//
// البنية (من أعلى لأسفل):
//   ١) بحث محلي فوري — يفتح أي وحدة مباشرة (بلا شبكة: بيانات
//      محلية فقط وفق §6 — Explore: فوري، لا loading ولا error)
//   ٢) بطاقات العوالم الأربعة — بئر أيقونة بغراديان هوية العالم
//      + وحداته كأزرار بأيقوناتها (كل عالم ≤ ٦ — قاعدة §5)
//   ٣) «خارج العوالم» — الرئيسية/المجتمع/الإعدادات (+ الأدمن)
//
// الوصول: استكشف → عالم → وحدة = ٢ نقر (عقد §4.3) · أو كتابة
// حرفين + Enter = ١ (مسار الجوال المكافئ لـ ⌘K).
//
// a11y: كل بند قابل للتركيز focus-visible · aria-label «افتح X» ·
// ترتيب دلالي h2 (عنوان الوحدة من الصدفة) ثم h3 للعوالم.
// ============================================================

import { useMemo, useState } from 'react'
import { useRiseStore, type ModuleId } from '@/store/app-store'
import { MODULE_ICONS, RiseGlyphIcon } from './icons'
import { MODULE_LABELS } from '@/lib/module-labels'
import { WORLDS, INDEPENDENT_MODULES } from '@/lib/worlds'
import { cn } from '@/lib/utils'
import { Search, X, ArrowLeft } from 'lucide-react'

/** أرقام شرقية للعرض (قاعدة §7/4) */
function toArabicNum(n: number): string {
  return String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)])
}

/** فهرس البحث: وحدات العوالم + النقاط المستقلة (الأدمن يضاف شرطيًا) */
const SEARCH_BASE: ModuleId[] = [
  'dashboard',
  ...WORLDS.flatMap((w) => w.items),
  ...INDEPENDENT_MODULES,
  'settings',
]

/** عالم كل وحدة (لعرضه صغيرًا بجانب نتيجة البحث) */
const MODULE_WORLD = new Map<string, string>(
  WORLDS.flatMap((w) => w.items.map((id) => [id, w.title] as const)),
)

export default function ExploreHub() {
  const activeModule = useRiseStore((s) => s.activeModule)
  const setActiveModule = useRiseStore((s) => s.setActiveModule)
  const isAdmin = useRiseStore((s) => s.auth?.isAdmin || false)
  const [query, setQuery] = useState('')

  /** بحث محلي — أول ٦ نتائج فقط (ميزانية §5) */
  const matches = useMemo(() => {
    const q = query.trim()
    if (!q) return [] as { id: ModuleId; label: string }[]
    const pool: ModuleId[] = isAdmin ? [...SEARCH_BASE, 'admin-panel'] : SEARCH_BASE
    return pool
      .map((id) => ({ id, label: MODULE_LABELS[id] }))
      .filter((m) => m.label.includes(q))
      .slice(0, 6)
  }, [query, isAdmin])

  const open = (id: ModuleId) => setActiveModule(id)

  const hasQuery = query.trim().length > 0

  return (
    <div className="max-w-4xl mx-auto">
      {/* ١) البحث — يفتح أي وحدة مباشرة */}
      <section aria-label="بحث الوحدات" className="mb-5">
        <div className="relative">
          <Search
            className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches.length > 0) {
                e.preventDefault()
                open(matches[0].id)
              }
            }}
            placeholder="ابحث عن وحدة… (مثال: تقويم)"
            aria-label="ابحث عن وحدة"
            className="w-full h-12 rounded-2xl glass border border-border/60 ps-11 pe-10 text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40
                       placeholder:text-muted-foreground/60"
          />
          {hasQuery && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="مسح البحث"
              className="absolute end-3 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-muted/60 text-muted-foreground"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* نتائج البحث — قائمة مسطحة، Enter يفتح الأولى */}
        {hasQuery && (
          <div className="mt-3 glass rounded-2xl border border-border/60 overflow-hidden" role="listbox" aria-label="نتائج البحث">
            {matches.length === 0 ? (
              <p className="px-4 py-5 text-sm text-muted-foreground text-center">
                لا وحدة بهذا الاسم — جرّب كلمة أخرى أو افتح عالمًا بالأسفل
              </p>
            ) : (
              matches.map(({ id, label }) => {
                const meta = MODULE_ICONS[id] ?? { glyph: 'dashboard', hue: 'lime' }
                return (
                  <button
                    key={id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => open(id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-start border-b border-border/30 last:border-0
                               hover:bg-muted/40 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
                    aria-label={`افتح ${label}`}
                  >
                    <span className={cn('icon-well size-8 rounded-[0.6rem] shrink-0', `iw-${meta.hue}`)}>
                      <RiseGlyphIcon glyph={meta.glyph} size={16} />
                    </span>
                    <span className="flex-1 text-sm font-medium">{label}</span>
                    <span className="text-[10px] text-muted-foreground/70">
                      {MODULE_WORLD.get(id) || 'مستقلة'}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        )}
      </section>

      {/* ٢) العوالم الأربعة — بطاقات كبيرة (تظهر دومًا: بحث فارغ أو لا نتائج) */}
      {!hasQuery || matches.length === 0 ? (
        <section aria-label="العوالم الأربعة" className="space-y-3">
          {WORLDS.map((world) => (
            <div key={world.id} className="glass rounded-2xl border border-border/60 p-4 sm:p-5">
              <div className="flex items-center gap-3 mb-3.5">
                <span
                  className="icon-well size-10 rounded-[0.85rem] shrink-0"
                  style={{ background: world.gradient, color: '#fff' }}
                  aria-hidden="true"
                >
                  <RiseGlyphIcon glyph={world.glyph} size={20} />
                </span>
                <div className="min-w-0">
                  <h3 className="font-bold text-base leading-tight">
                    {world.title}
                    <span className="text-[10px] font-medium text-muted-foreground ms-1.5">
                      {toArabicNum(world.items.length)} وحدات
                    </span>
                  </h3>
                  <p className="text-xs text-muted-foreground truncate">{world.hint}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {world.items.map((id) => {
                  const meta = MODULE_ICONS[id] ?? { glyph: 'dashboard', hue: 'lime' }
                  const label = MODULE_LABELS[id]
                  const active = activeModule === id
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => open(id)}
                      aria-label={`افتح ${label}`}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-start transition-all',
                        'focus-visible:outline-2 focus-visible:-outline-offset-2 active:scale-[0.98]',
                        active
                          ? 'border-primary/50 bg-primary/10'
                          : 'border-border/60 hover:border-primary/30 hover:bg-muted/40',
                      )}
                    >
                      <span className={cn('icon-well size-7 rounded-lg shrink-0', `iw-${meta.hue}`)}>
                        <RiseGlyphIcon glyph={meta.glyph} size={14} />
                      </span>
                      <span className="text-xs font-medium truncate">{label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {/* ٣) خارج العوالم — هويات مستقلة (حسم §9/4 و§9/6) */}
      <section aria-label="خارج العوالم" className="mt-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 px-1 mb-2">
          خارج العوالم
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['dashboard', 'community', 'settings', ...(isAdmin ? (['admin-panel'] as ModuleId[]) : [])] as ModuleId[]).map((id) => {
            const meta = MODULE_ICONS[id] ?? { glyph: 'dashboard', hue: 'lime' }
            const label = MODULE_LABELS[id]
            const active = activeModule === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => open(id)}
                aria-label={`افتح ${label}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-start transition-all',
                  'focus-visible:outline-2 focus-visible:-outline-offset-2 active:scale-[0.98]',
                  active
                    ? 'border-primary/50 bg-primary/10'
                    : 'border-border/60 hover:border-primary/30 hover:bg-muted/40',
                )}
              >
                <span className={cn('icon-well size-7 rounded-lg shrink-0', `iw-${meta.hue}`)}>
                  <RiseGlyphIcon glyph={meta.glyph} size={14} />
                </span>
                <span className="text-xs font-medium truncate">{label}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* مساعد مهام: نقرات أقل — قصة §10 */}
      <p className="mt-6 text-center text-[11px] text-muted-foreground/60 flex items-center justify-center gap-1.5">
        <ArrowLeft className="w-3 h-3 rtl:rotate-0 ltr:rotate-180" aria-hidden="true" />
        على سطح المكتب: ⌘K يفتح أي وحدة بنقرة واحدة
      </p>
    </div>
  )
}
