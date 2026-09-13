#!/bin/bash
# E2E test — خادم أوج MCP الموسّع (40 أداة) ضد Mock بالمخطط الإنتاجي الحقيقي
# التشغيل (من جذر المستودع):
#   node tests/mock_supabase.js &
#   SUPABASE_URL=http://localhost:8787 SUPABASE_SERVICE_ROLE_KEY=test-service-key \
#     MCP_AUTHORIZE_PAGE_URL=http://localhost:9999/authorize PORT=8000 \
#     deno run -A supabase/functions/mcp/index.ts &
#   bash tests/test_mcp_local.sh
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
check "عدد الأدوات = 40" "40" "$N"
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
echo "النتيجة: $PASS ناجح / $FAIL فاشل"
[ $FAIL -eq 0 ] && echo "✅ كل الاختبارات ناجحة" || echo "❌ هناك إخفاقات"
