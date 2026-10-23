# 04 — Workflows and State Machine

## 1. Master case status

`bgv_cases.status` is the authoritative master status. Every value in
`CASE_STATUSES` (packages/contracts) is meaningful, but the **initial
open-signup workflow does not use the invitation states**. A candidate who
signs up with a Candidate ID starts at `DOCUMENT_UPLOAD_IN_PROGRESS` — they are
never forced through `BGV_INVITED` or `REGISTRATION_PENDING`.

| Status | Meaning |
|--------|---------|
| `DRAFT` | Case created but not yet visible to the candidate |
| `BGV_INVITED` | Reserved for a future invitation workflow. Not used in the MVP |
| `REGISTRATION_PENDING` | Reserved for a future invitation workflow. Not used in the MVP |
| `DOCUMENT_UPLOAD_IN_PROGRESS` | Candidate is completing profile, consent and documents |
| `SUBMITTED` | Candidate submitted; verification not yet started |
| `VERIFICATION_IN_PROGRESS` | At least one check has a recorded result; work is ongoing |
| `CLARIFICATION_REQUIRED` | At least one clarification request is open |
| `VERIFICATION_COMPLETED` | All mandatory checks are resolved; score not yet generated |
| `BGV_SCORE_GENERATED` | A score exists; review/approval outcome pending |
| `BGV_REVIEW_REQUIRED` | Routed for human review (below threshold, discrepancy, or reviewer request) |
| `BELOW_BGV_ELIGIBILITY_THRESHOLD` | Reviewed and confirmed below the configured threshold |
| `BGV_APPROVED` | The BGV decision is approved |
| `ELIGIBLE_FOR_FINAL_INTERVIEW` | Candidate is cleared to progress |
| `CLOSED` | Terminal |

## 2. Valid transitions

The backend owns this table. A transition not listed here is rejected with
`409 INVALID_STATE_TRANSITION`, and the rejection is audited.

| From | To | Actor | Precondition |
|------|----|-------|--------------|
| `DRAFT` | `DOCUMENT_UPLOAD_IN_PROGRESS` | system (case creation) | Candidate account exists |
| `DOCUMENT_UPLOAD_IN_PROGRESS` | `SUBMITTED` | Candidate | Profile complete, all mandatory documents present, current consent accepted, idempotency key supplied |
| `SUBMITTED` | `VERIFICATION_IN_PROGRESS` | BGV Executive / Reviewer / Admin | Verifier assigned |
| `VERIFICATION_IN_PROGRESS` | `CLARIFICATION_REQUIRED` | BGV Executive / Reviewer | At least one open clarification request |
| `CLARIFICATION_REQUIRED` | `VERIFICATION_IN_PROGRESS` | BGV Executive / Reviewer | All clarifications responded to or closed |
| `VERIFICATION_IN_PROGRESS` | `VERIFICATION_COMPLETED` | BGV Executive / Reviewer / Admin | All mandatory checks resolved; no open clarifications |
| `VERIFICATION_IN_PROGRESS` | `BGV_REVIEW_REQUIRED` | BGV Reviewer / Admin | A check recorded `DISCREPANCY_FOUND` requiring review |
| `VERIFICATION_COMPLETED` | `BGV_SCORE_GENERATED` | system (score generation) | Score successfully computed with an approved scoring configuration |
| `BGV_SCORE_GENERATED` | `BGV_REVIEW_REQUIRED` | system | Score below threshold |
| `BGV_SCORE_GENERATED` | `BGV_APPROVED` | BGV Reviewer / HR | Score at or above threshold, maker-checker satisfied, no open clarifications, approver ≠ maker |
| `BGV_REVIEW_REQUIRED` | `BGV_APPROVED` | BGV Reviewer / HR | Reviewer decision recorded; score above threshold |
| `BGV_REVIEW_REQUIRED` | `BELOW_BGV_ELIGIBILITY_THRESHOLD` | BGV Reviewer | Reviewer confirms below threshold |
| `BGV_REVIEW_REQUIRED` | `VERIFICATION_IN_PROGRESS` | BGV Reviewer | Reviewer returns the case for more work, with a reason |
| `BELOW_BGV_ELIGIBILITY_THRESHOLD` | `BGV_APPROVED` | BGV Reviewer | Approver overrides the below-threshold outcome (reason required) |
| `BELOW_BGV_ELIGIBILITY_THRESHOLD` | `VERIFICATION_IN_PROGRESS` | BGV Reviewer | Returned for further work |
| `BGV_APPROVED` | `ELIGIBLE_FOR_FINAL_INTERVIEW` | BGV Reviewer / HR | Approval recorded |
| `BGV_APPROVED` | `CLOSED` | BGV Reviewer / HR / Admin | Outcome recorded and notifications dispatched |
| `ELIGIBLE_FOR_FINAL_INTERVIEW` | `CLOSED` | BGV Reviewer / HR / Admin | — |
| `BELOW_BGV_ELIGIBILITY_THRESHOLD` | `CLOSED` | BGV Reviewer / HR / Admin | — |

### Illegal transitions (examples)

- `DOCUMENT_UPLOAD_IN_PROGRESS → BGV_APPROVED` — no submission yet
- `SUBMITTED → BGV_SCORE_GENERATED` — verification has not run
- `CLOSED → *` — terminal; only the privileged reopen override exists
- `BGV_APPROVED → VERIFICATION_IN_PROGRESS` — reopen via a reviewed decision,
  not a silent back-transition

## 3. Transition recording

Every transition writes a `case_status_history` row containing:

```
id, case_id, from_status, to_status, actor_id, actor_role, reason,
created_at, metadata (JSON)
```

`reason` is mandatory for: reviewer returns, overrides, admin-forced
transitions, and reopening.

## 4. Concurrency control

`bgv_cases.version` is an integer incremented on every mutation. Clients that
mutate a case send `If-Match`-style `expectedVersion` in the request body (or
`If-Match` header). The update is:

```sql
UPDATE bgv_cases
   SET status = ?, version = version + 1, updated_at = NOW()
 WHERE id = ? AND version = ?;
```

If `affectedRows = 0`, another actor changed the case first and the API
returns `409 CONFLICT` with the current server state so the client can refresh.
Optimistic locking is used rather than pessimistic locks so that verification
work is never blocked by a long-running transaction.

## 5. Check-level status machine

Each `verification_checks` row has its own status, independent of the case.

```
NOT_SUBMITTED → SUBMITTED → UNDER_VERIFICATION → ┬ VERIFIED
                                                 ├ PARTIALLY_VERIFIED
                                                 ├ UNABLE_TO_VERIFY
                                                 ├ DISCREPANCY_FOUND → UNDER_VERIFICATION (after clarification)
                                                 └ REJECTED
UNDER_VERIFICATION → CLARIFICATION_REQUIRED → UNDER_VERIFICATION
```

| From | To | Actor | Precondition |
|------|----|-------|--------------|
| `NOT_SUBMITTED` | `SUBMITTED` | system | Case submitted; relevant documents present |
| `SUBMITTED` | `UNDER_VERIFICATION` | Verifier | Verifier assigned to the case |
| `UNDER_VERIFICATION` | `CLARIFICATION_REQUIRED` | Verifier | A clarification request is open against this check |
| `CLARIFICATION_REQUIRED` | `UNDER_VERIFICATION` | Verifier | Clarification responded to or closed |
| `UNDER_VERIFICATION` | `VERIFIED` | Verifier | Evidence reference supplied |
| `UNDER_VERIFICATION` | `PARTIALLY_VERIFIED` | Verifier | Remarks supplied |
| `UNDER_VERIFICATION` | `UNABLE_TO_VERIFY` | Verifier | Reason in remarks |
| `UNDER_VERIFICATION` | `DISCREPANCY_FOUND` | Verifier | Remarks supplied; `requires_review` flag set |
| `UNDER_VERIFICATION` | `REJECTED` | Verifier | Remarks supplied |
| any resolved | `UNDER_VERIFICATION` | Verifier | Re-open for correction; previous result preserved in `verification_check_results` |

History is never overwritten: every recorded result is an immutable row in
`verification_check_results` with a sequence number.

## 6. Document status machine

```
MISSING → UPLOADED → UNDER_REVIEW → ┬ ACCEPTED
                                     ├ REJECTED
                                     ├ CLARIFICATION_REQUIRED → UNDER_REVIEW
                                     └ SUPERSEDED (replaced by a new version)
```

- A replacement upload sets the previous version to `SUPERSEDED` and creates a
  new version with `is_current = true`. The superseded version is retained and
  remains downloadable by authorised staff for audit.
- `REJECTED` and `CLARIFICATION_REQUIRED` both require remarks.
- `ACCEPTED` on a mandatory document is a prerequisite for case submission.

## 7. Clarification lifecycle

```
OPEN → RESPONDED → CLOSED
  └─────────────→ CANCELLED   (raised in error, reason recorded)
```

| Edge case from the brief | Behaviour |
|---|---|
| Candidate uploads an unreadable/unsupported file | Upload rejected at the storage layer; the document stays in its previous status; no document row is created |
| A required document is missing | Document row exists in `MISSING`; submission blocked with an itemised reason |
| Document expired / incomplete / mismatched | Verifier sets `CLARIFICATION_REQUIRED` or `REJECTED` with remarks |
| Clarification requested while the candidate edits their profile | Independent resources; the open clarification is unaffected by profile edits. The profile save does not silently close the clarification |
| Candidate responds after the due date | Response accepted, `responded_at` recorded, `is_overdue` computed from `due_date`. An overdue clarification still blocks submission until closed |
| Candidate uploads more than one replacement | Each upload creates a new version; only the newest is `is_current`. `upload.max_versions_per_document` caps retained versions |
| Verifier closes a clarification by mistake | `clarification:close` sets `CLOSED` with a reason. A `CANCELLED` transition (raised in error) is available and reversible to `OPEN` by the requester with a reason. Every transition is audited; nothing is deleted |
| Multiple simultaneous clarifications | Supported. Each has its own status, due date and response thread. The case stays in `CLARIFICATION_REQUIRED` until all are closed |
| Candidate attempts to submit while a clarification is open | Submission is rejected with `PRECONDITION_FAILED` and the list of open clarifications. No partial state is written |
| Candidate loses access to the registered email/mobile | Password login and refresh still work — the account is not invalidated by contact-channel loss. In-app notifications remain the fallback channel. Email failures are recorded per delivery attempt and never revert case state |
| Notification fails to send | Recorded as a `FAILED` delivery attempt with the error; retried with backoff. The business transaction that triggered it is already committed and is not rolled back |
| Verifier/reviewer account disabled while cases are assigned | `user.is_active = false` blocks login immediately (existing sessions are revoked by bumping the user's `session_epoch`). Assigned cases become unassigned-ready: they stay in the queue and appear in an "unassigned" bucket. The prior verifier's findings are preserved |
| Candidate account disabled | Same session invalidation applies; candidate-visible endpoints return `UNAUTHENTICATED` |

## 8. Submission readiness

The server computes readiness and returns an itemised list:

```json
{
  "ready": false,
  "missing": {
    "profileFields": ["dateOfBirth", "currentAddress"],
    "documents": [{ "requirementId": "…", "label": "Education certificate", "status": "MISSING" }],
    "consent": { "required": true, "currentVersionId": "…", "accepted": false },
    "openClarifications": []
  }
}
```

Submission is rejected with `422 PRECONDITION_FAILED` and this body when
`ready` is false.

## 9. Scoring trigger

`VERIFICATION_COMPLETED → BGV_SCORE_GENERATED` is executed by the score
generation service, which:

1. Asserts every mandatory check has a resolved status.
2. Asserts there are no open clarifications.
3. Loads the **active, approved** scoring configuration and records its version.
4. Computes the per-component result and the total.
5. Writes a `bgv_scores` row (history preserved on every regeneration).
6. Routes the case by outcome: at/above threshold → `BGV_APPROVED` is *not*
   automatic — the case moves to `BGV_SCORE_GENERATED` and awaits an approval
   decision; below threshold → `BGV_REVIEW_REQUIRED`.

## 10. Idempotent submission

`bgv_submission_events` carries a unique constraint on `(case_id, idempotency_key)`
and a unique constraint on `case_id` for the *effective* submission event. A
repeat request with the same key returns the original response with
`alreadySubmitted: true`. A repeat request with a different key on an already
submitted case returns `409 CONFLICT` with the existing submission timestamp —
it never creates a second case or a second submission event.
