# RiseOS — Worklog

(ملاحظة: البيئة أُعيد تهيئتها مرتين — يُلتزم هذا الملف في git من الآن حتى لا يضيع.)

---
Task ID: 17
Agent: Super Z (main)
Task: Production performance audit (17 scenarios, measured via agent-browser + performance.getEntriesByType("resource"))

Work Log:
- Measured 17 scenarios on https://rise-os-gamma.vercel.app/ (signup, login, dashboard, CRUD writes, idle polling)
- Produced report A–K; K = 5 request-reduction fixes

Stage Summary:
- Baseline: signup 10 API req, F5 11, habit complete 10, task complete 8, visible idle 32 req/hr
- Capacity: 800 medium users ≈ 80K req/day; Supabase egress 5GB/mo is the first bottleneck

---
Task ID: 18-a
Agent: Super Z (main)
Task: Implement the 5 request-reduction fixes (report section K) and retest

Work Log:
- Implemented & committed as d38bf63 "perf: cut API requests 40-55% via GET dedupe, micro-cache, network-first SW, auth dedup, smarter polling"
- Files: sw.js, login-page.tsx, notification-bell.tsx, reminder-engine.tsx, sidebar.tsx, api-fetch.ts, app-store.ts

Stage Summary:
- Local measured after: signup 10→4, F5 11→6, habit complete 10→5, task complete 8→5, visible idle 32→24 req/hr, hidden tab →0

---
Task ID: 18-b
Agent: Super Z (main)
Task: Check daily-progress & streak calculations (user report), fix bugs

Work Log:
- Fixed 4 calc bugs (commit 16e8a7b): dashboard streak bar hardcoded 0; calcStreak no yesterday-grace; booksCompleted/journalStreak hardcoded 0
- PRODUCTION VERIFIED 12/12 (script lost with env re-init; logic preserved in 19b script)

---
Task ID: 19
Agent: Super Z (main)
Task: 5 user-reported UX bugs (phantom retry error, morning revert, XP balance, books input, notification spam)

Work Log:
- Commits 044a229 + ddfed26; morning ?date= + sequencing; XP curve 1.15→1.35; books +10/+25/exact-page input; celebrate throttle + quiet hours
- BONUS: dashboard read camelCase xpToNextLevel from snake_case rows → stuck at 100; now computed from curve server-side

---
Task ID: 19-b
Agent: Super Z (main)
Task: User re-report — "body stream already read" still present + daily productivity calc still wrong

Work Log:
- ROOT CAUSE (retry error): GET dedupe shared promise resolved to ONE Response shared by ALL callers; caller #2 .json() threw "body stream already read" (first load only = concurrent mount race). Fix: promise resolves to raw {status,statusText,contentType,body}; every caller builds OWN Response (commit a5ca554)
- ROOT CAUSE (score mismatch): THREE conflicting formulas (dashboard API vs productivity-score API vs HorizonDial). NEW src/lib/daily-score.ts — ONE canonical formula: tasks .35/habits .25/morning .20/focus .20 renormalized ×0.9 + streak ×0.1 (30d cap); focus 60min; over-completion clamped; habits DUE-ONLY (weekdays=Sun-Thu, weekends=Fri-Sat) via habitDueOn()
- Dashboard API returns scoreBreakdown; card consumes it directly; HorizonDial shows same number; bars show weights
- Tests: 18/18 logic (bun scripts/test-daily-score.ts); PROD 19/19 (scripts/verify-prod-19b.js) — PARITY dashboard === score API === multi-date
- Commit a5ca554 pushed

Stage Summary:
- Score math: new-user perfect day (streak 1) = 90; 30d-streak perfect day = 100; morning-only = 90; half tasks = 45

---
Task ID: 20
Agent: Super Z (main)
Task: User report — delete-all returns 400 ("الحذف مش شغال"), tasks sometimes empty, final pre-launch review, REAL admin panel (health + errors management tab)

Work Log:
- delete-all 400 ROOT CAUSE: settings.tsx called apiDelete() with NO body while server requires {email,password,confirmDelete} re-auth → 400 always. Fix: dialog now asks for account password, sends proper body, shows server errors (403 wrong password)
- ADMIN GATE BUG: signup set isAdmin client-flag only — profiles.role NEVER written → requireAdmin() always 403'd. Fix: signup promotes profile to role='admin' via service client when email===ADMIN_EMAIL. For EXISTING owner account: SQL `update profiles set role='admin' where email='<owner-email>';` in Supabase SQL editor
- Error persistence: NEW supabase/migrations/011_error_logs.sql (RLS deny-all; service-role writes via /api/error-log); error-log route now inserts into table (graceful console fallback if table missing)
- Global client capture: NEW src/components/error-capture.tsx (window.error + unhandledrejection → reportError, 30s/message throttle) mounted in root layout
- NEW admin APIs: GET/DELETE /api/rise/admin/errors (last 100 + 24h count + top messages + clear), GET /api/rise/admin/health (DB ok+latency, config booleans, errors24h, users count, commit sha)
- Admin panel NEW tab "الصحة والأخطاء": health cards (DB/latency, errors 24h, users, config flags), top repeated errors, errors table (auto-refresh 60s), clear button, migration-missing notice
- Tasks "sometimes empty": fetch failures were silent (state preserved but user saw stale as vanished) → visible gold retry banner in tasks.tsx
- ENV RE-INIT LOST tracked-file edits mid-task → all 6 edits redone; scripts/ + worklog.md now COMMITTED to git to survive future re-inits
- Verified: 18/18 logic tests restored+pass, tsc clean, eslint clean (pre-existing warnings only), build OK

Stage Summary:
- Owner to-do after deploy: (1) run 011_error_logs.sql in Supabase SQL editor, (2) become admin via SQL above, (3) optional: set ADMIN_EMAIL env in Vercel for auto-admin on future signups
- PRODUCTION VERIFIED (scripts/verify-prod-20.js): 25/25 checks — signup→habit/task/journal CRUD→dashboard sanity (tasks=1, habits=1, counters=1, scoreBreakdown regression guard)→delete-all no-body=400 / wrong-pw=403 / wrong-email=403 / correct-credentials=200 deleted=5→wipe verified empty→error-log ok→admin routes (health/errors/users) all 403 for regular users
- Note: first E2E run hit 404 on new admin routes (deploy still rolling); re-probe after settle → 403 as designed, then clean 25/25 full run
- Commits: 281c5f6 (Task 20) pushed to origin/main
