# Task r3-features — Full-stack Developer

## Summary

Added 2 cross-cutting features to RiseOS: a notification toast system and enhanced global search.

## Files Created

### `/src/lib/notifications.ts`
- 6 toast utility functions wrapped in try/catch:
  - `notifyMorningComplete(score, xp)` — when all routine items done
  - `notifyTaskComplete(title, xp)` — when a task is checked off
  - `notifyHabitComplete(name, streak)` — when a habit is toggled on
  - `notifyFocusComplete(minutes, xp)` — when a focus session is saved as completed
  - `notifyLevelUp(level)` — for future level-up events
  - `notifyMotivation()` — random motivational messages

## Files Modified

### `/src/components/rise/tasks.tsx`
- Added import for `notifyTaskComplete`
- In `toggleTask()`, after successful API call when marking a task as done, calls `notifyTaskComplete(task.title, task.xpReward)`

### `/src/components/rise/habits.tsx`
- Added import for `notifyHabitComplete`
- In `toggleTodayHabit()`, after successful API call when completing a habit, calculates streak and calls `notifyHabitComplete(habit.name, streak)`
- Added `habits` to the dependency array of `useCallback`

### `/src/components/rise/deep-work.tsx`
- Added import for `notifyFocusComplete`
- Replaced generic toast with `notifyFocusComplete(elapsedMin, xp)` in `saveSession()` when `completed === true`
- XP calculated as `Math.round(elapsedMin * 2)`

### `/src/components/rise/morning-routine.tsx`
- Added import for `notifyMorningComplete`
- Added `prevAllDoneRef` to track all-done state transitions
- Added `useEffect` watching `isAllDone` that fires `notifyMorningComplete(score, earnedXP)` on false→true transition

### `/src/app/page.tsx`
- Added interfaces: `SearchTask`, `SearchHabit`, `SearchGoal`
- Added state: `searchQuery`, `searchResults`
- Added `handleSearchQuery` and `handleSearchOpenChange` callbacks
- Added `useEffect` that fetches from `/api/rise/tasks`, `/api/rise/habits`, `/api/rise/goals` when query >= 2 chars, with AbortController cleanup
- Enhanced Command Palette with 3 additional `CommandGroup`s:
  - **المهام** — shows tasks with status icon, title, and XP
  - **العادات** — shows habits with flame icon and name
  - **الأهداف** — shows goals with target icon, title, and progress %
- All results are clickable and navigate to the corresponding module
- Removed unused `Input` import

## Lint
- `bun run lint` passes with 0 errors, 0 warnings