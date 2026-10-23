# 11 — Accounts, Credentials and Access

Everything needed to sign in to the running system, what each role may do, and
how to create more accounts.

> **This document describes local development credentials.** Accounts with known
> passwords must never exist in a deployed environment. See
> [§6](#6-before-deploying).

## 1. Where the system is running

| Service | URL | Notes |
|---------|-----|-------|
| Web app | <http://127.0.0.1:5173> | The Vite dev server, proxying `/api` to the API. |
| API | <http://127.0.0.1:4000> | `GET /api/health` confirms the service and the database. |
| MySQL | `127.0.0.1:3306` | Local instance, data in `.local/mysql/data`. |

## 2. Local accounts

One account per role, so every permission set can be exercised. The password
is the same for all of them.

| Email | Password | Role(s) | Lands on |
|-------|----------|---------|----------|
| `admin@checkiq.local` | `CheckIQ!Local2026` | Administrator, Super Administrator | Operations queue |
| `superadmin@checkiq.local` | `CheckIQ!Local2026` | Super Administrator | Operations queue |
| `verifier@checkiq.local` | `CheckIQ!Local2026` | BGV Executive | Operations queue |
| `reviewer@checkiq.local` | `CheckIQ!Local2026` | BGV Reviewer | Operations queue |
| `hr@checkiq.local` | `CheckIQ!Local2026` | HR / Recruitment | Operations queue |
| `candidate@checkiq.local` | `CheckIQ!Local2026` | Candidate | Candidate dashboard |

The candidate account also has a Candidate ID, a profile and an open case:

| | |
|---|---|
| Candidate ID | `CIQ-DEMO-000001` |
| Email | `candidate@checkiq.local` |
| Case | Created automatically; the number is shown on the dashboard. |

### Signing in

**In the browser:** open <http://127.0.0.1:5173/login>, enter the email and
the password. Staff are routed to the operations queue; the candidate is routed
to their dashboard.

**Through the API:**

```bash
curl -X POST http://127.0.0.1:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"verifier@checkiq.local","password":"CheckIQ!Local2026"}'
```

The response contains the access token. Use it as a bearer token:

```bash
curl http://127.0.0.1:4000/api/cases/queue-counts \
  -H "Authorization: Bearer <accessToken>"
```

A Candidate ID also works as the `identifier`.

### Recreating these accounts

They are created by:

```bash
npm run db:seed:local-accounts -w @checkiq/api
```

The script is idempotent — it resets the password and the roles of an existing
account rather than failing. It refuses to run when `NODE_ENV=production`.

## 3. What each role can reach

Measured against the running API. `200` is allowed, `403` is refused by the
server.

| Endpoint | Candidate | BGV Exec | BGV Reviewer | HR | Admin | Super Admin |
|----------|:--:|:--:|:--:|:--:|:--:|:--:|
| `GET /api/dashboard` | 200 | 403 | 403 | 403 | 403 | 403 |
| `GET /api/cases` | 200 (own only) | 200 | 200 | 200 | 200 | 200 |
| `GET /api/cases/queue-counts` | 403 | 200 | 200 | 200 | 200 | 200 |
| `GET /api/admin/users` | 403 | 403 | 403 | 403 | 200 | 200 |
| `GET /api/admin/audit` | 403 | 403 | 403 | 403 | 200 | 200 |

`GET /api/dashboard` is candidate-only by design: it is the candidate's own
view. Staff use the operations queue instead.

The differences that are not visible in a status code:

| Capability | Permission | Held by |
|------------|------------|---------|
| Read a case they are **assigned** to | `case:read:assigned` | BGV Executive, BGV Reviewer, Administrator, Super Admin |
| Read **any** case | `case:read:any` | BGV Reviewer, HR, Administrator, Super Admin |
| See individual check **findings and remarks** | `verification:read` | BGV Executive, BGV Reviewer, Admin, Super Admin — **not HR** |
| Record a verification result | `verification:record` | BGV Executive, BGV Reviewer, Admin, Super Admin |
| Raise / close a clarification | `clarification:create`, `clarification:close` | BGV Executive, BGV Reviewer, Admin, Super Admin |
| Approve a case | `approval:decide` | BGV Reviewer, HR, Super Admin — **not Administrator** |
| Adjust a score | `score:adjust` | Administrator, Super Admin |
| Manage users | `user:manage` | Administrator, Super Admin |
| Manage roles and permissions | `role:manage`, `permission:manage` | Super Admin only |
| Manage packages and configuration | `package:manage`, `config:manage` | Administrator, Super Admin |
| Read the audit trail | `audit:read` | Administrator, Super Admin |

The full matrix is in
[`03-roles-and-permissions.md`](./03-roles-and-permissions.md).

## 4. Creating more accounts

### From the admin UI

Sign in as `admin@checkiq.local`, then open **Users → Add a user**. Choose the
role, set a temporary password (minimum 10 characters), and the account is
created with `mustChangePassword` set. The new user changes it at first
sign-in.

An existing account's roles are changed with the **Roles** action on the same
page. Every role change is written to the audit trail with the previous and
new role sets.

### Through the API

```bash
curl -X POST http://127.0.0.1:4000/api/admin/users \
  -H "Authorization: Bearer <adminAccessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "new.verifier@checkiq.local",
    "fullName": "New Verifier",
    "roles": ["BGV_EXECUTIVE"],
    "temporaryPassword": "Temporary!2026"
  }'
```

Requires `user:manage`. Changing roles requires `permission:manage` (or
`user:manage`, which the Administrator role holds).

### Registering a candidate

Candidates register themselves from the landing screen with a Candidate ID. No
invitation or administrator action is needed:

```bash
curl -X POST http://127.0.0.1:4000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "candidateId": "CIQ-2026-000002",
    "fullName": "Asha Menon",
    "email": "asha.menon@example.com",
    "mobile": "+919812345678",
    "password": "Str0ng!Passw0rd",
    "confirmPassword": "Str0ng!Passw0rd"
  }'
```

A Candidate ID that is already in use is refused with
`409 CANDIDATE_ID_ALREADY_IN_USE` — the existing account and case are never
overwritten or merged.

## 5. Infrastructure and secret values (local)

| What | Where | Local value |
|------|-------|-------------|
| MySQL root password | `docker-compose.yml` / your own setup | `checkiq_root_pw` |
| MySQL app user | `.env` → `DATABASE_URL` | `checkiq` / `checkiq_dev_pw` |
| Database name | `.env` → `DATABASE_URL` | `checkiq` |
| Test database | `apps/api/tests/env.ts` | `checkiq_test` (same user) |
| JWT signing secret | `.env` → `JWT_ACCESS_SECRET` | A random 48-byte base64 value |
| PII encryption key | `.env` → `PII_ENCRYPTION_KEY` | A random 32-byte base64 value |
| Seeded admin password | `.env` → `SEED_ADMIN_PASSWORD` | `ChangeMe!2026` (overwritten to `CheckIQ!Local2026` by the local-accounts script) |
| Storage directory | `.env` → `STORAGE_DIR` | `./storage` (private; never served) |
| Support address | `system_config` → `support.contact_email` | empty until set |

Generate fresh secrets for a new environment:

```bash
node -e "const c=require('crypto');console.log('JWT_ACCESS_SECRET='+c.randomBytes(48).toString('base64'));console.log('PII_ENCRYPTION_KEY='+c.randomBytes(32).toString('base64'))"
```

## 6. Before deploying

1. **Remove the seeded accounts.** The seed creates an administrator, and
   `db:seed:local-accounts` creates one account per role. Neither should run
   against a deployed database. The local-accounts script already refuses to
   run when `NODE_ENV=production`; make sure the deployment job does not call
   `db:seed` either, or that it only runs the catalogue portion.
2. **Set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` to a one-time value** and
   change it at first sign-in, or create the first administrator directly in
   the database and never run the seed.
3. **Rotate `JWT_ACCESS_SECRET` and `PII_ENCRYPTION_KEY`** — they must differ
   from the local values. Rotating `PII_ENCRYPTION_KEY` makes the existing
   encrypted identity fields unreadable, so it needs a re-encryption migration
   (decision D-18).
4. **Use a distinct MySQL user per environment** with only the privileges the
   application needs. The application never needs `DROP`, `GRANT` or
   `SUPER`.
5. **Store the secrets in the deployment's secret store**, not in `.env` on
   disk, and rotate the database password on a schedule.
6. **Set `COOKIE_SECURE=true`** — the API refuses to start in production
   otherwise.

## 7. Troubleshooting a sign-in

| Symptom | Cause | Fix |
|---------|-------|-----|
| `UNAUTHENTICATED` with a correct password | The account is disabled | `UPDATE users SET is_active = 1 WHERE email = '…'` |
| `UNAUTHENTICATED` after a password change | The session epoch was bumped, invalidating every session | Sign in again |
| `FORBIDDEN` on a valid account | The role lacks the permission | Check the matrix in §3, or grant the role through the admin UI |
| `404` on a case the user should see | The case is not assigned to them | Assign it with **Assign** on the case, or grant `case:read:any` |
| `422 PRECONDITION_FAILED` on submission | Profile fields, documents, consent or clarifications are outstanding | The response lists each item |
| `409 CONFLICT` on a case update | Someone else changed the case | Reload and retry |
| `429 RATE_LIMITED` | Too many attempts from one address | Wait for the window to pass |
