// ============================================================
// recovery-template.ts — قالب إيميل «إعادة تعيين كلمة المرور»
// (أوج | awj.life) — نسخة برمجية من
// docs/phase-3/recovery-email-template.html
//
// يستخدمه مسار /api/rise/email-template/ensure لتطبيق القالب
// على Supabase (auth.email_templates → type='recovery')
// تلقائيًا عبر Vercel Cron يوميًا — بلا أي تدخل يدوي من المالك
// (طلب المالك: «زبط الايميل لاني مش فاهم» — التاب أُزيل من
// لوحة التحكم والقالب بيتطبّق لوحده).
//
// متغيرات Supabase الحيوية (لا تغيّرها — تدفق PKCE يعتمد عليها):
//   {{ .ConfirmationURL }}  رابط إعادة التعيين
//   {{ .Email }}            بريد المستخدم
// تصميم email-safe: جداول + CSS مضمّن + bgcolor fallback —
// يعمل في Gmail / Outlook / Apple Mail / تطبيقات الجوال. RTL.
// ============================================================

export const RECOVERY_EMAIL_SUBJECT = 'إعادة تعيين كلمة المرور — أوج'

export const RECOVERY_EMAIL_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <title>إعادة تعيين كلمة المرور — أوج</title>
</head>
<body style="margin:0;padding:0;background-color:#070B14;direction:rtl;font-family:Tahoma,'Segoe UI',Arial,sans-serif;">

  <!-- Preheader: يظهر بجوار العنوان في قائمة البريد -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    رابط إعادة تعيين كلمة مرور أوج — صالح لمدة ساعة واحدة
  </div>

  <!-- الخلفية -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#070B14" style="background-color:#070B14;">
    <tr>
      <td align="center" style="padding:28px 12px 40px 12px;">

        <!-- البطاقة الرئيسية 600px -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

          <!-- الشعار -->
          <tr>
            <td align="center" style="padding:0 0 20px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#1B342B" style="background-color:#1B342B;border-radius:14px;padding:14px 22px;border:1px solid #2A4A3E;">
                    <span style="font-size:22px;font-weight:bold;color:#D6FF3D;letter-spacing:0.5px;">أوج</span>
                    <span style="display:block;font-size:10px;color:#C5F26E;letter-spacing:2px;direction:ltr;">AWJ.LIFE</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- جسم البطاقة -->
          <tr>
            <td bgcolor="#0D131F" style="background-color:#0D131F;border:1px solid #1E2A3A;border-radius:16px;padding:32px 28px;">

              <!-- خط لمسة ليموني -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="44" bgcolor="#D6FF3D" style="background-color:#D6FF3D;height:4px;font-size:0;line-height:0;border-radius:2px;">&nbsp;</td>
                  <td style="height:4px;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>

              <h1 style="margin:22px 0 6px 0;font-size:20px;line-height:1.4;color:#F2F5F7;font-weight:bold;">
                إعادة تعيين كلمة المرور
              </h1>
              <p style="margin:0 0 18px 0;font-size:13px;line-height:1.9;color:#9FB0C0;">
                مرحبًا! وصلك هذا البريد لأن أحدهم طلب إعادة تعيين كلمة مرور حسابك
                <span style="color:#C5F26E;direction:ltr;unicode-bidi:embed;">{{ .Email }}</span>
                في أوج.
              </p>

              <!-- الزر الرئيسي -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding:6px 0 22px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td bgcolor="#D6FF3D" align="center" style="background-color:#D6FF3D;border-radius:10px;">
                          <a href="{{ .ConfirmationURL }}"
                             style="display:inline-block;padding:14px 38px;font-size:15px;font-weight:bold;color:#0B1015;text-decoration:none;border-radius:10px;font-family:Tahoma,'Segoe UI',Arial,sans-serif;">
                            إعادة تعيين كلمة المرور
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- ملاحظات -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td bgcolor="#122019" style="background-color:#122019;border:1px solid #2A4A3E;border-radius:12px;padding:14px 16px;">
                    <p style="margin:0 0 8px 0;font-size:12px;line-height:1.8;color:#C5F26E;font-weight:bold;">
                      قبل الضغط، تذكّر:
                    </p>
                    <p style="margin:0;font-size:12px;line-height:2;color:#9FB0C0;">
                      ⏱ الرابط صالح لمدة <b style="color:#F2F5F7;">ساعة واحدة</b> فقط.<br>
                      💻 افتح الرابط في <b style="color:#F2F5F7;">نفس المتصفح</b> الذي طلبت منه إعادة التعيين.<br>
                      🔒 بعد التعيين تنتهي جميع جلساتك في الأجهزة الأخرى.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:20px 0 0 0;font-size:12px;line-height:1.9;color:#9FB0C0;">
                إن لم تطلب ذلك بنفسك فتجاهل هذه الرسالة بأمان — كلمة مرورك الحالية لن تتغيّر،
                ويمكنك إبلاغنا إن تكررت الطلبات بشكل مريب.
              </p>

              <!-- فاصل -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-top:1px solid #1E2A3A;padding-top:18px;">
                    <p style="margin:0 0 14px 0;font-size:11px;line-height:1.8;color:#68788A;">
                      لا يعمل الزر؟ انسخ الرابط التالي والصقه في المتصفح (نفس المتصفح الذي طلبت منه):
                    </p>
                    <p style="margin:0;font-size:11px;line-height:1.7;color:#C5F26E;word-break:break-all;direction:ltr;text-align:left;">
                      <a href="{{ .ConfirmationURL }}" style="color:#C5F26E;text-decoration:none;">{{ .ConfirmationURL }}</a>
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- تذييل -->
          <tr>
            <td align="center" style="padding:20px 10px 0 10px;">
              <p style="margin:0 0 4px 0;font-size:11px;color:#68788A;">
                أوج — نظام حياتك اليومي في مكان واحد
              </p>
              <p style="margin:0;font-size:10px;color:#43515F;direction:ltr;">
                awj.life · هذه رسالة آلية من نظام المصادقة
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
