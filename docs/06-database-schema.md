# 06 — Database Schema

MySQL 8.4, `utf8mb4_0900_ai_ci`, UTC. The schema is defined in
`apps/api/src/db/schema/` as Drizzle tables and applied through the committed
SQL migrations in `apps/api/drizzle/`.

## 1. Design rules

1. **The Candidate ID is globally unique.** `candidate_profiles.candidate_id`
   carries a unique index. A duplicate signup is rejected; two accounts can
   never share a Candidate ID.
2. **History is append-only.** `verification_check_results`,
   `verification_check_results`, `case_status_history`, `bgv_scores`,
   `audit_events` and `document_versions` are never updated in place. A
   correction creates a new row and supersedes the previous one.
3. **No destructive deletion in the MVP.** Foreign keys use `RESTRICT` where
   history must survive, and `CASCADE` only for rows that have no independent
   meaning (a user's role assignment, a check result with its check).
4. **Timestamps are stored with millisecond precision** and in UTC. The
   connection sets `timezone: "Z"` and the server runs with
   `default-time-zone = '+00:00'`.
5. **Status is an explicit column**, never inferred. Status columns are
   `varchar` with an application-level enum so the vocabulary can evolve
   without an `ALTER TABLE` on a MySQL `ENUM`.

## 2. Table map

| Area | Tables |
|------|--------|
| Identity & access | `users`, `auth_sessions`, `roles`, `permissions`, `role_permissions`, `user_roles` |
| Candidate | `candidate_profiles`, `candidate_addresses`, `candidate_education`, `candidate_employments`, `candidate_profile_values` |
| Catalogue | `bgv_packages`, `bgv_package_profile_fields`, `bgv_package_checks`, `profile_field_definitions`, `document_categories`, `document_types`, `document_requirements`, `check_definitions` |
| Case | `bgv_cases`, `case_status_history`, `case_assignments`, `bgv_submission_events` |
| Documents | `documents`, `document_versions` |
| Verification | `verification_checks`, `verification_check_results`, `clarification_requests`, `clarification_responses` |
| Scoring | `scoring_configurations`, `scoring_config_components`, `bgv_scores` |
| Review & consent | `reviews`, `approvals`, `consent_versions`, `consent_acceptances` |
| Notifications | `notification_templates`, `notifications`, `notification_delivery_attempts` |
| Governance | `audit_events`, `system_config`, `sequences` |

## 3. Key relationships

```
users ──< user_roles >── roles ──< role_permissions >── permissions
  │
  └──< candidate_profiles ──< candidate_addresses
                │             ──< candidate_education
                │             ──< candidate_employments
                │             ──< candidate_profile_values
                │
                └──< bgv_cases ──< case_status_history
                        ├──< case_assignments
                        ├──< bgv_submission_events      (1 active submission per case)
                        ├──< documents ──< document_versions
                        ├──< verification_checks ──< verification_check_results
                        ├──< clarification_requests ──< clarification_responses
                        ├──< bgv_scores
                        ├──< reviews
                        ├──< approvals
                        └──< notifications
```

## 4. Constraints that protect the business rules

| Constraint | Purpose |
|------------|---------|
| `uq_candidate_profiles_candidate_id` | One account per Candidate ID. The database is the last line of defence against a duplicate. |
| `uq_candidate_profiles_user` | One profile per account. |
| `uq_submission_case` | A case can only be submitted once. The idempotency key is the application's guard; this is the database's. |
| `uq_submission_case_key` | A repeated request with the same key is a no-op. |
| `uq_documents_case_requirement` | One logical document per package requirement on a case. |
| `uq_document_versions_number` | Version numbers are unique per document. |
| `uq_document_versions_storage_key` | A stored object belongs to exactly one version. |
| `uq_verification_check_results_seq` | Result sequence numbers are unique per check. Allocated under a row lock. |
| `uq_verification_checks_case_def` | A check runs once per case. |
| `uq_scoring_configurations_version` | Configuration versions are unique and ordered. |
| `uq_notifications_dedup` | A repeated notification is not queued twice. |
| `uq_document_categories_code`, `uq_document_types_code`, `uq_check_definitions_code`, `uq_bgv_packages_code` | The catalogue has stable, unique codes. |

## 5. Indexes for the common searches

| Index | Query it serves |
|-------|-----------------|
| `ix_bgv_cases_status` | Queue filter by status. |
| `ix_bgv_cases_queue` (status, assigned_verifier_id) | "My assigned cases" queue. |
| `ix_bgv_cases_verifier`, `ix_bgv_cases_reviewer` | Assignment filters. |
| `ix_bgv_cases_submitted_at` | Date-range filters. |
| `ix_candidate_profiles_name` | Candidate name search. |
| `ix_verification_checks_status` | Unresolved-check queries. |
| `ix_clarification_requests_case` (case_id, status) | Open-clarification counts. |
| `ix_audit_events_case` (case_id, created_at) | The per-case audit trail. |
| `ix_audit_events_created` | The chronological audit view. |
| `ix_notifications_recipient` (recipient_user_id, created_at) | The notification inbox. |
| `ix_bgv_scores_case` (case_id, generated_at) | Score history. |

## 6. Deletion and retention

| Table | Behaviour |
|-------|-----------|
| `users` | Never deleted. `is_active = false` disables the account and bumps `session_epoch`, which invalidates every outstanding session. |
| `candidate_profiles` | Never deleted. The Candidate ID is retained so the history of a case stays attributable. |
| `documents` / `document_versions` | Never deleted. A superseded version remains downloadable by authorised staff for audit. |
| `audit_events` | Never deleted and never updated. There is no API route that can. |
| `bgv_scores` | Never deleted. A regenerated score supersedes the previous row. |
| `consent_acceptances` | Never deleted. Prior accepted versions stay queryable. |

A retention job is **not** implemented. The retention periods are configuration
keys with no value until the organisation confirms them (decision D-03). When a
retention job is added it must respect `bgv_cases.legal_hold`.

## 7. Transactions

Multi-record operations run in a single transaction:

| Operation | Records written together |
|-----------|--------------------------|
| Signup | `users`, `user_roles`, `candidate_profiles`, `bgv_cases`, `case_status_history`, `documents`, `verification_checks`, `auth_sessions`, audit events |
| Submission | `bgv_submission_events`, `bgv_cases`, `case_status_history`, `verification_checks`, audit event |
| Check result | `verification_check_results`, `verification_checks`, audit event |
| Clarification | `clarification_requests`, `verification_checks`, `documents`, `bgv_cases`, `case_status_history`, audit event |
| Score generation | `bgv_scores`, `bgv_cases`, `case_status_history`, audit event |
| Approval | `approvals`, `bgv_cases`, `case_status_history`, audit event |

If any statement fails the whole operation rolls back, and no partial state is
visible.

## 8. Optimistic concurrency

`bgv_cases.version` is incremented on every mutation. Updates are conditional:

```sql
UPDATE bgv_cases
   SET status = ?, version = version + 1
 WHERE id = ? AND version = ?;
```

When no row is affected, the caller was working from stale data and receives
`409 CONFLICT` with the current server state. The same guard protects
verification result sequence allocation, which takes a row lock
(`SELECT MAX(sequence) … FOR UPDATE`) so that two concurrent verifications
cannot claim the same sequence number.

## 9. Migration approach

- Migrations are generated as **reviewable SQL** under `apps/api/drizzle/` and
  committed. `drizzle-kit push` is never used against a shared or production
  database.
- `npm run db:generate` produces the SQL; `npm run db:migrate` applies it.
- The migration runner (`apps/api/src/db/migrate.ts`) applies statements on a
  single connection **without a transaction**, because MySQL commits implicitly
  on DDL. It records each migration in `__drizzle_migrations` using the same
  format as `drizzle-kit migrate`, so the two tools remain interchangeable.
- Migrations are forward-only. Reversing a migration is a separate, explicitly
  reviewed SQL file.
- `drizzle-kit` is configured with `strict: true`; column type changes that
  would lose data are surfaced rather than applied silently.

### MySQL-specific notes

Two MySQL 8.4 constraints shaped the schema and are worth recording, because
both produce errors that are easy to misdiagnose:

1. `TIMESTAMP(3) NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP` is
   **rejected** (`ERROR 1294`) — an expression default cannot be combined with
   an `ON UPDATE` clause, and the `ON UPDATE` precision must match the column
   precision. `updated_at` columns therefore use second precision
   (`timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP`), while
   event timestamps keep millisecond precision.
2. Foreign key constraint names are limited to 64 characters. Long
   auto-generated names are replaced with explicit short names through
   `foreignKey({ name, columns, foreignColumns })`.
