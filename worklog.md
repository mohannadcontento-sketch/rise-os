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

---
Task ID: 21
Agent: Super Z (main)
Task: Owner set profiles.role manually but admin panel never appears on the site

Work Log:
- Server chain verified healthy: /api/auth/session → checkAdminRole reads profiles.role; auth-provider rebuilds auth from it on every load
- ROOT CAUSE: literal comparison `role === 'admin'` — variants ('Admin', ' admin', Arabic 'ادمن') rejected → owner never recognized
- Fix: shared isAdminRole() in supabase.ts (trim + lowercase + Arabic 'ادمن') applied in session/login/refresh/audit.isAdmin/admin-users GET; role writes normalized in admin-users POST
- Diagnostic given to owner: open /api/auth/session while logged in → isAdmin true/false; if false run exact SQL update; then plain app refresh shows the panel
- Verified: tsc clean, build OK, prod probe: session route returns isAdmin=false for regular user (correct)
- Commits: 794fe86 + 10d9339 pushed

Stage Summary:
- Owner checklist: (1) open /api/auth/session — if isAdmin:false run `update profiles set role='admin' where email='mohannadcontento@gmail.com';` (2) refresh app → 'لوحة الإدارة' appears at sidebar bottom (3) error_logs migration 011 still pending if health tab shows notice

---
Task ID: 22
Agent: Super Z (main)
Task: Owner diagnostic /api/auth/session returned {"user":null} — admin panel still hidden

Work Log:
- Diagnosis: session route reads ONLY the httpOnly cookie (or Authorization header). The owner's session predates the cookie system — app works via apiFetch Bearer header, but the session route saw no cookie → user:null → isAdmin false forever regardless of profiles.role
- Fix: auth-provider buildAuthFromSupabase now sends Authorization: Bearer explicitly (session.access_token → localStorage rise-auth fallback) — session identity works cookie-less
- Settings: inline "الصلاحية: أدمن/مستخدم عادي" row for in-app self-diagnosis
- Verified on prod: WITH Bearer header → user identified; without → null (old path). tsc/build clean
- Commit 2a2d0bb pushed

Stage Summary:
- Owner next step: plain refresh of the app → auth-provider rebuild → panel appears (assuming profiles.role value matches after Task 21 normalization). Fallback re-login also refreshes cookie+role

---
Task ID: 23
Agent: Super Z (main)
Task: Upgrade admin system to "Admin Pro" — bigger, stronger, professional

Work Log:
- Overview tab (default): KPIs (total/active-today/weekly-engagement%/new-7d), content volume, 7-day error bars, recent signups, latest admin actions; auto-refresh 90s; /api/rise/admin/overview
- Account suspension: migration 012 (profiles.suspended + suspended_at + notifications type index); requireAuth enforces with 5-min per-instance cache (fail-open when migration pending); login → 423 Arabic message; session flag → client force-logout; suspension cache bust on action; admin/self protection on suspend+delete
- Broadcast: POST /admin/broadcast → 📣 notifications to ALL users (chunks of 500) + audit; per-user direct messages via users POST action=notify
- User 360: GET /admin/users?userId= → profile + 10 content counters + last activity; users POST now action-based (set-role | suspend | unsuspend | notify) with audit on every op
- Audit trail: dedicated tab + /admin/audit (reads notifications type=audit, resolves admin names); logAudit wired into every admin operation
- Verified: tsc clean, eslint clean, build OK; prod probe after deploy: overview/broadcast/audit + users?detail all 403 for regular users (routes live + guarded)
- Commits: 66f3312 pushed

Stage Summary:
- Owner still needs migrations: 011_error_logs.sql + 012_admin_pro.sql in Supabase SQL editor (suspension/broadcast fail-open or error-toast until then)
- Suspension worst-case lag: ≤5 min on stale serverless instances; instant on the instance that performed the action

---
Task ID: 24
Agent: Super Z (main)
Task: Final comprehensive pre-launch testing — real-user E2E, request counting, OWASP-lite security, load/stress/spike/soak concurrency testing

Work Log:
- Browser E2E (scripts/e2e-24-browser.js, Playwright chromium): REAL user journey — landing → signup → 20 modules → create+complete task → create habit → journal save → hard reload → re-login. 32/32 PASS, 0 console errors, screenshots in scripts/shots/
- Request counting (real browser): signup 7 req, each module nav 1-4 req (dedupe working), writes 4 req, hard reload 7, re-login 8 → full first-visit journey ≈ 60 API calls total
- API suite (scripts/verify-prod-24-api.js): 60/60 PASS after fixes — functional CRUD A(31) + edge cases B(12) + security C(19)
- FOUND + FIXED 3 API robustness gaps (commit 619df7b): journal POST had no Zod (mood:string → 500, now 400); focus POST minimal payload → 500 (startedAt NOT NULL — now server-defaulted); morning POST all-unknown-fields → 500 (now 400)
- Security verified: 20/20 routes deny anonymous, forged/garbage JWT 401, admin 6/6 + broadcast POST 403, IDOR blocked (RLS+userId-scoped delete no-op), cookie HttpOnly+Secure+SameSite, HSTS+CSP+nosniff+XFO:DENY, login brute-force → 429 after ~11 attempts, weak password + duplicate signup rejected
- LOAD (k6 methodology, scripts/load-24.js, 8 dedicated accounts): SMOKE 1VU ✅ 0% | LOAD 25VU×90s ✅ 1,638 req 100% p95=1.07s | STRESS ramp 25→50→100: 50VU=95.1%, 100VU 78% (guard halted) | SPIKE 150VU: 87%, dashboard p95 7s under burst, recovered instantly | SOAK 15VU×150s ✅ 1,620 req 100% stable
- KEY: ~9,700 total requests across ALL phases → ZERO 5xx, zero crashes; every failure = deliberate 429 rate-limit protection (middleware per-IP 300/min per pathname bucket; evidence = in-memory fallback, no Upstash in prod)
- Cleanup: all 8 load accounts wiped via delete-all (200×8)

Stage Summary:
- VERDICT: GO for launch. Latency p50≈0.72s p95≈1.0s (healthy, stable over time); degradation under extreme burst is protective 429s not crashes
- Recommendation: rate limiter is per-IP in-memory — add Upstash env vars for distributed correctness and/or per-user limits (NAT/classroom edge: many users on one WiFi share the 300/min budget)
- Owner note: browser E2E ran pre-fix deploy (fixes are API-payload-only, zero UI impact); API suite re-ran post-deploy 60/60

---
Task ID: 25
Agent: Super Z (main)
Task: Owner bug batch — morning check reverts / health never saves / empty space / books save-error + instant-appear / skill level editing / second-brain leaks learning content — then FINAL pre-launch test round

Work Log:
- REPRO FIRST (scripts/repro-25.js on prod): server persistence 100% correct for morning/health/books → bugs are CLIENT-side; found exerciseNotes(exerciseNote field mismatch + books garbage 500
- ROOT CAUSE #1 "الشيك بيرجع علطول": RainbowCheckbox is <label>+<input> inside clickable rows — one click fired input onChange AND row onClick → toggle twice (add→remove) → check vanished instantly, final save stored EMPTY set. Fix: stopPropagation at the label (kit-v2.tsx) — single point, app-wide (commit aff68ce)
- ROOT CAUSE #2 stale rollbacks on flaky networks: sw.js served API cache of ANY age on network hiccup (pre-write snapshot overwrote fresh state). Fix: 30s freshness TTL + timestamp side-entries, cache bumped v3 (commit e832763)
- ROOT CAUSE #3 health "مبيحصلش حفظ": (a) client exerciseNotes vs DB exerciseNote — notes silently dropped → FIELD_MAP fix; (b) checklist had NO auto-save at all → debounced 900ms auto-save + dirty-guard against refetch clobber; (c) auto-save stale closure sent notes as '' → notesRef fix (commit b0b3263)
- BOOKS: "error toast but book appears after re-entry" = optimistic add now uses POST response (instant display), offline-queue honest toast, retry banner on load failure, Zod on POST (garbage → 400 Arabic, was 500)
- SKILLS: hover-only edit/delete (invisible on touch) → always visible; inline level stepper (−/+ 1..5) persisted via updateSkillLevel; learning-log edit now covers minutes too
- SECOND BRAIN: learning-* knowledge items (goals/courses/skills/logs) filtered out — "مش عاوز كدا خالص"
- HEALTH empty space: removed double padding (component self-padded on top of page padding); charts honest empty-state instead of zero-filled frames
- FINAL ROUND ON PROD: e2e-25-browser 13/13 REAL-USER (morning persists after reload, health water+notes auto-save, book instant+persists, skill level stepper persists, second-brain excludes learning) — 0 console errors, 0 non-2xx; verify-prod-24-api 60/60 (functional+edge+security+cleanup); load: smoke 0% + load 25VU×90s 1,620 req 0% p95=1.07s (healthy = Task 24 baseline); cleanup 7 QA accounts wiped
- Commits: e832763 + aff68ce + b0b3263 pushed; scripts committed (repro-25, e2e-25-browser, cleanup-25)

Stage Summary:
- VERDICT: GO for launch — all owner-reported bugs fixed AND regression-verified on production as a real user
- Owner UX note: health + morning + planner checklists now auto-save; manual حفظ still there
- Deferred: 011/012 migrations if health tab shows notice; Upstash env for distributed rate-limit (Task 24 recommendation stands)

---
Task ID: 26
Agent: Super Z (main)
Task: Owner report — brain takes data from Budget / reading list always empty / skill +/− strip looks broken — fix + verify on prod

Work Log:
- ROOT CAUSE #1 (brain leak): Finance budgets route stores budget-config + savings-goal rows in the SAME knowledge_items table; Task 25 filter only excluded learning-* → budget rows leaked into the Second Brain (and global search). FIX: server-side WHITELIST of brain-owned types in knowledge GET (note/project/knowledge/idea/resource/bookmark/inspiration/research/design_ref) + client whitelist defense; ?type=learning still serves the Learning module. Bonus: add-dialog type default 'note' → 'idea' ('note' isn't in typeConfig → empty dropdown value)
- ROOT CAUSE #2 (قائمة القراءة always empty): UI tab filters status='want_to_read', seed writes 'want_to_read', but the books API Zod schema only allowed 'want-to-read' (hyphen) AND the add dialog hardcoded status='reading' with no list picker → the tab could NEVER fill. FIX: schema accepts both spellings + normalizeStatus() → canonical 'want_to_read' on POST/PUT; add dialog now has القائمة picker (أقرأه الآن / قائمة القراءة); one-tap 'ابدأ القراءة الآن' on want_to_read cards; 4-way list switcher (قائمة القراءة/أقرأه الآن/متوقف/مكتمل) in card details; legacy hyphen statuses normalized on fetch
- ROOT CAUSE #3 (skill strip "شكله بايظ"): ring+name+level+stepper+edit+delete crammed into ONE row that wrapped horribly on phones. FIX: card redesigned into two clean rows — row 1 identity+actions, row 2 dedicated level strip (− • dots • level/5 +) dir=ltr, 7×7 touch targets, disabled at bounds; edit-mode row now flex-wrap with flexible input
- tsc clean, eslint clean, build OK
- PROD VERIFIED: verify-prod-26-api.js 26/26 (brain whitelist incl. budget+savings+learning exclusion, ?type=learning intact, want_to_read create both spellings + normalization, list moves both ways, garbage→400, skill level persist, budgets GET regression, brain CRUD, delete-all cleanup) + e2e-26-browser.js 10/10 REAL USER (brain clean BEFORE and AFTER saving budget via finance UI-flow, book→قائمة القراءة tab fills→ابدأ القراءة→للقراءة, skill strip renders/level 1→2 persists, mobile 390px: ZERO horizontal overflow in skills+reading) — 0 console errors, 0 non-2xx
- Commits: ddd994a pushed; scripts committed (verify-prod-26-api, e2e-26-browser) + screenshots

Stage Summary:
- All three owner-reported bugs fixed and regression-verified on production as a real user
- Convention locked: book status canonical value = 'want_to_read' (underscore) everywhere (UI, seed, API normalization)
- knowledge GET is now whitelist-based: any FUTURE module that parks rows in knowledge_items with a custom type will NOT leak into the brain or global search
