// ============================================================
// postgrest.ts — عميل PostgREST خفيف لـEdge Functions (Deno)
//
// «صفر تبعيات»: لا supabase-js ولا أي npm — فقط fetch الأصلية.
// هذا يضمن توافقًا كاملًا مع edge-runtime المقيّد على Supabase
// ويجعل المنطق قابلًا للاختبار محليًا عبر توجيه baseUrl نحو
// خادم وهمي (انظر supabase/tests/edge/mock-postgrest.ts).
//
// العقد المُستهدَف (مطابق لما تفعله مستودعات التطبيق عبر
// supabase-js، لأن Edge Function تعمل بمفتاح service_role):
//   • GET  /rest/v1/{table}?select=…&filters…  → صفوف
//   • GET  بـ Accept: vnd.pgrst.object (maybeSingle) → كائن
//     أو null عند PGRST116 (نفس معالجة postgrest-js للـ406)
//   • POST /rest/v1/rpc/{fn} بجسم JSON → ناتج الدالة
//   • POST upsert عبر ?on_conflict=… + Prefer:
//     resolution=merge-duplicates,return=representation
//   • PATCH للتحديثات الجزئية (last_used_at للمفاتيح)
//
// الأمان: كل نداء يحمل ترويستي apikey + Authorization بمفتاح
// الخدمة — PostgREST يضبط request.jwt.claim.role=service_role
// فتُتجاوز RLS؛ لذلك يفرض كل مستدعٍ ملكية user_id بنفسه
// (تنبيه موثّق في كل مكان يستدعي هذا الملف).
//
// المهلة: AbortSignal.timeout(10s) لكل نداء — لا تعليق
// دائم داخل Edge Function مهما استجاب الخادم.
// ============================================================

/** خطأ PostgREST مُغلَّف برمز الحالة (يفضَّل على رسالة fetch) */
export class PostgrestError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'PostgrestError'
    this.status = status
    this.code = code
  }
}

/** شكل خطأ PostgREST القياسي في الجسم */
interface PostgrestErrorBody {
  message?: string
  code?: string
  details?: string
  hint?: string
}

export interface PostgrestOptions {
  /** قاعدة المعرّف: https://<ref>.supabase.co (بلا شرطة مائلة ختامية) */
  baseUrl: string
  /** مفتاح الخدمة (service_role) — يُقرأ من متغيرات البيئة المحقونة */
  serviceKey: string
  /** fetch قابلة للاستبدال للاختبار (الافتراضي العالمية) */
  fetchImpl?: typeof fetch
}

export interface QueryParams {
  /** select=... (افتراضي *) */
  select?: string
  /** فلاتر خام: { user_id: 'eq.<uuid>', date: 'eq.2026-09-13' } */
  filters?: Record<string, string>
  /** ترتيب: ['order.asc', 'date.desc'] */
  order?: string[]
  /** حد النتائج */
  limit?: number
}

// ── القسم: ترميز الاستعلام ─────────────────────

/** بناء سلسلة الاستعلام من الأجزاء (فلاتر + ترتيب + حد) */
export function buildQuery(params: QueryParams): string {
  const parts: string[] = []
  parts.push(`select=${encodeURIComponent(params.select ?? '*')}`)
  for (const [key, value] of Object.entries(params.filters ?? {})) {
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  }
  for (const o of params.order ?? []) parts.push(`order=${encodeURIComponent(o)}`)
  if (params.limit) parts.push(`limit=${params.limit}`)
  return parts.join('&')
}

/**
 * صياغة قائمة in.() بقيم آمنة: in.("a","b") — علامات الاقتباس
 * إلزامية لقيم تحوي فواصل/مسافات، وصحيحة تمامًا للـUUID والتواريخ.
 */
export function inList(values: string[]): string {
  const quoted = values.map((v) => `"${v.replace(/"/g, '\\"')}"`)
  return `in.(${quoted.join(',')})`
}

// ── القسم: العميل ─────────────────────

export class Postgrest {
  private base: string
  private key: string
  private fetchImpl: typeof fetch

  constructor(opts: PostgrestOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, '')
    this.key = opts.serviceKey
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      ...extra,
    }
  }

  /** نداء خام — يفك الخطأ أو يعيد الجسم محلولًا */
  private async call(path: string, init: RequestInit): Promise<unknown> {
    let res: Response
    try {
      res = await this.fetchImpl(`${this.base}${path}`, init)
    } catch (err) {
      throw new PostgrestError(`تعذر الوصول لقاعدة البيانات: ${(err as Error)?.message ?? ''}`, 503)
    }

    const text = await res.text()
    let body: unknown = null
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        body = text
      }
    }

    if (!res.ok) {
      const errBody = (body ?? {}) as PostgrestErrorBody
      throw new PostgrestError(
        errBody.message ?? `فشل نداء قاعدة البيانات (${res.status})`,
        res.status,
        errBody.code,
      )
    }
    return body
  }

  /** GET صفوف — مصفوفة */
  async select(table: string, params: QueryParams = {}): Promise<unknown> {
    return this.call(`/rest/v1/${table}?${buildQuery(params)}`, {
      method: 'GET',
      headers: this.headers(),
      signal: AbortSignal.timeout(10_000),
    })
  }

  /** GET صف واحد — null عند غيابه (PGRST116 = «لا صفوف» وليس خطأ) */
  async maybeSingle(table: string, params: QueryParams = {}): Promise<unknown> {
    try {
      return await this.call(`/rest/v1/${table}?${buildQuery(params)}`, {
        method: 'GET',
        headers: this.headers({ Accept: 'application/vnd.pgrst.object+json' }),
        signal: AbortSignal.timeout(10_000),
      })
    } catch (err) {
      if (err instanceof PostgrestError && err.code === 'PGRST116') return null
      throw err
    }
  }

  /** استدعاء دالة SQL — يعيد ناتجها كما هو */
  async rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
    return this.call(`/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(10_000),
    })
  }

  /** upsert ذري — on_conflict يطابق أقواس القيود الفريدة */
  async upsert(
    table: string,
    row: Record<string, unknown>,
    onConflict: string,
  ): Promise<unknown> {
    return this.call(
      `/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
      {
        method: 'POST',
        headers: this.headers({
          Accept: 'application/vnd.pgrst.object+json',
          Prefer: 'resolution=merge-duplicates,return=representation',
        }),
        body: JSON.stringify(row),
        signal: AbortSignal.timeout(10_000),
      },
    )
  }

  /** تحديث جزئي (patch) — يُستخدم لـlast_used_at فقط */
  async patch(
    table: string,
    filters: Record<string, string>,
    row: Record<string, unknown>,
  ): Promise<void> {
    const qs = Object.entries(filters)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')
    await this.call(`/rest/v1/${table}?${qs}`, {
      method: 'PATCH',
      headers: this.headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(10_000),
    })
  }

  /** إدراج سجل (التدقيق) — بلا إعادة تمثيل */
  async insert(table: string, row: Record<string, unknown>): Promise<void> {
    await this.call(`/rest/v1/${table}`, {
      method: 'POST',
      headers: this.headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(10_000),
    })
  }

  /** حذف بفلاتر (تنظيف رموز OAuth المنتهية — أفضل جهد) */
  async delete(table: string, filters: Record<string, string>): Promise<void> {
    const qs = Object.entries(filters)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')
    await this.call(`/rest/v1/${table}?${qs}`, {
      method: 'DELETE',
      headers: this.headers({ Prefer: 'return=minimal' }),
      signal: AbortSignal.timeout(10_000),
    })
  }
}
