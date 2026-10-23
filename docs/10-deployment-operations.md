# 10 — Deployment and Operations

## 1. Topology

```
             ┌──────────────────────┐
   Browser  │  Reverse proxy (TLS) │   terminates HTTPS, serves the SPA,
             └──────────┬───────────┘   enforces HSTS and the CSP
                        │  /api  (same origin, so the refresh cookie is
                        │         first-party and SameSite=Lax applies)
             ┌──────────▼───────────┐
             │   CheckIQ API (Node) │   stateless, 1+ instances behind the
             └──────┬────────┬──────┘   proxy
                    │        │
        ┌───────────▼──┐  ┌──▼──────────────────┐
        │   MySQL 8.4  │  │  Private volume     │
        │  (managed or  │  │  (document storage) │
        │   container)  │  └─────────────────────┘
        └──────────────┘
```

The API is stateless. Horizontal scaling needs no sticky sessions: sessions
live in MySQL, and the refresh token is presented on every refresh.

## 2. Environments

| | Development | Test | Production |
|---|---|---|---|
| `NODE_ENV` | `development` | `test` | `production` |
| `DATABASE_URL` | `checkiq` | `checkiq_test` | a managed instance |
| `JWT_ACCESS_SECRET` | local secret | local secret | a secret from the store |
| `PII_ENCRYPTION_KEY` | local key | local key | a key from the store |
| `COOKIE_SECURE` | `false` | `false` | `true` (enforced at boot) |
| `EMAIL_ENABLED` | `false` | `false` | `true` once SMTP is configured |
| `CORS_ORIGINS` | `http://localhost:5173` | n/a | the deployed origin |
| `LOG_LEVEL` | `info` | `silent` | `info` |

The API refuses to start in production with `COOKIE_SECURE=false`. Secrets
come from the environment; nothing sensitive is committed.

### Local MySQL

The repository ships a workspace-local MySQL instance for development:

```
.local/mysql/my.ini      # server configuration
.local/mysql/data/       # data directory (git-ignored)
```

Start it with the MySQL binaries:

```
mysqld --defaults-file="<repo>/.local/mysql/my.ini" --console
```

Alternatively, use `docker-compose.yml` (below) if Docker is available.

## 3. Deployment sequence

```bash
# 1. Install dependencies
npm ci

# 2. Build the shared contracts, the API and the web app
npm run build

# 3. Apply the database migrations
npm run db:migrate

# 4. Seed the reference data (roles, permissions, catalogue, configuration)
npm run db:seed          # safe to re-run; it is idempotent

# 5. Start the API
npm run start -w @checkiq/api

# 6. Serve the web app
npm run preview -w @checkiq/web    # or serve apps/web/dist from the proxy
```

In production, run the migrations as a release step **before** the new API
version starts, and take a backup immediately before.

## 4. Migrations in production

- Migrations are forward-only and applied with `npm run db:migrate`.
- Take a database backup before applying them.
- The migration runner applies each statement on one connection without a
  transaction, because MySQL commits implicitly on DDL. If a statement fails
  partway, the schema is partially applied: restore the backup and correct the
  migration file before retrying. The runner reports the failing statement and
  the migration tag.
- `drizzle-kit migrate` can be used instead — it writes to the same
  `__drizzle_migrations` table in the same format.

## 5. Backups and restore

| Artefact | Method | Frequency | Notes |
|----------|--------|-----------|-------|
| MySQL | `mysqldump --single-transaction --routines --triggers` | Daily | Encrypt the dump at rest. |
| Document storage | Volume snapshot | Daily | Snapshots are consistent per volume. |
| Configuration | Version-controlled `.env` template plus the secret store | On change | Never stored in the database. |

### Restore rehearsal

1. Provision a clean MySQL 8.4 instance and a clean storage volume.
2. Restore the dump: `mysql -u <user> -p <database> < dump.sql`.
3. Restore the storage snapshot to the same volume path.
4. `npm run db:migrate` — the restored schema should already be at the latest
   version, so this is a no-op.
5. Start the API and confirm `GET /api/health` reports the database reachable.
6. Sign in as a seeded administrator and open a case with documents, then
   download a document to confirm the storage path is intact.
7. Record the time taken. The restore objective should be agreed with the
   business owner before launch.

## 6. Monitoring

| Signal | Where | Alert on |
|--------|-------|----------|
| Liveness | `GET /api/health` | A non-200 response. The health endpoint reports the database as reachable or not. |
| Error rate | Structured logs, `level >= 50` | A sustained increase. |
| Request latency | Structured logs, `durationMs` | A p95 above the agreed threshold. |
| Failed notifications | `notifications.deliveryStatus = 'FAILED'` | A rising count. |
| Storage usage | Volume metrics | Above 80% of the allocation. |
| Audit growth | `audit_events` row count | Unusual growth (a loop, or a scraping attempt). |

Logs are structured JSON with a `requestId` that is also returned to the
client in the error envelope, so a user-reported failure can be traced
end to end.

## 7. Operational runbooks

### A candidate cannot sign in

1. Check `users.is_active` for the account.
2. Check `auth_sessions` for a revoked session; a password change bumps
   `users.session_epoch` and invalidates every session.
3. Check `users.failed_login_attempts` and `users.locked_until`.
4. Confirm the identity: sign in with the Candidate ID as well as the email
   address.

### A case is stuck

1. `GET /api/cases/:caseId/history` shows the last transition, the actor and
   the reason.
2. `GET /api/cases/:caseId` shows the current status and version.
3. `GET /api/admin/audit?caseId=…` shows every action against the case.
4. Common causes: a clarification is still open; a mandatory check has no
   result; no scoring configuration is approved and active.

### A notification is not arriving

1. `GET /api/admin/notifications` (with `notification:manage`) and filter by
   `deliveryStatus = FAILED`.
2. `notifications.lastError` carries the provider's message.
3. `notification_delivery_attempts` records every attempt.
4. `npm run db:seed`-independent retry: call `retryFailedNotifications()` in
   `apps/api/src/services/notification.service.ts` from a scheduled job.
5. In-app notifications are unaffected by an email outage.

### A score cannot be generated

1. `422 PRECONDITION_FAILED` — `details.unresolvedChecks` lists the mandatory
   checks with no outcome, and `details.openClarifications` the open
   clarifications.
2. `422` with "No active, approved scoring configuration" — an administrator
   must approve and activate a configuration in `/admin/config`.

## 8. Scheduled jobs

The MVP does not run a scheduler. Two operations are designed to be run on a
schedule and are exposed as functions rather than as endpoints, so that they
can be triggered by cron, a queue worker, or an operator:

| Job | Function | Purpose |
|-----|----------|---------|
| Retry failed notifications | `retryFailedNotifications()` in `notification.service.ts` | Re-attempts failed email deliveries. |
| Purge expired sessions | *Not implemented* | `auth_sessions` rows older than the refresh-token lifetime can be deleted. Deliberately not automated while retention policy is unconfirmed (D-03). |

## 9. Health checks

`GET /api/health` returns `200` with `{ "status": "ok", "database": "reachable" }`
or `503` with `{ "status": "degraded", "database": "unreachable" }`. It performs
a real `SELECT 1`, so it detects a broken connection, not just a dead process.

## 10. Known limitations at launch

| Limitation | Detail |
|------------|--------|
| The consent wording is a placeholder | Must be replaced with the organisation's approved text before launch (D-02). |
| The scoring weights are illustrative | The seeded configuration is DRAFT and unapproved, so it cannot produce a production score until an administrator approves it (D-01). |
| No malware scanner | The integration point exists but reports `SKIPPED` (D-16). |
| No retention job | Nothing is deleted. The policy is unconfirmed (D-03). |
| No email in development | In-app notifications work; email requires SMTP configuration. |
| No SSO | Local accounts only (D-22). |
| No COSMO HRMS integration | Deliberately a future phase. |
| Report export is JSON only | PDF export is a later MVP step. |
