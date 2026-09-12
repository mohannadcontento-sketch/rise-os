# Security hardening patch

Applied fixes:

- Mock authentication is enabled only when `NODE_ENV` is exactly `development` or `test`, and only when Supabase auth variables are absent.
- Local mock users now store a scrypt password hash and verify passwords during login.
- Local access and refresh tokens are HMAC-SHA256 signed and expire; unsigned/raw user IDs are rejected.
- Added Prisma migration for `User.passwordHash`.
- Updated Next.js and `eslint-config-next` to `16.3.4` and aligned npm/Bun lockfiles.
- Replaced `script-src 'unsafe-inline'` with a per-request CSP nonce and `strict-dynamic`.
- Server-side avatar updates now accept only IDs defined in the `AVATARS` allowlist.
- Added `MOCK_AUTH_SECRET` documentation for stable local sessions when desired.

Verification note: dependency installation/build could not be completed in the audit container because npm registry/network access timed out and the uploaded project does not include `node_modules`. JSON/lockfile integrity and targeted source checks were completed.
