#!/bin/bash
# E2E test — خادم أوج MCP v3.1 (82 أداة — كل الأقسام + المراجعات ونقاط الخبرة) ضد Mock بالمخطط الإنتاجي الحقيقي
# التشغيل (من جذر المستودع):
#   node tests/mock_supabase.js &
#   SUPABASE_URL=http://localhost:8787 SUPABASE_SERVICE_ROLE_KEY=test-service-key \
#     MCP_AUTHORIZE_PAGE_URL=http://localhost:9999/authorize PORT=8000 \
#     deno run -A supabase/functions/mcp/index.ts &
#   bash tests/test_mcp_local.sh
# ملاحظة الحدود: 30 طلبًا/د إجماليًا و10 كتابات/د — لذلك توجد فترات راحة بين الدفعات.
set -u
FUNC=http://localhost:8000
API_KEY="rise_test_key_123"
PASS=0; FAIL=0

check() { # name, expected_substring, actual
  if echo "$3" | grep -q "$2"; then PASS=$((PASS+1)); echo "✔ $1";
  else FAIL=$((FAIL+1)); echo "✘ $1 — expected '$2' got: $(echo "$3" | head -c 250)"; fi
}

RPC() { # token, body
  curl -s -m 20 -X POST $FUNC/ -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" -H "Authorization: Bearer $1" -d "$2"
}
TOOL() { # token, id, tool, args
  RPC "$1" "{\"jsonrpc\":\"2.0\",\"id\":$2,\"method\":\"tools/call\",\"params\":{\"name\":\"$3\",\"arguments\":$4}}"
}

echo "== A) نقاط الدخول والاكتشاف =="
R=$(curl -s -m 10 $FUNC/)
check "GET الجذر -32000" "تدعم POST" "$R"
R=$(curl -s -m 10 -o /dev/null -w '%{http_code}' -X OPTIONS $FUNC -H "Origin: https://chatgpt.com" -H "Access-Control-Request-Method: POST")
check "CORS preflight" "204" "$R"
R=$(curl -s -m 10 "$FUNC/.well-known/oauth-authorization-server")
check "discovery: issuer" '"issuer"' "$R"
check "discovery: authorize endpoint" '"authorization_endpoint"' "$R"
R=$(curl -s -m 10 "$FUNC/.well-known/oauth-protected-resource")
check "protected resource" "authorization_servers" "$R"
R=$(curl -s -m 10 -X POST "$FUNC/register" -H "Content-Type: application/json" -d '{"client_name":"e2e-test","redirect_uris":["https://chatgpt.com/connector/oauth/TEST"]}')
check "DCR client_id" "awj-7b7f7ba5e0502c4f68f7" "$R"

echo "== B) OAuth + PKCE كامل =="
VERIFIER=$(python3 -c "import secrets; print(secrets.token_urlsafe(60)[:43])")
CHALLENGE=$(printf '%s' "$VERIFIER" | openssl dgst -sha256 -binary | basenc --base64url | tr -d '=')
REDIRECT="https://chatgpt.com/connector/oauth/TEST"
AUTHQ="response_type=code&client_id=awj-7b7f7ba5e0502c4f68f7&redirect_uri=${REDIRECT}&state=st1&code_challenge=${CHALLENGE}&code_challenge_method=S256&scope=mcp:tools"

R=$(curl -s -m 10 -o /dev/null -w '%{redirect_url}' "$FUNC?oauth=authorize&${AUTHQ}")
check "بدون مفتاح → صفحة الموقع" "localhost:9999/authorize" "$R"
R=$(curl -s -m 10 -o /dev/null -w '%{redirect_url}' "$FUNC?oauth=authorize&${AUTHQ}&api_key=rise_wrong_key")
check "مفتاح خاطئ" "error=invalid_key" "$R"
LOC=$(curl -s -m 10 -o /dev/null -w '%{redirect_url}' "$FUNC?oauth=authorize&${AUTHQ}&api_key=$API_KEY")
check "مفتاح صالح → code" "code=" "$LOC"
CODE=$(echo "$LOC" | sed -n 's/.*code=\([^&]*\).*/\1/p')

R=$(curl -s -m 10 -X POST "$FUNC?oauth=token" -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=$CODE&code_verifier=$VERIFIER&client_id=awj-7b7f7ba5e0502c4f68f7&redirect_uri=${REDIRECT}")
check "access_token صدر" '"access_token"' "$R"
ACCESS=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])")
REFRESH=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin)['refresh_token'])")

R=$(curl -s -m 10 -X POST "$FUNC?oauth=token" -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=$CODE&code_verifier=$VERIFIER&client_id=awj-7b7f7ba5e0502c4f68f7&redirect_uri=${REDIRECT}")
check "code أحادي الاستخدام" "already been used" "$R"
R=$(curl -s -m 10 -X POST "$FUNC?oauth=token" -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token&refresh_token=$REFRESH&client_id=awj-7b7f7ba5e0502c4f68f7")
check "refresh_token يعمل" '"access_token"' "$R"
ACCESS=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])")

echo "== C) المصادقة =="
R=$(RPC "$ACCESS" '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}')
check "initialize برمز OAuth" '"serverInfo"' "$R"
R=$(RPC "$API_KEY" '{"jsonrpc":"2.0","id":2,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}')
check "initialize بمفتاح rise_" '"serverInfo"' "$R"
R=$(RPC "rise_fake" '{"jsonrpc":"2.0","id":3,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}')
check "مفتاح وهمي مرفوض" "غير صالح أو ملغى" "$R"

echo "== D) الأدوات: العدد والقراءات =="
R=$(RPC "$ACCESS" '{"jsonrpc":"2.0","id":4,"method":"tools/list"}')
N=$(echo "$R" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['result']['tools']))")
check "عدد الأدوات = 82" "82" "$N"
R=$(TOOL "$ACCESS" 5 list_tasks '{"status":"todo","limit":20}')
check "list_tasks" "تسليم التقرير" "$R"
if echo "$R" | grep -q "مهمة سارة"; then FAIL=$((FAIL+1)); echo "✘ عزل المستخدمين فشل"; else PASS=$((PASS+1)); echo "✔ list_tasks يعزل المستخدمين"; fi
R=$(TOOL "$ACCESS" 6 get_task '{"taskId":"t-1"}')
check "get_task + subtasks" "جمع البيانات" "$R"
R=$(TOOL "$ACCESS" 7 get_task '{"taskId":"t-2"}')
check "مهمة مستخدم آخر مرفوضة" "غير موجودة أو لا تملكها" "$R"
R=$(TOOL "$ACCESS" 8 list_projects '{}')
check "list_projects" "مشروع الإطلاق" "$R"
R=$(TOOL "$ACCESS" 9 list_goals '{}')
check "list_goals" "قراءة 12 كتابًا" "$R"
R=$(TOOL "$ACCESS" 10 get_goal '{"goalId":"g-1"}')
check "get_goal + milestones" "الكتاب الأول" "$R"
R=$(TOOL "$ACCESS" 11 list_habits '{}')
check "list_habits + streak" "شرب 8 أكواب" "$R"
R=$(TOOL "$ACCESS" 12 get_habit '{"habitId":"h-1"}')
check "get_habit" "سلسلة" "$R"
R=$(TOOL "$ACCESS" 13 get_today_plan '{}')
check "get_today_plan" "مراجعة اليوميات" "$R"
R=$(TOOL "$ACCESS" 14 get_productivity_score '{"days":7}')
check "get_productivity_score" "متوسط" "$R"
R=$(TOOL "$ACCESS" 15 list_journal_entries '{"limit":10}')
check "list_journal_entries" "يوم جيد" "$R"
R=$(TOOL "$ACCESS" 16 get_journal_entry '{}')
check "get_journal_entry (اليوم)" "شكرًا على الصحة" "$R"

echo "== E) كتابات الدفعة الأولى (حد 10/د) =="
R=$(TOOL "$ACCESS" 17 create_journal_entry '{"content":"نص جديد يوضع مكان القديم","mood":5}')
check "حماية الاستبدال ترفض" "لن أستبدله" "$R"
R=$(TOOL "$ACCESS" 18 create_journal_entry '{"content":"يومية محدثة عبر MCP","mood":5,"overwrite":true}')
check "journal overwrite" "حُدّث مدخل يوميات" "$R"
R=$(TOOL "$ACCESS" 19 get_journal_entry '{}')
check "اليومية تحدثت فعلًا" "يومية محدثة" "$R"
R=$(TOOL "$ACCESS" 20 create_task '{"title":"مهمة من الاختبار","priority":"high","dueDate":"2026-09-25","description":"وصف اختبار"}')
check "create_task (RPC)" "أُنشئت المهمة" "$R"
R=$(TOOL "$ACCESS" 21 list_tasks '{"status":"todo","limit":50}')
check "المهمة الجديدة ظهرت" "مهمة من الاختبار" "$R"
TID=$(echo "$R" | python3 -c "
import json,sys
r=json.load(sys.stdin)
sc=r['result']['structuredContent']
t=[x for x in sc['tasks'] if x['title']=='مهمة من الاختبار'][0]
print(t['id'])")
R=$(TOOL "$ACCESS" 22 update_task "{\"taskId\":\"$TID\",\"priority\":\"urgent\",\"description\":\"وصف محدث\"}")
check "update_task (RPC)" "urgent" "$R"
R=$(TOOL "$ACCESS" 23 complete_task "{\"taskId\":\"$TID\"}")
check "complete_task" "أُنجزت المهمة" "$R"
R=$(TOOL "$ACCESS" 24 reopen_task "{\"taskId\":\"$TID\"}")
check "reopen_task" "todo" "$R"
R=$(TOOL "$ACCESS" 25 delete_task "{\"taskId\":\"$TID\"}")
check "delete بلا confirm يرفض" "confirm:true" "$R"
R=$(TOOL "$ACCESS" 26 delete_task "{\"taskId\":\"$TID\",\"confirm\":true}")
check "delete_task نهائي" "حُذفت المهمة" "$R"
R=$(TOOL "$ACCESS" 27 create_goal '{"title":"هدف اختبار MCP","deadline":"2026-12-01","milestones":[{"title":"المعلم الأول"},{"title":"المعلم الثاني"}]}')
check "create_goal (RPC)" "أُنشئ الهدف" "$R"
GID=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['structuredContent']['goal']['id'])")
R=$(TOOL "$ACCESS" 28 get_goal "{\"goalId\":\"$GID\"}")
check "المعالم أُنشئت" "المعلم الأول" "$R"
R=$(TOOL "$ACCESS" 29 complete_goal "{\"goalId\":\"$GID\"}")
check "complete_goal" "completed" "$R"

echo "— استراحة 65 ثانية (نافذة حدود المعدل) —"
sleep 65

echo "== F) قراءات الدفعة الثانية =="
R=$(TOOL "$ACCESS" 31 list_notifications '{}')
check "list_notifications" "مرحبًا بك في أوج" "$R"
R=$(TOOL "$ACCESS" 32 unread_notifications_count '{}')
check "unread_count = 1" "1 إشعار غير مقروء" "$R"
R=$(TOOL "$ACCESS" 33 community_feed '{}')
check "community_feed" "نصائح للإنتاجية" "$R"
R=$(TOOL "$ACCESS" 34 get_community_post '{"postId":"p-1"}')
check "get_community_post + comments" "جربتها وفادت" "$R"
R=$(TOOL "$ACCESS" 35 get_profile '{}')
check "get_profile" "أحمد" "$R"
R=$(TOOL "$ACCESS" 36 get_subscription '{}')
check "get_subscription" "max" "$R"
R=$(TOOL "$ACCESS" 37 get_usage_today '{}')
check "get_usage_today" "mcp_tools" "$R"
R=$(TOOL "$ACCESS" 38 search_everything '{"query":"تقرير"}')
check "search_everything" "تسليم التقرير" "$R"

echo "== G) كتابات الدفعة الثانية =="
R=$(TOOL "$ACCESS" 39 mark_notification_read '{"notificationId":"nt-1"}')
check "mark_notification_read" "كمقروء" "$R"
R=$(TOOL "$ACCESS" 40 mark_all_notifications_read '{}')
check "mark_all_read" "وُسمت كل" "$R"
R=$(TOOL "$ACCESS" 41 create_community_post '{"title":"منشور اختبار من MCP","body":"هذا منشور تجريبي نشر عبر خادم MCP."}')
check "create_community_post" "نُشر" "$R"
PID=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['structuredContent']['post']['id'])")
R=$(TOOL "$ACCESS" 42 comment_community_post "{\"postId\":\"$PID\",\"body\":\"تعليق اختبار\"}")
check "comment_community_post" "أُضيف تعليقك" "$R"
R=$(TOOL "$ACCESS" 43 toggle_post_like "{\"postId\":\"$PID\"}")
check "like: تشغيل" "أُعجبت" "$R"
R=$(TOOL "$ACCESS" 44 toggle_post_like "{\"postId\":\"$PID\"}")
check "like: إيقاف" "أُلغي إعجابك" "$R"
R=$(TOOL "$ACCESS" 45 report_community_post "{\"postId\":\"$PID\",\"reason\":\"spam\"}")
check "report_community_post" "سُجّل بلاغك" "$R"
R=$(TOOL "$ACCESS" 46 update_profile '{"name":"أحمد المحديث"}')
check "update_profile" "حُدّث ملفك" "$R"
R=$(TOOL "$ACCESS" 47 create_habit '{"name":"عادة اختبار","frequency":"daily","targetCount":1}')
check "create_habit" "أُنشئت العادة" "$R"
HID=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['structuredContent']['habit']['id'])")
R=$(TOOL "$ACCESS" 48 check_in_habit "{\"habitId\":\"h-1\"}")
check "check_in_habit" "سُجّلت" "$R"

echo ""
echo "النتيجة حتى الآن: $PASS ناجح / $FAIL فاشل"

echo "— استراحة 65 ثانية (نافذة حدود المعدل) قبل أقسام v3.0 —"
sleep 65

echo "== H) v3.0 قراءات كل الأقسام (القراءة/التعلم/المعرفة/المالية/الصحة/التركيز/الشغل/الإنجازات/الإعدادات) =="
R=$(TOOL "$ACCESS" 51 list_books '{"status":"reading"}')
check "list_books" "العادات الذرية" "$R"
R=$(TOOL "$ACCESS" 52 get_book '{"bookId":"b-1"}')
check "get_book + الاقتباس المفضل" "التغيير يبدأ صغيراً" "$R"
R=$(TOOL "$ACCESS" 53 reading_summary '{}')
check "reading_summary" "قرأت 1 عنصرًا كاملًا" "$R"
R=$(TOOL "$ACCESS" 54 list_learning '{}')
check "list_learning: الهدف" "إتقان الإنجليزية" "$R"
R2=$(TOOL "$ACCESS" 55 list_learning '{}')
check "list_learning: الدورة + الدقائق" "دورة Deno" "$R2"
R=$(TOOL "$ACCESS" 56 list_knowledge '{}')
check "list_knowledge (الدماغ فقط)" "فكرة تطبيق لتتبع القراءة" "$R"
if echo "$R" | grep -q "cfg مالية"; then FAIL=$((FAIL+1)); echo "✘ عزل BRAIN_TYPES فشل"; else PASS=$((PASS+1)); echo "✔ عزل BRAIN_TYPES عن صفوف وحدات أخرى"; fi
if echo "$R" | grep -q "learning-goal"; then FAIL=$((FAIL+1)); echo "✘ صفوف التعلم تسربت للدماغ"; else PASS=$((PASS+1)); echo "✔ صفوف التعلم معزولة عن الدماغ"; fi
R=$(TOOL "$ACCESS" 57 list_finance_records '{"type":"expense"}')
check "list_finance_records مصروف" "مشتريات البقالة" "$R"
R=$(TOOL "$ACCESS" 58 finance_summary '{"month":"2026-09"}')
check "finance_summary الدخل" "15000" "$R"
R2=$(TOOL "$ACCESS" 59 finance_summary '{"month":"2026-09"}')
check "finance_summary الادخار" "2000" "$R2"
R=$(TOOL "$ACCESS" 60 get_health_log '{}')
check "get_health_log اليوم" "8000" "$R"
R=$(TOOL "$ACCESS" 61 list_health_logs '{"days":7}')
check "list_health_logs المتوسط" "متوسط" "$R"
R=$(TOOL "$ACCESS" 62 get_morning_log '{}')
check "get_morning_log" "80" "$R"
R=$(TOOL "$ACCESS" 63 list_focus_sessions '{"days":7}')
check "list_focus_sessions" "48" "$R"
R=$(TOOL "$ACCESS" 64 list_work_sessions '{}')
check "list_work_sessions" "جلسة برمجة" "$R"
R=$(TOOL "$ACCESS" 65 list_achievements '{}')
check "list_achievements" "قارئ نَهِم" "$R"
R=$(TOOL "$ACCESS" 66 get_settings '{}')
check "get_settings" "06:00" "$R"
R=$(TOOL "$ACCESS" 67 search_everything '{"query":"الذرية"}')
check "search_everything يشمل الكتب" "العادات الذرية" "$R"
R=$(TOOL "$ACCESS" 68 search_everything '{"query":"راتب"}')
check "search_everything يشمل المالية" "راتب سبتمبر" "$R"

echo "— استراحة 65 ثانية (حدود الكتابة 10/د) —"
sleep 65

echo "== I) v3.0 كتابات: القراءة والتعلم =="
R=$(TOOL "$ACCESS" 70 create_book '{"title":"كتاب اختبار MCP","author":"مؤلف تجريبي","totalPages":100,"currentPage":50}')
check "create_book (تقدم تلقائي 50%)" "أُضيف «كتاب اختبار MCP»" "$R"
BID=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['structuredContent']['book']['id'])")
R=$(TOOL "$ACCESS" 71 update_book "{\"bookId\":\"$BID\",\"currentPage\":100}")
check "update_book تقدم تلقائي 100%" "100" "$R"
R=$(TOOL "$ACCESS" 72 update_book "{\"bookId\":\"$BID\",\"status\":\"completed\"}")
check "update_book إتمام يختم التاريخ" "completed" "$R"
R=$(TOOL "$ACCESS" 74 delete_book '{"bookId":"غير-موجود","confirm":true}')
check "delete_book لكتاب غير موجود يُرفض" "غير موجود أو لا تملكه" "$R"
R=$(TOOL "$ACCESS" 75 create_learning_goal '{"title":"هدف تعلم اختبار","description":"وصف تجريبي"}')
check "create_learning_goal" "أُنشئ هدف التعلم" "$R"
LID=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['structuredContent']['goal']['id'])")
R=$(TOOL "$ACCESS" 76 update_learning_progress "{\"itemId\":\"$LID\",\"progress\":100}")
check "update_learning_progress → completed" "completed" "$R"
R=$(TOOL "$ACCESS" 77 create_learning_course '{"name":"دورة اختبار","platform":"YouTube"}')
check "create_learning_course" "أُضيفت الدورة" "$R"
R=$(TOOL "$ACCESS" 78 create_learning_skill '{"name":"مهارة اختبار","level":2}')
check "create_learning_skill" "أُضيفت المهارة" "$R"
R=$(TOOL "$ACCESS" 79 log_learning_session '{"content":"جلسة تعلم اختبار","minutes":30}')
check "log_learning_session" "سُجلت جلسة تعلم" "$R"
R=$(TOOL "$ACCESS" 80 update_learning_progress "{\"itemId\":\"k-5\",\"progress\":50}")
check "رفض تحديث تقدم لعنصر دماغ" "ليس هدفًا أو دورة" "$R"

echo "— استراحة 65 ثانية (حدود الكتابة 10/د) —"
sleep 65

echo "== J) v3.0 كتابات: المعرفة والمالية والصحة والصباح والتركيز والشغل والمخطط =="
R=$(TOOL "$ACCESS" 81 create_knowledge_note '{"title":"ملاحظة اختبار","content":"محتوى تجريبي","folder":"أفكار","type":"idea"}')
check "create_knowledge_note" "حُفظ «ملاحظة اختبار»" "$R"
NID=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['structuredContent']['item']['id'])")
R=$(TOOL "$ACCESS" 82 update_knowledge_note "{\"itemId\":\"$NID\",\"isFavorite\":true}")
check "update_knowledge_note مفضلة" "حُدّث" "$R"
R=$(TOOL "$ACCESS" 83 create_finance_record '{"type":"مصروف","amount":75.5,"description":"مواصلات اختبار","category":"مواصلات"}')
check "create_finance_record بالعربي → expense" "سُجل مصروف" "$R"
FID=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['structuredContent']['record']['id'])")
R=$(TOOL "$ACCESS" 84 delete_finance_record "{\"recordId\":\"$FID\",\"confirm\":true}")
check "delete_finance_record" "حُذف السجل" "$R"
R=$(TOOL "$ACCESS" 85 log_health '{"waterGlasses":8,"steps":9000}')
check "log_health دمج جزئي" "حُفظ سجل صحة" "$R"
R=$(TOOL "$ACCESS" 86 get_health_log '{}')
check "الدمج حدّث الماء إلى 8" "8 كوب" "$R"
R=$(TOOL "$ACCESS" 87 log_morning '{"score":90,"completedItems":["wake","water","exercise","journal"]}')
check "log_morning upsert" "سُجل روتين الصباح" "$R"
R=$(TOOL "$ACCESS" 88 get_morning_log '{}')
check "الصباح حدّث (90 + 4 خطوات)" "4/5" "$R"
R=$(TOOL "$ACCESS" 89 log_focus_session '{"duration":25,"actualMin":23,"notes":"جلسة اختبار"}')
check "log_focus_session" "سُجلت جلسة تركيز" "$R"
R=$(TOOL "$ACCESS" 90 log_work_session '{"plannedMin":120,"activeMin":100,"title":"جلسة اختبار","qualityScore":90}')
check "log_work_session" "سُجلت جلسة شغل" "$R"
R=$(TOOL "$ACCESS" 91 create_planner_item '{"title":"بند اختبار","section":"evening","time":"19:00"}')
check "create_planner_item" "أُضيف «بند اختبار»" "$R"
PID2=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['structuredContent']['item']['id'])")
R=$(TOOL "$ACCESS" 92 update_planner_item "{\"itemId\":\"$PID2\",\"completed\":true}")
check "update_planner_item إنجاز" "منجز" "$R"

echo "— استراحة 65 ثانية (حدود الكتابة 10/د) —"
sleep 65

echo "== K) v3.0 كتابات: المشاريع والإعدادات والحمايات =="
R=$(TOOL "$ACCESS" 93 create_project '{"name":"مشروع اختبار MCP","description":"وصف","color":"#1D4ED8"}')
check "create_project" "أُنشئ المشروع" "$R"
PRID=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['structuredContent']['project']['id'])")
R=$(TOOL "$ACCESS" 94 update_project "{\"projectId\":\"$PRID\",\"progress\":100,\"status\":\"completed\"}")
check "update_project" "حُدّث المشروع" "$R"
R=$(TOOL "$ACCESS" 95 update_settings '{"wakeUpTime":"05:30","dailyWaterGoal":10}')
check "update_settings" "حُدّثت الإعدادات" "$R"
R=$(TOOL "$ACCESS" 96 get_settings '{}')
check "الإعدادات حدّثت فعلاً" "05:30" "$R"
R=$(TOOL "$ACCESS" 97 delete_planner_item "{\"itemId\":\"$PID2\",\"confirm\":true}")
check "delete_planner_item" "حُذف «بند اختبار»" "$R"
R=$(TOOL "$ACCESS" 98 log_health '{}')
check "log_health فارغ يُرفض" "مطلوب قياس واحد" "$R"
R=$(TOOL "$ACCESS" 99 create_book '{"title":"س","rating":9}')
check "فحص نطاق rating" "rating: عدد صحيح بين 0 و5" "$R"
R=$(TOOL "$ACCESS" 100 create_finance_record '{"type":"expense","amount":-5,"description":"سالب"}')
check "رفض مبلغ سالب" "رقم موجب" "$R"

echo "— استراحة 65 ثانية (حدود الكتابة 10/د) —"
sleep 65

echo "== L) v3.1 المراجعات ونقاط الخبرة =="
R=$(TOOL "$ACCESS" 101 get_weekly_review '{}')
check "get_weekly_review: مهمة مكتملة" "1 مهمة مكتملة" "$R"
check "get_weekly_review: تركيز 113 دقيقة (48+42+23 من القسم J)" "1.9 ساعة تركيز" "$R"
check "get_weekly_review: تسجيلات عادات (اليوم+أمس+2+3)" "4 تسجيل" "$R"
check "get_weekly_review: متوسط الدرجة" "متوسط الدرجة" "$R"
R2=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin)['result']['structuredContent']; print(len(d['byDay']))")
check "get_weekly_review: 7 أيام" "7" "$R2"
R=$(TOOL "$ACCESS" 102 get_weekly_review '{"days":15}')
check "get_weekly_review: رفض أيام >14" "days: عدد صحيح بين 3 و14" "$R"
R=$(TOOL "$ACCESS" 103 get_weekly_review '{"end_date":"2026-13-45"}')
check "get_weekly_review: رفض تاريخ سيئ" "end_date: التاريخ يجب أن يكون YYYY-MM-DD صالحًا تقويميًا" "$R"
R=$(TOOL "$ACCESS" 104 get_monthly_review '{"days":30}')
check "get_monthly_review: الملخص" "انتظام عادات" "$R"
R2=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin)['result']['structuredContent']; print(len(d['weeks']))")
check "get_monthly_review: 5 أسابيع (30 يومًا)" "5" "$R2"
R2=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin)['result']['structuredContent']; print('yes' if d.get('bestDay') else 'no')")
check "get_monthly_review: أفضل يوم موجود" "yes" "$R2"
R=$(TOOL "$ACCESS" 105 get_monthly_review '{"days":10}')
check "get_monthly_review: رفض أيام <14" "days: عدد صحيح بين 14 و31" "$R"
R=$(TOOL "$ACCESS" 106 list_xp_awards '{}')
check "list_xp_awards: إجمالي 85 نقطة (10+15+20+40)" "85" "$R"
check "list_xp_awards: 4 مكافآت (عزل u-222)" "4 مكافأة" "$R"
check "list_xp_awards: ترجمة المصدر (روتين الصباح)" "روتين الصباح كامل" "$R"
R=$(TOOL "$ACCESS" 107 list_xp_awards '{"limit":2}')
R2=$(echo "$R" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['result']['structuredContent']['recent']))")
check "list_xp_awards: limit=2" "2" "$R2"
check "list_xp_awards: الإجمالي لا يتأثر بـ limit" "85" "$R"
R=$(TOOL "$ACCESS" 108 list_xp_awards '{"limit":0}')
check "list_xp_awards: رفض limit صفر" "limit: عدد صحيح بين 1 و100" "$R"
R=$(TOOL "rise_other_user" 109 list_xp_awards '{}')
check "عزل xp_awards: سارة 25 نقطة فقط" "25" "$R"

echo ""
echo "النتيجة: $PASS ناجح / $FAIL فاشل"
[ $FAIL -eq 0 ] && echo "✅ كل الاختبارات ناجحة" || echo "❌ هناك إخفاقات"
