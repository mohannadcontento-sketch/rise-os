-- Enforce FocusSession.taskId ownership in local SQLite as defense in depth.
CREATE INDEX IF NOT EXISTS "FocusSession_taskId_idx" ON "FocusSession"("taskId");

DROP TRIGGER IF EXISTS "FocusSession_task_owner_insert";
CREATE TRIGGER "FocusSession_task_owner_insert"
BEFORE INSERT ON "FocusSession"
WHEN NEW."taskId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Task" t
    WHERE t."id" = NEW."taskId"
      AND t."userId" = NEW."userId"
  )
BEGIN
  SELECT RAISE(ABORT, 'task does not belong to focus session owner');
END;

DROP TRIGGER IF EXISTS "FocusSession_task_owner_update";
CREATE TRIGGER "FocusSession_task_owner_update"
BEFORE UPDATE OF "taskId", "userId" ON "FocusSession"
WHEN NEW."taskId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Task" t
    WHERE t."id" = NEW."taskId"
      AND t."userId" = NEW."userId"
  )
BEGIN
  SELECT RAISE(ABORT, 'task does not belong to focus session owner');
END;
