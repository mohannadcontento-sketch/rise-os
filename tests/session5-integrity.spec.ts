import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const read = (p: string) => fs.readFileSync(p, 'utf8')

test('session 5: goal milestone toggle is atomic', () => {
  const data = read('src/lib/data.ts')
  const route = read('src/app/api/rise/goals/route.ts')
  expect(data).toContain("rpc('toggle_goal_milestone_atomic'")
  expect(route).not.toContain('allGoals = await data.goals.list(userId)')
})

test('session 5: admin user deletion uses atomic RPC', () => {
  const route = read('src/app/api/rise/admin/users/route.ts')
  const migration = read('supabase/migrations/018_integrity_and_atomic_goal_toggle.sql')
  expect(route).toContain("rpc('admin_delete_user_data_atomic'")
  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.admin_delete_user_data_atomic')
  expect(route).not.toContain('for (const table of tables)')
})

test('session 5: focus task ownership is enforced in the database', () => {
  const migration = read('supabase/migrations/018_integrity_and_atomic_goal_toggle.sql')
  expect(migration).toContain('validate_focus_task_ownership')
  expect(migration).toContain('trg_validate_focus_task_ownership')
})
