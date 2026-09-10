// RiseOS Data Access Layer
// Stable facade over domain-specific repositories.
import { profiles } from './data/profiles'
import { userSettings } from './data/userSettings'
import { userStorage } from './data/userStorage'
import { userApiKeys } from './data/userApiKeys'
import { userAIUsage } from './data/userAIUsage'
import { projects } from './data/projects'
import { tasks } from './data/tasks'
import { goals } from './data/goals'
import { habits } from './data/habits'
import { journals } from './data/journals'
import { focusSessions } from './data/focusSessions'
import { workSessions } from './data/workSessions'
import { healthLogs } from './data/healthLogs'
import { financeRecords } from './data/financeRecords'
import { books } from './data/books'
import { knowledgeItems } from './data/knowledgeItems'
import { plannerItems } from './data/plannerItems'
import { morningLogs } from './data/morningLogs'
import { notifications } from './data/notifications'
import { habitLogs } from './data/habitLogs'
import { dailyScores } from './data/dailyScores'
import { userAchievements } from './data/userAchievements'

export { setCurrentAuthToken } from './data/core'

export const data = {
  profiles,
  userSettings,
  userStorage,
  userApiKeys,
  userAIUsage,
  projects,
  tasks,
  goals,
  habits,
  journals,
  focusSessions,
  workSessions,
  healthLogs,
  financeRecords,
  books,
  knowledgeItems,
  plannerItems,
  morningLogs,
  notifications,
  habitLogs,
  dailyScores,
  userAchievements,
}
