#!/usr/bin/env bash
# ============================================================
# e2e-usage-run.sh — orchestrates the Phase-4 usage-limits E2E:
#   1. start usage-mock (port 5998)
#   2. build + start the Next app against the mock (port 3100)
#   3. run scripts/e2e-usage-limits.ts driver
#   4. cleanup
# ============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MOCK_PORT=5998
APP_PORT=3100
LOG_DIR="$ROOT/scripts"
mkdir -p "$LOG_DIR"

echo "── [1/4] usage-mock on :$MOCK_PORT ──"
bun scripts/e2e-usage-mock.ts > "$LOG_DIR/usage-mock.log" 2>&1 &
MOCK_PID=$!
sleep 1.5
TOKEN=$(grep -o 'access token: .*' "$LOG_DIR/usage-mock.log" | head -1 | sed 's/access token: //')
if [ -z "${TOKEN:-}" ]; then
  echo "❌ mock did not print a token"; cat "$LOG_DIR/usage-mock.log"; kill $MOCK_PID 2>/dev/null; exit 1
fi
echo "token: ${TOKEN:0:32}…"

echo "── [2/4] build app against mock ──"
export NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:$MOCK_PORT"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="test-anon-key-0123456789abcdef"
export SUPABASE_SERVICE_ROLE_KEY="test-service-role-key-0123456789abcdef"
bun run build > "$LOG_DIR/usage-build.log" 2>&1
if [ $? -ne 0 ]; then
  echo "❌ build failed"; tail -30 "$LOG_DIR/usage-build.log"; kill $MOCK_PID 2>/dev/null; exit 1
fi

echo "── [3/4] start app on :$APP_PORT ──"
PORT=$APP_PORT bun run start > "$LOG_DIR/usage-app.log" 2>&1 &
APP_PID=$!
for i in $(seq 1 30); do
  sleep 1
  if curl -s -o /dev/null "http://127.0.0.1:$APP_PORT/api/manifest"; then break; fi
done
if ! curl -s -o /dev/null "http://127.0.0.1:$APP_PORT/api/manifest"; then
  echo "❌ app did not start"; tail -30 "$LOG_DIR/usage-app.log"
  kill $APP_PID $MOCK_PID 2>/dev/null; exit 1
fi

echo "── [4/4] run driver ──"
APP="http://127.0.0.1:$APP_PORT" E2E_TOKEN="$TOKEN" bun scripts/e2e-usage-limits.ts
RESULT=$?

kill $APP_PID $MOCK_PID 2>/dev/null
wait $APP_PID $MOCK_PID 2>/dev/null
if [ $RESULT -eq 0 ]; then
  echo "✅ e2e-usage-run: DONE"
else
  echo "❌ e2e-usage-run: FAILED"
fi
exit $RESULT
