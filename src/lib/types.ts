// RiseOS — shared types

export type ModuleId =
  | "dashboard"
  | "morning"
  | "planner"
  | "tasks"
  | "projects"
  | "goals"
  | "habits"
  | "journal"
  | "deep-work"
  | "reading"
  | "learning"
  | "health"
  | "finance"
  | "calendar"
  | "second-brain"
  | "weekly-review"
  | "monthly-review"
  | "analytics"
  | "ai-coach"
  | "settings";

export type TaskStatus = "todo" | "in-progress" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  level: number;
  xp: number;
  xpToNextLevel: number;
  streak: number;
  longestStreak: number;
  totalFocusMin: number;
  totalTasksDone: number;
  isDefault: boolean;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  label: string | null;
  projectId: string | null;
  dueDate: string | null;
  dueTime: string | null;
  estimatedMin: number | null;
  xpReward: number;
  completedAt: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
  project?: Project | null;
  subtasks?: SubTask[];
}

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
  order: number;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  progress: number;
  status: string;
  _count?: { tasks: number };
}

export interface Habit {
  id: string;
  name: string;
  icon: string;
  color: string;
  reminder: string | null;
  bestStreak: number;
  createdAt: string;
  logs?: HabitLog[];
}

export interface HabitLog {
  id: string;
  habitId: string;
  date: string;
  completed: boolean;
}

export interface MorningLog {
  id: string;
  date: string;
  water: boolean;
  prayer: boolean;
  exercise: boolean;
  reading: boolean;
  meditation: boolean;
  goalsReview: boolean;
  gratitude: boolean;
}

export interface FocusSession {
  id: string;
  taskId: string | null;
  type: string;
  durationMin: number;
  completed: boolean;
  startedAt: string;
  endedAt: string | null;
}

export interface DailyScore {
  date: string;
  score: number;
  morningScore: number;
  taskScore: number;
  habitScore: number;
  focusScore: number;
  journalScore: number;
}

export interface DashboardData {
  user: User;
  productivityScore: number;
  todayTasks: { total: number; done: number };
  todayHabits: { total: number; done: number };
  todayMorning: MorningLog | null;
  focusMinutesToday: number;
  weeklyScores: DailyScore[];
  streak: number;
  recentTasks: Task[];
  levelProgress: number;
}
