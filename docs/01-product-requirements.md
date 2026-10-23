# 01 — Product Requirements

## 1. Problem statement

After a candidate clears a technical interview round, the organisation must
verify identity, address, education, employment and document authenticity
before a final interview or offer is progressed. Today this is typically handled
by spreadsheets, email threads and shared drives. CheckIQ centralises the
workflow: one case per candidate, one status per case, an explicit trail of who
checked what and when, and a defensible audit record.

## 2. Goals

| ID | Goal | Success signal |
|----|------|-----------------|
| G1 | Self-service candidate onboarding | Candidate can sign up, complete profile, upload documents and submit without staff intervention |
| G2 | Structured verification | Each check component carries its own independent status and outcome |
| G3 | Auditable decisions | Every state change, document action, score and approval has an append-only audit event |
| G4 | Least-privilege access | A candidate cannot read another candidate's data by changing an identifier in a URL |
| G5 | Configurability | Packages, document requirements, checks, scoring weights and thresholds are administered, not coded |
| G6 | Operational clarity | Staff see queue counts, blockers and next actions without manual reporting |

## 3. Non-goals (MVP)

- HRMS, ATS, recruitment portal, payroll, attendance, onboarding, employee master
- COSMO HRMS integration (future phase)
- SMS / WhatsApp / push notification channels (email + in-app only)
- OTP / MFA login flows
- PDF export of the BGV report (JSON/HTML report data only)
- Criminal record / court-record checks (code path exists but disabled pending
  organisation confirmation — see D-11)
- Bulk/batch operations, CSV import of candidate data
- Multi-tenant SaaS tenancy (single organisation per deployment)

## 4. Actors

| Actor | Role code | Primary responsibility |
|-------|-----------|------------------------|
| Candidate | `CANDIDATE` | Own profile, documents, clarifications; view own case status |
| BGV Executive | `BGV_EXECUTIVE` | Perform assigned verification checks, request clarifications |
| BGV Reviewer / Manager | `BGV_REVIEWER` | Review material findings, decide maker-checker reviews |
| HR / Recruitment | `HR_RECRUITMENT` | Create/manage cases, view authorised recruitment outcomes |
| Administrator | `ADMINISTRATOR` | Users, categories, packages, configuration, scoring rules |
| Super Administrator | `SUPER_ADMINISTRATOR` | System governance, role/permission management, hard overrides |

Full permission matrix: [`03-roles-and-permissions.md`](./03-roles-and-permissions.md).

## 5. Candidate lifecycle (happy path)

1. Open CheckIQ → enter Candidate ID → continue (no invitation validation).
2. Create account with email, mobile, password.
3. Complete required profile fields (validated against the package's profile
   field configuration).
4. Read and accept the current declaration/consent version.
5. View required documents for the assigned BGV package.
6. Upload documents (versioned; replacements preserve prior versions).
7. Submit. Server validates readiness, records the submission timestamp and
   returns a confirmation.
8. Receive configured notifications (email + in-app).
9. Respond to clarification requests with text and/or replacement documents.
10. View permitted status updates until the case is closed.

## 6. BGV operations lifecycle

1. Staff open the operations queue, filtered by permission scope.
2. A case is assigned a verifier; required checks are instantiated from the
   package.
3. The verifier works each check independently: records outcome, evidence
   reference, remarks.
4. If information is missing, the verifier raises a clarification request naming
   the affected item, issue, required action, remarks and optional due date.
5. The candidate responds; the verifier records the final outcome.
6. A reviewer performs the maker-checker review where policy requires it.
7. When all mandatory checks are resolved, the server computes the score using
   the active, approved scoring configuration version.
8. Below threshold → `BGV_REVIEW_REQUIRED` (or
   `BELOW_BGV_ELIGIBILITY_THRESHOLD` once reviewed). At/above threshold and all
   approvals complete → `ELIGIBLE_FOR_FINAL_INTERVIEW`.
9. An authorised approver approves or routes the case for further review.
10. The final status is recorded and only role-appropriate notifications are sent.

## 7. Functional requirements

### FR-1 Identity and access
- FR-1.1 A candidate may sign up by entering a Candidate ID that has not been
  pre-registered.
- FR-1.2 Possession of a Candidate ID is **not** an authorisation factor. Every
  protected operation requires an authenticated session.
- FR-1.3 The Candidate ID is stored once, authoritatively, and is associated
  with exactly one user account and at most one open case per package.
- FR-1.4 A duplicate Candidate ID produces an explicit `409 CANDIDATE_ID_ALREADY_IN_USE`
  response with recovery guidance — never a silent overwrite or merge.
- FR-1.5 Candidates may access only their own profile, documents, cases and
  notifications. Cross-tenant access attempts are logged and denied.

### FR-2 Profile
- FR-2.1 Profile fields are configurable per organisation with type, required
  flag and validation metadata.
- FR-2.2 Only fields required by the candidate's assigned BGV package are
  requested.
- FR-2.3 Sensitive values (PAN, passport, licence) are stored encrypted at rest
  and masked in responses unless the caller holds an explicit permission.

### FR-3 Documents
- FR-3.1 Document categories and per-package requirements are administrator
  managed.
- FR-3.2 Accepted types: PDF, JPG, JPEG, PNG. Extensions, MIME types, file size
  and content signatures are all validated server-side.
- FR-3.3 Uploads are stored under opaque, non-guessable object keys in private
  storage, never in a publicly served directory.
- FR-3.4 Uploads are versioned. Replacing a document creates a new version and
  supersedes — never mutates — the previous one.
- FR-3.5 Every view and download is recorded in the audit trail.
- FR-3.6 A malware scanning integration point exists (`ScannerPort`); the
  default implementation reports `SKIPPED` and is replaceable with ClamAV or a
  hosted scanner.

### FR-4 Consent
- FR-4.1 The organisation's approved declaration and consent text is versioned.
- FR-4.2 Acceptance records the version, timestamp, account, Candidate ID and
  audit metadata.
- FR-4.3 Prior accepted versions remain queryable for audit purposes.
- FR-4.4 Submission is blocked until the current version is accepted (policy
  configurable).

### FR-5 Submission
- FR-5.1 Submission requires: profile complete, all mandatory documents
  present and in an acceptable state, current consent accepted.
- FR-5.2 Missing items are returned as a structured list — never a generic
  error.
- FR-5.3 Submission is idempotent. A client-supplied idempotency key plus a
  unique constraint on `(case_id, idempotency_key)` guarantees at most one
  submission event per case.
- FR-5.4 A failed notification never rolls back a successful submission.

### FR-6 Verification
- FR-6.1 Every check component carries an independent status.
- FR-6.2 A case is never marked verified because a subset of checks passed.
- FR-6.3 Each check records status, verifier, timestamps, findings, remarks,
  evidence reference and review history.
- FR-6.4 The organisation configures which checks are mandatory and which
  outcomes require additional review.

### FR-7 Clarification
- FR-7.1 A clarification request names the affected check and/or document, the
  issue, the required action, remarks and an optional due date.
- FR-7.2 Multiple simultaneous clarifications are supported and tracked
  independently.
- FR-7.3 Responding after the due date is allowed and recorded as late.
- FR-7.4 A mistaken closure is reversible by an authorised user with a
  recorded reason; the original request, responses and closure history are
  preserved.

### FR-8 Scoring and eligibility
- FR-8.1 Scoring is driven by an explicit, versioned, admin-approved
  configuration.
- FR-8.2 Every generated score records the configuration version used and the
  per-component inputs.
- FR-8.3 Scores are not calculated while mandatory checks are unresolved
  (unless the configuration explicitly enables provisional scoring).
- FR-8.4 Manual score adjustment requires a dedicated permission, a reason, and
  produces an audit event and a new score history entry.
- FR-8.5 A below-threshold score routes the case for review; it never
  auto-rejects a candidate.

### FR-9 Review and approval
- FR-9.1 Maker-checker separation is configurable and enforced on the server.
- FR-9.2 Self-approval is rejected when separation applies.
- FR-9.3 A reviewer may return a case for further work with a reason; the
  original finding and review history are preserved.

### FR-10 Notifications
- FR-10.1 A central notification service renders templates and records
  delivery attempts per channel.
- FR-10.2 Channels: email, in-app. SMS is a future integration.
- FR-10.3 Delivery failures are retried and surfaced; they never revert the
  business transaction that triggered them.
- FR-10.4 Messages exclude document contents and unnecessary personal data.

### FR-11 Audit
- FR-11.1 Audit events are append-only and outside the reach of normal
  application users — no update or delete path exists in the API.
- FR-11.2 Each event records who, what, when, which record, previous value,
  new value and a reason where applicable.
- FR-11.3 Secrets, passwords, OTPs and document contents are excluded from
  audit details.

### FR-12 Reporting
- FR-12.1 An internal BGV report exposes the fields listed in
  [`01` §18 of the brief](./01-product-requirements.md#12-reporting) to
  authorised roles only.

## 8. Non-functional requirements

| ID | Requirement | Implementation |
|----|-------------|----------------|
| NFR-1 | Authoritative server | All business rules in `apps/api`; client is a view |
| NFR-2 | Responsive candidate UI | 360 px → 1440 px; keyboard operable; labelled controls |
| NFR-3 | Idempotent writes | Idempotency keys on submit; optimistic concurrency (`version`) on cases |
| NFR-4 | Auditability | Append-only audit log with actor, diff and reason |
| NFR-5 | PII minimisation | Field-level masking; no sensitive values in logs, URLs or client storage |
| NFR-6 | Rate limiting | Auth, signup, upload and sensitive endpoints |
| NFR-7 | Deployability | Containerised, env-driven configuration, reversible migrations |
| NFR-8 | Testability | Unit + integration tests for business rules and authorisation |

## 9. Reporting scope

The internal BGV report contains: report ID/number, Candidate ID, candidate
name and position, company/business unit, initiation/submission/completion
dates, individual verification results, discrepancies and permitted remarks,
final score with scoring configuration version, eligibility result, verifier /
reviewer / approver identities and the approval timestamp.

Access is restricted to roles holding `report:read`. The report contains no
data beyond its stated purpose.

## 10. Out-of-scope future phases

| Phase | Item |
|-------|------|
| F1 | COSMO HRMS integration (candidate master sync, status push-back) |
| F2 | OTP / invitation-based candidate registration |
| F3 | SMS and additional notification channels |
| F4 | PDF report export with digital signature |
| F5 | External verification agency integrations (education/employment APIs) |
| F6 | Criminal record and court-record checks (conditional on D-11) |
