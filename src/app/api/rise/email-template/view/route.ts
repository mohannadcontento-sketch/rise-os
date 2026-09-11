import { NextRequest, NextResponse } from 'next/server'
import { RECOVERY_EMAIL_HTML, RECOVERY_EMAIL_SUBJECT } from '@/lib/email/recovery-template'

export const dynamic = 'force-dynamic'

// ============================================================
// /api/rise/email-template/view — صفحة مساعدة عامة (بلا مصادقة)
//
// «زبط الايميل لاني مش فاهم» — بعد الفحص المباشر اتضح أن هذا
// المشروع على Supabase لا يملك جدول auth.email_templates (نسخة
// المنصة تخزّن القوالب في إعدادات GoTrue، لا في SQL) — لذا فشل
// التطبيق الآلي بـ reason:table_missing (صادق وموثّق)، ويبقى
// اللصق اليدوي مرة واحدة من محرر القوالب في الداشبورد.
//
// هذه الصفحة تجعل الخطوة اليدوية أبسط ما يمكن:
//   1. زر «نسخ كود القالب» (clipboard + nonce من الـmiddleware)
//   2. الخطوات الثلاث بالضبط داخل داشبورد Supabase
//   3. معاينة مرئية لشكل الإيميل النهائي
// لا سكربتات خارجية ولا بيانات مستخدمين — HTML ثابت + زر واحد.
// ============================================================

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function GET(req: NextRequest) {
  const nonce = req.headers.get('x-nonce') || ''

  // معاينة: محتوى <body> فقط (بدون غلاف المستند) داخل حاوية محايدة
  const bodyMatch = RECOVERY_EMAIL_HTML.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  const previewBody = bodyMatch ? bodyMatch[1] : RECOVERY_EMAIL_HTML

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>قالب بريد إعادة التعيين — أوج</title>
<style>
  body{margin:0;background:#070B14;color:#F2F5F7;font-family:Tahoma,'Segoe UI',Arial,sans-serif;direction:rtl;}
  .wrap{max-width:720px;margin:0 auto;padding:24px 14px 60px;}
  .logo{display:inline-block;background:#1B342B;border:1px solid #2A4A3E;border-radius:14px;padding:12px 20px;margin-bottom:18px;}
  .logo b{color:#D6FF3D;font-size:20px;letter-spacing:0.5px;}
  .logo span{display:block;color:#C5F26E;font-size:9px;letter-spacing:2px;direction:ltr;}
  h1{font-size:19px;margin:0 0 8px;}
  .sub{color:#9FB0C0;font-size:13px;line-height:1.9;margin:0 0 22px;}
  .card{background:#0D131F;border:1px solid #1E2A3A;border-radius:16px;padding:20px 18px;margin-bottom:16px;}
  .card h2{font-size:15px;margin:0 0 10px;color:#C5F26E;}
  .card p,.card li{color:#9FB0C0;font-size:13px;line-height:2;margin:0;}
  .card ol{margin:0;padding-inline-start:20px;}
  .card b{color:#F2F5F7;}
  .step-num{display:inline-block;background:#D6FF3D;color:#0B1015;border-radius:8px;font-weight:bold;padding:0 9px;margin-inline-end:6px;}
  .copy-btn{display:block;width:100%;background:#D6FF3D;color:#0B1015;border:none;border-radius:12px;padding:16px;font-size:16px;font-weight:bold;font-family:inherit;cursor:pointer;margin:6px 0 10px;}
  .copy-btn:active{transform:scale(0.99);}
  .copy-ok{color:#C5F26E;text-align:center;font-size:13px;height:20px;margin:0 0 14px;}
  textarea{width:100%;box-sizing:border-box;height:170px;background:#0A0F18;color:#C5F26E;border:1px solid #1E2A3A;border-radius:12px;padding:12px;font-family:monospace;font-size:11px;direction:ltr;text-align:left;resize:vertical;}
  .hint{color:#68788A;font-size:11px;line-height:1.8;margin:8px 0 0;}
  .preview-label{color:#68788A;font-size:11px;margin:0 0 8px;}
  .preview{background:#070B14;border:1px dashed #1E2A3A;border-radius:14px;padding:10px;overflow:auto;}
  .warn{background:#231b10;border:1px solid #4a3a1a;border-radius:12px;padding:12px 14px;color:#d9c07a;font-size:12px;line-height:1.9;}
</style>
</head>
<body>
<div class="wrap">
  <div class="logo"><b>أوج</b><span>AWJ.LIFE</span></div>
  <h1>قالب بريد «إعادة تعيين كلمة المرور»</h1>
  <p class="sub">جاهز للنسخ واللصق في Supabase — مرة واحدة فقط، وبعدها كل رسائل استعادة كلمة المرور
  هتظهر بهوية أوج (الموضوع: «${escapeHtml(RECOVERY_EMAIL_SUBJECT)}»). الرابط الحي
  <b>{{ .ConfirmationURL }}</b> محفوظ كما هو — تدفق إعادة التعيين نفسه لن يتغير.</p>

  <div class="card">
    <h2>الخطوات (دقيقة واحدة)</h2>
    <ol>
      <li><span class="step-num">1</span>اضغط الزر الأخضر بالأسفل: <b>«نسخ كود القالب»</b>.</li>
      <li><span class="step-num">2</span>افتح <b>Supabase Dashboard</b> → مشروعك → من القائمة الجانبية
      <b>Authentication</b> → <b>Email Templates</b> → اختر <b>Reset Password</b>.</li>
      <li><span class="step-num">3</span>بدّل نوع المحتوى إلى <b>HTML</b>، امسح أي محتوى موجود،
      <b>الصق</b> الكود الذي نسخته، ثم اضغط <b>Save</b>. انتهى ✓</li>
    </ol>
  </div>

  <div class="card">
    <h2>كود القالب</h2>
    <button class="copy-btn" id="copyBtn">نسخ كود القالب</button>
    <p class="copy-ok" id="copyOk"></p>
    <textarea id="tplSrc" readonly spellcheck="false">${escapeHtml(RECOVERY_EMAIL_HTML)}</textarea>
    <p class="hint">لو الزر لم يعمل: اضغط داخل الصندوق ثم Ctrl+A (تحديد الكل) ثم Ctrl+C —
    وعلى الجوال: اضغط مطولًا داخل الصندوق ثم «تحديد الكل» ثم «نسخ».</p>
  </div>

  <div class="card">
    <p class="preview-label">معاينة — هكذا ستظهر الرسالة في بريد المستخدم:</p>
    <div class="preview">${previewBody}</div>
  </div>

  <div class="warn">ملاحظة: بعد الحفظ جرّب «نسيت كلمة المرور؟» من صفحة الدخول وستصلك الرسالة بالشكل الجديد.
  الرسائل على خطة Supabase المجانية محدودة العدد في الساعة — لو لم تصلك الرسالة فورًا انتظر قليلًا ثم أعد المحاولة.</div>
</div>
${nonce ? `<script nonce="${escapeHtml(nonce)}">
(function(){
  var btn=document.getElementById('copyBtn'),ok=document.getElementById('copyOk'),src=document.getElementById('tplSrc');
  btn.addEventListener('click',function(){
    var done=function(){ok.textContent='تم النسخ ✓ — الآن الصقه في Supabase (الخطوة 2 و3)';};
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(src.value).then(done).catch(fallback);}
    else fallback();
    function fallback(){src.focus();src.select();try{document.execCommand('copy');done();}catch(e){ok.textContent='النسخ التلقائي فشل — حدّد يدويًا (Ctrl+A ثم Ctrl+C)';}}
  });
})();
</script>` : ''}
</body>
</html>`

  return new NextResponse(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
