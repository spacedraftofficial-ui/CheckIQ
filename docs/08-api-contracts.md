# 08 — API Contracts

All endpoints are under `/api`. Request and response bodies are JSON unless
stated otherwise. The shared schemas live in `packages/contracts` and are the
single source of truth for both the server and the web client.

## 1. Conventions

### Authentication

| Header | Meaning |
|--------|---------|
| `Authorization: Bearer <token>` | Required for every protected endpoint. The token is the short-lived access token. |

The refresh token is an `httpOnly` cookie named `checkiq_refresh`, scoped to
`/api/auth`.

### Response envelope

Success:

```json
{ "data": { … } }
```

Paginated success:

```json
{
  "data": [ … ],
  "meta": { "page": 1, "pageSize": 25, "total": 42, "totalPages": 2 }
}
```

Error:

```json
{
  "error": {
    "code": "PRECONDITION_FAILED",
    "message": "A score cannot be produced while required checks are outstanding.",
    "details": { … },
    "requestId": "5a3c…"
  }
}
```

### Error codes

| Code | HTTP | Meaning |
|------|------|---------|
| `VALIDATION_ERROR` | 400 / 422 | The payload failed validation. `details` lists the offending fields. |
| `UNAUTHENTICATED` | 401 | No session, an expired session, or a revoked account. |
| `FORBIDDEN` | 403 | Authenticated, but the principal lacks the permission or the record is out of scope. |
| `NOT_FOUND` | 404 | The record does not exist, or the principal may not see it. |
| `CONFLICT` | 409 | A duplicate, or the record changed since the caller read it. |
| `CANDIDATE_ID_ALREADY_IN_USE` | 409 | The Candidate ID is already registered. |
| `INVALID_STATE_TRANSITION` | 409 | The requested status change is not permitted. |
| `PRECONDITION_FAILED` | 422 | A business precondition is not met. `details` lists what is missing. |
| `UPLOAD_REJECTED` | 422 | The file failed validation. |
| `RATE_LIMITED` | 429 | Too many requests. |
| `PAYLOAD_TOO_LARGE` | 413 | The request body is too large. |
| `INTERNAL_ERROR` | 500 | An unexpected failure. The message is deliberately generic. |

### Pagination and filtering

List endpoints accept `page` (default 1) and `pageSize` (default 25, maximum
100). Filters are applied in SQL together with the caller's scope predicate, so
the row count and the returned rows can never disagree.

### Concurrency

Mutating endpoints accept an optional `expectedVersion` (the case's
`version`). When supplied and stale, the response is `409 CONFLICT` with the
current `currentVersion` and `currentStatus`.

## 2. Authentication

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `POST` | `/api/auth/signup` | Public | Register a candidate with an entered Candidate ID. No invitation is required. |
| `POST` | `/api/auth/login` | Public | Sign in with an email address or a Candidate ID. |
| `POST` | `/api/auth/refresh` | Public (cookie) | Rotate the refresh token and issue a new access token. |
| `POST` | `/api/auth/logout` | Public (cookie) | Revoke the current session. |
| `GET` | `/api/auth/me` | Authenticated | The current session's user, roles and permissions. |
| `POST` | `/api/auth/change-password` | Authenticated | Change the password. Invalidates every other session. |

### `POST /api/auth/signup`

```jsonc
{
  "candidateId": "CIQ-2026-000001",   // required, 3–64 chars, [A-Za-z0-9._-]
  "fullName": "Asha Menon",
  "email": "asha@example.com",
  "mobile": "+919812345678",
  "password": "Str0ng!Passw0rd",
  "confirmPassword": "Str0ng!Passw0rd",
  "company": "Acme Corp",              // optional
  "department": "Engineering",         // optional
  "position": "Senior Engineer"        // optional
}
```

`201` → `{ "data": { "user": {…}, "accessToken": "…", "expiresInSeconds": 900 } }`

`409 CANDIDATE_ID_ALREADY_IN_USE` →

```jsonc
{
  "error": {
    "code": "CANDIDATE_ID_ALREADY_IN_USE",
    "message": "This Candidate ID is already registered. Sign in with the account you created, or contact support if you believe this is an error.",
    "details": { "candidateId": "CIQ-2026-000001", "canSignIn": true, "supportContactConfigured": true }
  }
}
```

A duplicate **never** overwrites or merges the existing account or case.

## 3. Candidate

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/api/profile` | `case:read:own` | The candidate's own profile. |
| `PUT` | `/api/profile` | `profile:write:own` | Update the profile. Repeating groups are replaced as a set. |
| `GET` | `/api/profile/fields` | Authenticated | The configurable profile field definitions. |
| `GET` | `/api/consent/current` | Authenticated | The active declaration wording and whether it has been accepted. |
| `POST` | `/api/consent/accept` | Authenticated | Accept the current declaration version. |
| `GET` | `/api/dashboard` | Authenticated | What to do next, what has been received, whether action is required. |
| `GET` | `/api/notifications` | `notification:read:own` | The candidate's notifications. |
| `GET` | `/api/notifications/unread-count` | `notification:read:own` | The unread count. |
| `POST` | `/api/notifications/:id/read` | `notification:read:own` | Mark a notification as read. |

### `GET /api/dashboard`

```jsonc
{
  "data": {
    "caseId": "…",
    "candidateId": "CIQ-2026-000001",
    "caseNumber": "BGV-2026-000001",
    "status": "DOCUMENT_UPLOAD_IN_PROGRESS",
    "statusLabel": "Action required",   // candidate-facing wording
    "submittedAt": null,
    "actionRequired": true,
    "readiness": {
      "ready": false,
      "missingProfileFields": ["currentAddress"],
      "missingDocuments": [{ "requirementId": "…", "label": "Address proof", "status": "MISSING", "isMandatory": true }],
      "consent": { "required": true, "currentVersionId": "…", "accepted": false },
      "openClarifications": []
    },
    "documents": [{ "id": "…", "label": "PAN card", "status": "MISSING", "isMandatory": true, "uploaded": false, "reviewerRemarks": null }],
    "clarifications": []
  }
}
```

The dashboard deliberately does **not** disclose the internal findings, the
verification sources, the score or the eligibility result.

## 4. Documents

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/api/cases/:caseId/documents` | Case scope | The documents of a case. |
| `POST` | `/api/cases/:caseId/documents/:requirementId/upload` | Case scope | Upload or replace a document (`multipart/form-data`, field `file`). |
| `GET` | `/api/documents/:documentId` | Case scope | One document. |
| `GET` | `/api/documents/:documentId/versions` | Case scope | The version history. |
| `GET` | `/api/documents/:documentId/versions/:versionId/download` | Case scope + `verification:read` (staff) | Download a stored file. |

Upload responses:

```jsonc
{
  "data": {
    "document": {
      "id": "…", "requirementId": "…", "caseId": "…",
      "categoryCode": "IDENTITY", "documentTypeCode": "PAN_CARD", "label": "PAN card",
      "status": "UPLOADED", "isMandatory": true,
      "currentVersion": {
        "id": "…", "versionNumber": 1, "originalFilename": "pan.png",
        "mimeType": "image/png", "sizeBytes": 70120,
        "checksumSha256": "…", "uploadedAt": "2026-10-22T09:00:00.000Z",
        "uploadedBy": "…", "isCurrent": true, "malwareScanStatus": "SKIPPED"
      },
      "versionCount": 1, "assignedVerifierId": null, "assignedVerifierName": null,
      "verifiedAt": null, "reviewerRemarks": null, "evidenceReference": null,
      "createdAt": "…", "updatedAt": "…"
    }
  }
}
```

Rejected uploads return `422 UPLOAD_REJECTED` with a message that names the
problem in plain language ("The file content is text/plain, which is not
accepted. Allowed formats: PDF, JPG, PNG.").

## 5. Cases

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `POST` | `/api/cases` | `case:create` | Open a case for a candidate who has already registered. |
| `GET` | `/api/cases` | `case:list:queue` / `case:read:own` | Permission-aware case search. |
| `GET` | `/api/cases/queue-counts` | `case:list:queue` | Queue counts by status. |
| `GET` | `/api/cases/:caseId` | Case scope | Case detail. |
| `GET` | `/api/cases/:caseId/history` | Case scope | The status history. |
| `GET` | `/api/cases/:caseId/readiness` | Case scope | The submission readiness evaluation. |
| `POST` | `/api/cases/:caseId/submit` | `case:read:own` | Submit. Idempotent. |
| `POST` | `/api/cases/:caseId/assign` | `case:assign` | Assign a verifier or reviewer. |

### `GET /api/cases` filters

`search`, `candidateId`, `status` (repeatable), `assignedVerifierId`,
`company`, `department`, `position`, `submittedFrom`, `submittedTo`,
`scoreMin`, `scoreMax`, `page`, `pageSize`.

### `POST /api/cases`

```jsonc
{
  "candidateId": "CIQ-2026-000001",
  "packageId": "…",          // optional; the active default package is used
  "company": "Acme Corp",     // optional
  "department": "Engineering",
  "position": "Senior Engineer"
}
```

A candidate may hold **one open case per package**. A candidate who has
already registered but has no case for the requested package gets one. A
candidate with an open case for that package receives `409 CONFLICT` with the
existing case number. A Candidate ID that is not registered receives
`422` — a case belongs to a candidate profile, and a profile belongs to an
account, so the candidate must exist first.

The case is created in `DOCUMENT_UPLOAD_IN_PROGRESS` with the package's
documents and checks instantiated, an audit event is written, and the candidate
is notified that documents are required.

### `POST /api/cases/:caseId/submit`

```jsonc
{ "idempotencyKey": "submit-<caseId>-<uuid>", "confirmDeclaration": true }
```

`201` → submitted. `200` → already submitted (replay with the same key).
`409 CONFLICT` → already submitted with a different key.
`422 PRECONDITION_FAILED` → `details` contains the outstanding items:

```jsonc
{
  "error": {
    "code": "PRECONDITION_FAILED",
    "message": "Some required information is still outstanding.",
    "details": {
      "profileFields": ["currentAddress"],
      "documents": [{ "requirementId": "…", "label": "Address proof", "status": "MISSING" }],
      "consent": { "required": true, "currentVersionId": "…", "accepted": false },
      "openClarifications": []
    }
  }
}
```

## 6. Verification

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/api/cases/:caseId/checks` | Case scope | The checks. A candidate sees the status only. |
| `GET` | `/api/cases/:caseId/checks/:checkId/results` | `verification:read` | The append-only result history. |
| `POST` | `/api/cases/:caseId/checks/:checkId/result` | `verification:record` | Record a result. |
| `POST` | `/api/cases/:caseId/verification/start` | `verification:record` | `SUBMITTED` → `VERIFICATION_IN_PROGRESS`. |
| `POST` | `/api/cases/:caseId/verification/complete` | `verification:record` | `VERIFICATION_IN_PROGRESS` → `VERIFICATION_COMPLETED`. |
| `GET` | `/api/cases/:caseId/clarifications` | Case scope | The clarification threads. |
| `POST` | `/api/cases/:caseId/clarifications` | `clarification:create` | Raise a clarification. |
| `POST` | `/api/clarifications/:id/respond` | `clarification:respond:own` | The candidate responds. |
| `POST` | `/api/clarifications/:id/close` | `clarification:close` | Close a clarification, with a reason. |

Recording a result:

```jsonc
{
  "status": "DISCREPANCY_FOUND",          // one of the check statuses
  "outcomeCode": "NAME_MISMATCH",          // optional
  "remarks": "The name on the document differs from the profile",  // required for DISCREPANCY_FOUND / REJECTED / UNABLE_TO_VERIFY
  "evidenceReference": "Confirmation ref 12345",                    // optional
  "requiresReview": true                                            // optional
}
```

A candidate who responds after the due date is accepted and the response is
recorded as late (`isLate: true`).

## 7. Scoring and review

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/api/cases/:caseId/score` | `score:read` | The current score. |
| `GET` | `/api/cases/:caseId/scores` | `score:read` | The score history. |
| `POST` | `/api/cases/:caseId/score/generate` | `score:generate` | Compute the score. |
| `POST` | `/api/cases/:caseId/score/adjust` | `score:adjust` | Manual adjustment. A reason is mandatory. |
| `GET` | `/api/cases/:caseId/reviews` | `review:read` | The reviews and approvals. |
| `POST` | `/api/cases/:caseId/review` | `review:decide` | Record a maker-checker decision. |
| `POST` | `/api/cases/:caseId/approval` | `approval:decide` | Record the final approval decision. |

A score response:

```jsonc
{
  "data": {
    "id": "…", "caseId": "…",
    "scoringConfigVersion": 1,
    "totalScore": 95.00,
    "threshold": 95,
    "outcome": "ABOVE_THRESHOLD",        // ABOVE_THRESHOLD | BELOW_THRESHOLD | PROVISIONAL
    "isProvisional": false,
    "components": [{ "checkTypeCodes": ["IDENTITY"], "label": "Identity", "weight": 20, "ratio": 1, … }],
    "generatedAt": "…", "generatedById": "…",
    "adjustment": null
  }
}
```

Scoring is blocked while a mandatory check is unresolved
(`422 PRECONDITION_FAILED` with `details.unresolvedChecks`) or while a
clarification is open. A below-threshold result routes the case to
`BGV_REVIEW_REQUIRED`; it never rejects a candidate automatically.

## 8. Reporting

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/api/cases/:caseId/report` | `report:read` | The internal BGV report. |

The report contains the report id and number, the Candidate ID, the candidate
name and position, the company and department, the initiation, submission and
completion dates, each individual verification result, the discrepancies and
permitted remarks, the final score with its configuration version, the
eligibility result, the verifier, reviewer and approver identities and the
approval timestamp. Nothing beyond that purpose is included, and the report is
never available to a candidate.

## 9. Administration

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/api/admin/users` | `user:manage`, `role:manage` | List users. |
| `POST` | `/api/admin/users` | `user:manage` | Create a staff account. |
| `PATCH` | `/api/admin/users/:id` | `user:manage`, `permission:manage` | Update a user, including their roles. |
| `GET` | `/api/admin/roles` | `role:manage`, `config:read` | The roles and their permissions. |
| `GET` | `/api/admin/packages` | `config:read`, `package:manage` | The BGV packages. |
| `GET` | `/api/admin/document-categories` | `config:read`, `documentcategory:manage` | The document catalogue. |
| `GET` | `/api/admin/config` | `config:read` | The system configuration. |
| `PATCH` | `/api/admin/config/:key` | `config:manage` | Change a configuration value. |
| `GET` | `/api/admin/scoring-configs` | `config:read`, `score:generate` | The scoring configurations. |
| `POST` | `/api/admin/scoring-configs` | `config:manage` | Create a draft configuration. |
| `POST` | `/api/admin/scoring-configs/:id/approve` | `config:manage` | Approve a configuration. |
| `POST` | `/api/admin/scoring-configs/:id/activate` | `config:manage` | Activate an approved configuration. |
| `PUT` | `/api/admin/notification-templates/:event/:channel` | `notification:manage` | Upsert a template. |
| `GET` | `/api/admin/audit` | `audit:read` | Read the audit trail. There is no write, update or delete route. |

## 10. Notification events

The notification service is triggered by the business events below. Each event
has a template per channel; the seeded templates are functional placeholder
wording that an administrator can replace.

| Event | Recipient | Triggered by |
|-------|-----------|--------------|
| `ACCOUNT_CREATED` | The candidate | Signup |
| `PROFILE_COMPLETED` | The candidate | The profile becomes complete |
| `DOCUMENTS_REQUIRED` | The candidate | A case is opened, or the profile completes with documents outstanding |
| `CASE_ASSIGNED` | The assigned verifier | A verifier is assigned |
| `DOCUMENT_UPLOADED` | The assigned verifier | A document is uploaded |
| `CASE_SUBMITTED` | The candidate | The candidate submits |
| `CLARIFICATION_REQUESTED` | The candidate | A verifier raises a clarification |
| `CLARIFICATION_RESPONDED` | The verifier who asked | The candidate responds |
| `CLARIFICATION_RESUBMITTED` | The verifier who asked | A replacement document is uploaded while a clarification is open |
| `VERIFICATION_IN_PROGRESS` | The candidate | Verification starts |
| `BGV_COMPLETED` | The candidate | Verification completes |
| `SCORE_GENERATED` | The assigned reviewer | A score is produced |
| `REVIEW_REQUIRED` | The assigned reviewer | The case routes for review |
| `BGV_OUTCOME` | The candidate | The case is approved |
| `ADMIN_NOTICE` | The affected user | Their roles or access change |

A deduplication key stops the same event being queued twice for the same
recipient and case. A failed delivery is recorded against the notification and
retried; it never rolls back the business transaction that produced it.

## 11. Operational endpoints

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/api/health` | Public | Liveness and database reachability. |

## 12. Access summary

| Capability | Required permission |
|------------|---------------------|
| Read a candidate's own case, profile, documents, clarifications | `case:read:own`, `profile:write:own`, `clarification:respond:own` |
| Work the operations queue | `case:list:queue` plus `case:read:assigned` or `case:read:any` |
| Record a verification result | `verification:record` |
| See individual findings | `verification:read` |
| Raise or close a clarification | `clarification:create`, `clarification:close` |
| Decide a review, approve a case | `review:decide`, `approval:decide` |
| Generate or adjust a score | `score:generate`, `score:adjust` |
| Read the internal report | `report:read` |
| Manage users, roles, packages, configuration | `user:manage`, `role:manage`, `permission:manage`, `package:manage`, `documentcategory:manage`, `config:manage` |
| Read the audit trail | `audit:read` |

A permission alone never grants access to a record. The resource-scope check
runs on top of it.
