# 🔒 Security Policy for RiseOS

## Supported Versions

We release patches for security vulnerabilities. Which versions are eligible for receiving such patches depends on the CVSS v3.0 Rating:

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < Latest| :x:                |

## Reporting a Vulnerability

We take the security of RiseOS seriously. If you believe you have found a security vulnerability, please report it to us as described below.

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via:
1. **GitHub Security Advisories**: [Report a vulnerability](https://github.com/mohannadcontento-sketch/rise-os/security/advisories/new)
2. **Email**: [security@riseos.app](mailto:security@riseos.app) (if applicable)

You should receive a response within **48 hours**. If for some reason you do not, please follow up via email to ensure we received your original message.

Please include the requested information listed below (as much as you can provide) to help us better understand the nature and scope of the possible issue:

* Type of issue (e.g. buffer overflow, SQL injection, cross-site scripting, etc.)
* Full paths of source file(s) related to the manifestation of the issue
* The location of the affected source code (tag/branch/commit or direct URL)
* Any special configuration required to reproduce the issue
* Step-by-step instructions to reproduce the issue
* Proof-of-concept or exploit code (if possible)
* Impact of the issue, including how an attacker might exploit the issue

This information will help us triage your report more quickly.

## Preferred Languages

We prefer all communications to be in **Arabic** or **English**.

## Security Measures in Place

RiseOS implements several security measures to protect user data:
- **Row-Level Security (RLS)** enforced on all Supabase database tables.
- **Strict Content Security Policy (CSP)** to mitigate XSS attacks.
- **Rate Limiting** via Upstash Redis to prevent brute-force and DDoS attacks.
- **Password Re-authentication** required for destructive actions (e.g., account/data deletion).
- **Automated CI/CD Security Scans** (Dependency auditing and CodeQL SAST) on every pull request.

## Incident Response & Secret Rotation

In the event of a suspected secret leak, we maintain an **Emergency Secret Rotation Playbook** to ensure zero-downtime rotation of:
- `SUPABASE_SERVICE_ROLE_KEY`
- `UPSTASH_REDIS_REST_TOKEN`
- `NEXTAUTH_SECRET` / `AUTH_SECRET`

## Hall of Fame

We appreciate the efforts of security researchers who help keep RiseOS secure. Contributors who report valid, previously unreported vulnerabilities will be acknowledged here (with permission).

* *Your name could be here!*

---
*Last Updated: July 31, 2026*