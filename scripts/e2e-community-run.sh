#!/usr/bin/env bash
# ============================================================
# e2e-community-run.sh — orchestrates the Phase-7 Community E2E:
#   1. start community-mock (PostgREST :5997)
#   2. build + start the Next app against the mock (:3103)
#   3. run scripts/e2e-community.ts driver (two users: A admin, B member)
#   4. cleanup
# ============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MOCK_PORT=5997
APP_PORT=3103
LOG_DIR="$ROOT/scripts"
mkdir -p "$LOG_DIR"

echo "── [1/4] community-mock on :$MOCK_PORT ──"
bun scripts/e2e-community-mock.ts > "$LOG_DIR/community-mock.log" 2>&1 &
MOCK_PID=$!
sleep 1.5
TOKEN_A=$(grep -o 'token A (admin): .*' "$LOG_DIR/community-mock.log" | head -1 | sed 's/token A (admin): //')
TOKEN_B=$(grep -o 'token B (member): .*' "$LOG_DIR/community-mock.log" | head -1 | sed 's/token B (member): //')
if [ -z "${TOKEN_A:-}" ] || [ -z "${TOKEN_B:-}" ]; then
  echo "❌ mock did not print tokens"; cat "$LOG_DIR/community-mock.log"; kill $MOCK_PID 2>/dev/null; exit 1
fi
echo "tokens: A=${TOKEN_A:0:24}… B=${TOKEN_B:0:24}…"

echo "── [2/4] build app against mock ──"
export NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:$MOCK_PORT"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="test-anon-key-0123456789abcdef"
export SUPABASE_SERVICE_ROLE_KEY="test-service-role-key-0123456789abcdef"
bun run build > "$LOG_DIR/community-build.log" 2>&1
if [ $? -ne 0 ]; then
  echo "❌ build failed"; tail -30 "$LOG_DIR/community-build.log"; kill $MOCK_PID 2>/dev/null; exit 1
fi

echo "── [3/4] start app on :$APP_PORT ──"
PORT=$APP_PORT bun run start > "$LOG_DIR/community-app.log" 2>&1 &
APP_PID=$!
for i in $(seq 1 30); do
  sleep 1
  if curl -s -o /dev/null "http://127.0.0.1:$APP_PORT/api/manifest"; then break; fi
done
if ! curl -s -o /dev/null "http://127.0.0.1:$APP_PORT/api/manifest"; then
  echo "❌ app did not start"; tail -30 "$LOG_DIR/community-app.log"
  kill $APP_PID $MOCK_PID 2>/dev/null; exit 1
fi

echo "── [4/4] run driver ──"
APP="http://127.0.0.1:$APP_PORT" MOCK="http://127.0.0.1:$MOCK_PORT" E2E_TOKEN_A="$TOKEN_A" E2E_TOKEN_B="$TOKEN_B" bun scripts/e2e-community.ts
STATUS=$?

kill $APP_PID $MOCK_PID 2>/dev/null
if [ $STATUS -eq 0 ]; then
  echo "✅ E2E COMMUNITY PASSED"
else
  echo "💥 E2E COMMUNITY FAILED"
  echo "── app log tail ──"; tail -20 "$LOG_DIR/community-app.log"
fi
exit $STATUS
