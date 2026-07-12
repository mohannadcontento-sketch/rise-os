# Task 6: Tasks & Projects Components

## Files Created
1. `/home/z/my-project/src/components/rise/tasks.tsx` - Full task manager
2. `/home/z/my-project/src/components/rise/projects.tsx` - Project management view

## tasks.tsx Features
- **3 View Modes**: List (قائمة), Board/Kanban (لوحة), Calendar (تقويم)
- **List View**: Tasks grouped by status (للتنفيذ, قيد التنفيذ, مكتمل), expandable with subtasks/description, checkbox toggle, priority badges, project color dots, XP badges, due dates
- **Board View**: 3-column kanban with status dropdown to move tasks between columns, subtask progress bars, XP display
- **Calendar View**: Monthly grid (Saturday-start week), task chips colored by priority, month navigation, today highlight
- **Add Task Dialog**: Title, description, priority select with color dots, project select, due date picker
- **Filter Bar**: Dropdown with priority/project/status filters
- **Search**: Real-time task search
- **Stats Summary**: 4 glass cards showing total/todo/in-progress/done counts
- **Mutations**: Optimistic updates for toggle, move, delete with rollback on error
- **Skeleton loading** state on initial fetch
- **Staggered framer-motion** animations for all task items

## projects.tsx Features
- **Project Cards Grid**: 2-3 column responsive grid, each card with color accent bar, icon, name, description, SVG circular progress ring, task count, status badge, progress bar
- **Hover animations**: scale up slightly with framer-motion
- **Add Project Dialog**: Name, description, preset color picker (12 colors)
- **Edit Project Dialog**: Reuses same dialog with pre-filled data
- **Project Detail View**: Full project info with progress ring, stats (total/completed/in-progress), overall progress bar, tasks grouped by status with full management
- **Add Task to Project**: Dedicated dialog when viewing project detail
- **Empty State**: Beautiful animated illustration with floating sparkle icon
- **Summary Stats**: Bottom card with total projects, active, total tasks, completed tasks
- **SVG Progress Ring**: Animated circular SVG progress indicator per project
- **Optimistic updates** for all mutations (create, update, delete, toggle)

## Design System Compliance
- All text Arabic, RTL layout
- CSS vars: `emerald-accent`, `forest`, `gold`
- `glass` class for glassmorphism premium card effects
- shadcn/ui components: Card, Button, Checkbox, Dialog, Badge, Input, Select, Tabs, Progress, DropdownMenu, Label, Textarea, Skeleton
- framer-motion for entrance, layout, and hover animations
- lucide-react icons throughout
- Priority colors: عاجل=red, مرتفع=orange, متوسط=gold, منخفض=blue
- Reuses `priorityColors`, `priorityLabels`, `statusLabels`, `formatDateShort` from `@/lib/rise-utils`

## Lint Status
Both files pass ESLint with 0 errors (verified - all 8 lint errors in project are pre-existing in other files).