# 02 — Decisions Register

Decisions that **require organisation input**. Each entry states the working
assumption the implementation currently uses so that work can continue. Every
assumption is implemented as *configuration or data*, not as a hard-coded
constant, so changing the answer does not require a rewrite.

Status legend: **OPEN** (needs sign-off) · **ASSUMED** (working default in
place, safe to change) · **CONFIRMED** (locked in).

---

## D-01 — BGV scoring weights and threshold

| | |
|---|---|
| Status | **CONFIRMED — development default** |
| Question | Are the illustrative weights (Identity 20, Address 10, Education 20, Employment 30, Document Authenticity 10, Additional Verification 10) the final policy? Is 95% the final threshold? |
| Working assumption | Weights are **not** treated as approved. A `scoring_configurations` row must be created and explicitly approved by an authorised administrator before it becomes `ACTIVE` and usable for scoring. The seeded dev configuration carries the illustrative weights, threshold 95, `status = ACTIVE`, `is_approved = true` so scoring works out of the box in development. Before production use a new version should be approved with the organisation's final weights and threshold. |
| Impact if changed | None structurally — weights and threshold are rows. Changing them means approving a new configuration version. |
| Location | `scoring_configurations`, `scoring_config_components` |

### Component weight semantics (also OPEN)

How each check status maps to awarded points is not stated in the brief. Working
assumption, implemented as data in `scoring_config_components.outcome_multipliers`:

| Check status | Multiplier | Rationale |
|---|---|---|
| `VERIFIED` | 1.0 | fully satisfied |
| `PARTIALLY_VERIFIED` | 0.5 | half credit — **confirmation required** |
| `NOT_SUBMITTED` / `UNDER_VERIFICATION` / `CLARIFICATION_REQUIRED` | 0.0 | unresolved — normally blocks scoring entirely |
| `UNABLE_TO_VERIFY` | 0.0 | no credit, but does **not** block if the check is non-mandatory |
| `DISCREPANCY_FOUND` | 0.0 | no credit; triggers review |
| `REJECTED` | 0.0 | no credit |
| `WAIVED` / `NOT_APPLICABLE` | excluded from denominator | no credit, no penalty |

The "excluded from denominator" rule for waived / not-applicable checks is a
policy choice that materially changes the score. **Confirmation required.**

---

## D-02 — Declaration and consent wording

| | |
|---|---|
| Status | **OPEN — blocking for production launch** |
| Question | What exact declaration/consent text must candidates accept? Which version is current at launch? Who approves changes? |
| Working assumption | The consent table stores versioned text with an explicit `effective_from` and an `is_active` flag. The **development seed contains clearly-labelled placeholder wording that is not legal text** and is not presented as approved. Every submission records the exact version accepted. |
| Constraint | No legal wording has been invented in production code. The placeholder is stored as data so it can be replaced without a code change. |
| Location | `consent_versions`, `consent_acceptances` |

---

## D-03 — Retention periods

| | |
|---|---|
| Status | **ASSUMED — implemented** |
| Question | How long are candidate profiles, documents, audit events and scores retained? What is deleted and when? |
| Working assumption | **Nothing is hard-deleted.** User accounts are soft-deleted via a `deleted_at` column; the authentication middleware rejects users whose `deleted_at` is set. Admin user lists filter by `deleted_at` (`isDeleted` query parameter) — active users on the main page, deleted users on a separate `/admin/users/history` page. No automated purge job runs. Retention periods are configuration keys (`retention.documents.months`, `retention.audit.months`, …) that are present but with no default enforcement until policy is confirmed. |
| Constraint | Per the brief, legal rules are not invented. Retention, archival, deletion, correction, legal hold and third-party access are flagged for policy review. |
| Location | `system_config` (`retention.*`), `documents.deleted_at` |

---

## D-04 — Criminal / court-record checks

| | |
|---|---|
| Status | **OPEN — feature disabled** |
| Question | Is a criminal or court-record check appropriate and permitted for this use case and jurisdiction? |
| Working assumption | `CRIMINAL_RECORD` exists as a check type in the vocabulary but **no package seeds it**, no role holds a permission that creates it by default, and the admin API refuses to add it to a package while the `check.criminal_record.enabled` configuration flag is `false` (default). |
| Location | `system_config` (`check.criminal_record.enabled`) |

---

## D-05 — Maker-checker applicability and separation

| | |
|---|---|
| Status | **OPEN** |
| Question | Which findings require four-eyes review? Must the verifier and reviewer always differ? May a reviewer approve their own verification? |
| Working assumption | Maker-checker is **configurable per package** (`bgv_packages.requires_maker_checker`, default `true`). When enabled, the final approver must not be the user who recorded the last verification result. A reviewer *may* review their own check result only if `review.allow_self_review = false` is disabled — default `false` means self-review is blocked. |
| Location | `bgv_packages.requires_maker_checker`, `system_config` (`review.allow_self_review`) |

---

## D-06 — Candidate ID format, uniqueness scope and future invitation flow

| | |
|---|---|
| Status | **OPEN** |
| Question | What is the authoritative Candidate ID format? Is it globally unique, unique per company, or unique per package? Will an invitation/HRMS-linked process replace open signup? |
| Working assumption | Format is configurable (`candidate_id.pattern`, default `^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$` — deliberately permissive, **not** year-bearing) with an example rendering `CIQ-2026-000001` produced by a configurable formatter. Uniqueness is enforced on the `candidate_profiles.candidate_id` column (global unique). A duplicate is rejected with `409 CANDIDATE_ID_ALREADY_IN_USE`. |
| Note | The brief explicitly allows a year-bearing format but forbids hard-coding one. `candidate_id.example_format` holds the display example; the pattern is validated by regex, never by year. |
| Location | `system_config` (`candidate_id.pattern`, `candidate_id.example_format`, `candidate_id.format`) |

---

## D-07 — Profile fields required per package

| | |
|---|---|
| Status | **OPEN** |
| Question | Which profile fields are mandatory for a given BGV package? Is gender collected at all? Are PAN and passport details permitted to be stored? |
| Working assumption | Profile fields are **data** (`profile_field_definitions`) with `required` flags and per-package applicability. Gender is defined but **not required** by default. PAN/passport/licence fields exist but are stored encrypted and masked by default. The dev seed requires: full name, date of birth, email, mobile, current address, at least one education record and at least one employment record. |
| Location | `profile_field_definitions`, `bgv_package_profile_fields` |

---

## D-08 — Required documents per package

| | |
|---|---|
| Status | **OPEN** |
| Question | Exactly which document types are mandatory for each package, and is a specific list required per category? |
| Working assumption | `document_requirements` rows per package, each with `is_mandatory`. The dev seed creates a conservative standard package: one identity document, one address proof, one education document, one employment document, one authenticity document. |
| Location | `document_requirements`, `bgv_packages` |

---

## D-09 — Provisional scoring

| | |
|---|---|
| Status | **OPEN** |
| Question | May a score be produced while mandatory checks are still unresolved? |
| Working assumption | **No by default.** `scoring_configurations.allow_provisional = false`. Score generation returns `PRECONDITION_FAILED` listing the unresolved mandatory checks. A provisional score is possible only when explicitly enabled on an approved configuration. |
| Location | `scoring_configurations.allow_provisional` |

---

## D-10 — Below-threshold routing and candidate communication

| | |
|---|---|
| Status | **OPEN** |
| Question | Below threshold → automatic rejection, or always human review? What, if anything, is told to the candidate? |
| Working assumption | Below threshold **always** routes to `BGV_REVIEW_REQUIRED`. No automatic candidate rejection is sent on score alone. Candidate-facing notifications expose only coarse status labels; internal reasons and scores are never included unless `disclosure.show_score_to_candidate = true` (default `false`). |
| Location | `system_config` (`disclosure.show_score_to_candidate`, `disclosure.show_findings_to_candidate`) |

---

## D-11 — Wording and meaning of the "eligible" outcome

| | |
|---|---|
| Status | **OPEN** |
| Question | Does a passing score mean "Eligible for Final Interview", "Clear", or something organisation-specific? Does HR receive it? |
| Working assumption | The status vocabulary includes `ELIGIBLE_FOR_FINAL_INTERVIEW` and `BGV_APPROVED` as separate states: `BGV_APPROVED` = the BGV decision is approved; `ELIGIBLE_FOR_FINAL_INTERVIEW` = the candidate is eligible to progress. The transition `BGV_APPROVED → ELIGIBLE_FOR_FINAL_INTERVIEW` is performed by an authorised approver and is also the point where HR-level outcome notifications are sent. |
| Location | `case_status_history`, `notifications` |

---

## D-12 — Notification content and channel policy

| | |
|---|---|
| Status | **OPEN** |
| Question | Approved subject/body wording per event? Which events notify which roles? |
| Working assumption | Templates are rows (`notification_templates`) with placeholder substitution (`{{candidateName}}`, `{{caseNumber}}`, …). Templates are seeded with **functional, non-legal placeholder wording** clearly marked for replacement. No template contains document contents, PAN, passport numbers or internal findings. |
| Location | `notification_templates`, `system_config` (`notification.email.enabled`) |

---

## D-13 — Third-party and external access

| | |
|---|---|
| Status | **OPEN** |
| Question | Are verifiers (HR at the previous employer) contacted by CheckIQ? Does any third party get read access? |
| Working assumption | **No outbound contact is implemented.** The system records verification *outcomes* and evidence references entered by staff; it does not email previous employers. Candidate contact details are masked for staff without `profile:read:any`. No external API surface exists. |
| Location | — |

---

## D-14 — Correction and legal hold

| | |
|---|---|
| Status | **OPEN** |
| Question | How is a candidate data-correction request handled? Does a legal hold exist? |
| Working assumption | No deletion path exists at all in the MVP. `legal_hold` is a **flag on the case** (`bgv_cases.legal_hold`) that, when set, blocks any future purge job. Data correction is performed as a normal update that creates a new audit event preserving the previous value. |
| Location | `bgv_cases.legal_hold` |

---

## D-15 — Upload limits

| | |
|---|---|
| Status | **OPEN** |
| Question | Maximum file size? Maximum pages? Maximum versions retained? |
| Working assumption | `upload.max_file_size_bytes = 10 MiB`, `upload.max_versions_per_document = 10`, `upload.max_files_per_request = 10`. PDF page count is not validated. |
| Location | `system_config` (`upload.*`) |

---

## D-16 — Malware scanning

| | |
|---|---|
| Status | **OPEN** |
| Question | ClamAV, a hosted scanner, or accept the risk in early deployments? |
| Working assumption | A `ScannerPort` interface exists in the API with a default no-op implementation that reports `SKIPPED`. A document whose scan is not `CLEAN` is visible to verifiers but flagged; the `ScannerPort` is a single-file swap to a ClamAV TCP client. |
| Location | `apps/api/src/lib/scanner.ts` |

---

## D-17 — Session and token lifetimes

| | |
|---|---|
| Status | **OPEN** |
| Question | Acceptable session duration for candidates and staff? Mandatory re-authentication for sensitive actions? |
| Working assumption | Access token 15 minutes, refresh token 7 days with rotation and reuse detection, stored as an `httpOnly`, `SameSite=Lax`, `Secure` (production) cookie. Refresh tokens are stored **hashed** in `auth_sessions`. Rate limits: 10 attempts / 15 min per identifier+IP for login, 5 / hour / IP for signup. |
| Location | `system_config` (`auth.access_token_ttl_minutes`, …) |

---

## D-18 — Encryption key management

| | |
|---|
| Status | **OPEN** |
| Question | Where do encryption keys live? KMS, or environment-managed? Rotation policy? |
| Working assumption | Field-level encryption (AES-256-GCM) for sensitive identity fields using a key referenced by `system_config` (`encryption.pii_key_id`). The key material itself comes from the environment (`PII_ENCRYPTION_KEY`), never from the database. Key rotation is documented as a planned operation. |
| Location | `apps/api/src/lib/crypto.ts`, `system_config` |

---

## D-19 — Scope of HR visibility

| | |
|---|---|
| Status | **OPEN** |
| Question | May HR see individual check findings and verifier remarks, or only the final outcome? |
| Working assumption | HR holds `case:read:any` and `case:list:queue` and sees the **final outcome**, score and status, but individual check remarks are masked unless the caller also holds `verification:read`. This is the least-privilege default. |
| Location | `03-roles-and-permissions.md` |

---

## D-20 — Reopened cases

| | |
|---|---|
| Status | **OPEN** |
| Question | Can a closed case be reopened? By whom? Does the score survive? |
| Working assumption | `CLOSED` is terminal in the state machine. Reopening is a **privileged override** available only to `SUPER_ADMINISTRATOR`, performed through an explicit admin endpoint that writes an `CASE_REOPENED` audit event with a mandatory reason. The prior score history is preserved; the score is recomputed against the then-current configuration. |
| Location | `04-workflows-and-state-machine.md` |

---

## D-21 — Deployment topology

| | |
|---|---|
| Status | **OPEN** |
| Question | Where is this hosted? Is a managed MySQL available? |
| Working assumption | The API is stateless behind a reverse proxy terminating TLS; MySQL is a managed instance; document storage is a private volume mounted into the API container (local development) with an interface that can be backed by S3-compatible object storage later. Backups are MySQL dumps plus a storage-volume snapshot. |
| Location | `10-deployment-operations.md` |

---

## D-22 — Directory / SSO integration

| | |
|---|---|
| Status | **OPEN** |
| Question | Should staff authenticate against the corporate IdP? |
| Working assumption | Local accounts only. The authentication layer is isolated behind an `AuthProvider` interface so an OIDC provider can be substituted later without touching authorisation logic. |
| Location | `apps/api/src/modules/auth/auth-provider.ts` |

---

## Change-control

Any decision marked **OPEN** may be implemented differently without structural
change, because each is expressed as configuration or a database row. Decisions
that *would* require code changes are explicitly called out where relevant.
When a decision is confirmed, this register is updated with the date and the
confirming party.
