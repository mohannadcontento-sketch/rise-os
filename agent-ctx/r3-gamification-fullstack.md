# Task r3-gamification — Work Record

## Summary
Implemented a real XP/Level system with exponential scaling, a full badges catalog, and Pomodoro-task-habit-routine XP earning integration.

## Files Created
1. **`/home/z/my-project/src/lib/gamification.ts`** — XP/Level calculation utility + 15 badge definitions with typed conditions
2. **`/home/z/my-project/src/app/api/rise/earn-xp/route.ts`** — POST API to increment user XP by amount with reason tracking

## Files Modified
3. **`/home/z/my-project/src/components/rise/dashboard.tsx`**
   - Removed old flat `XP_PER_LEVEL = 500` / `xpInLevel()` / `xpPercent()` functions
   - Imported `calculateLevel`, `BADGES`, `BadgeStats` from `@/lib/gamification`
   - Imported `Tooltip` components for "next level" tooltip
   - Added `levelInfo = calculateLevel(user.xp)` and `badgeStats: BadgeStats` computed from user data
   - XP bar now uses real `levelInfo.progress`, `levelInfo.currentXp`, `levelInfo.xpToNext`
   - Level badge shows "المستوى X" with golden gradient
   - Added tooltip showing remaining XP to next level
   - Added "الشارات المتاحة" section below achievements with:
     - 4-col responsive grid (2 on mobile, 3 on sm, 4 on lg)
     - Earned badges: fully colored with gold border glow + unlock animation (rotate + scale bounce)
     - Unearned badges: `opacity-40` grayed out
     - Each badge: icon, name, description, checkmark if earned
     - `glass` wrapper with spring animations via framer-motion

4. **`/home/z/my-project/src/components/rise/tasks.tsx`**
   - `toggleTask`: calls `earn-xp` with `task.xpReward || 10` when completing a task
   - `moveTask`: calls `earn-xp` when moving to 'done' status

5. **`/home/z/my-project/src/components/rise/habits.tsx`**
   - `toggleTodayHabit`: calls `earn-xp` with `habit.xpReward || 15` on first completion today only

6. **`/home/z/my-project/src/components/rise/deep-work.tsx`**
   - `saveSession`: calls `earn-xp` with `Math.floor(elapsedMin / 10)` on completed focus sessions

7. **`/home/z/my-project/src/components/rise/morning-routine.tsx`**
   - `saveToAPI`: calls `earn-xp` with total XP from all sections when all routine items are completed

## Lint
- `bun run lint` passes with 0 errors

## Design Decisions
- XP curve: exponential `100 * 1.2^(level-1)` — level 1 needs 100 XP, level 10 needs ~516
- All XP earning calls are fire-and-forget (`.catch(() => {})`) to never block UI
- Badges use typed `BadgeStats` interface for type safety
- Tooltip shows remaining XP in Arabic numerals