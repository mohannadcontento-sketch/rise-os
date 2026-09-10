-- Add the missing natural uniqueness constraint for user achievements.
CREATE UNIQUE INDEX "UserAchievement_userId_badgeId_key" ON "UserAchievement"("userId", "badgeId");
