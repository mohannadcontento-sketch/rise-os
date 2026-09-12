# RiseOS — Pass 2 Supabase SQL

Apply migrations in order after the earlier hardening migrations.

## If migrations 013–019 have NOT been applied
Use the corrected `019_final_privilege_hardening.sql` included in this package, then apply:

1. `020_broadcast_schema_fix.sql`
2. `021_notification_integrity.sql`
3. `022_admin_read_contract_fix.sql`

## If migrations 013–019 ARE already applied
Do **not** rerun historical migrations. Apply only:

1. `020_broadcast_schema_fix.sql`
2. `021_notification_integrity.sql`
3. `022_admin_read_contract_fix.sql`

## What these do
- `020`: recreates `admin_broadcast_notifications_atomic()` using `notifications.read` and the valid `system` type.
- `021`: adds the notification query index `(user_id, read, created_at DESC)`.
- `022`: fixes the `admin_read('recent_errors')` columns contract and keeps `admin_read` callable only through the trusted service role.

No Pass-2 migration intentionally deletes user data.

Before applying SQL, keep a database backup. Afterward verify the RPCs in the Supabase dashboard or SQL editor.
