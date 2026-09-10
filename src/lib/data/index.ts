// أوج (Awj) Data Access Layer
// Stable facade over domain-specific repositories.
import { profiles } from './profiles'
import { userSettings } from './userSettings'
import { userStorage } from './userStorage'
import { userApiKeys } from './userApiKeys'
import { userAIUsage } from './userAIUsage'
import { projects } from './projects'
import { tasks } from './tasks'
import { goals } from './goals'
import { habits } from './habits'
import { journals } from './journals'
import { focusSessions } from './focusSessions'
import { workSessions } from './workSessions'
import { healthLogs } from './healthLogs'
import { financeRecords } from './financeRecords'
import { books } from './books'
import { knowledgeItems } from './knowledgeItems'
import { plannerItems } from './plannerItems'
import { morningLogs } from './morningLogs'
import { notifications } from './notifications'
import { habitLogs } from './habitLogs'
import { dailyScores } from './dailyScores'
import { userAchievements } from './userAchievements'

export { setCurrentAuthToken } from './core'

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
