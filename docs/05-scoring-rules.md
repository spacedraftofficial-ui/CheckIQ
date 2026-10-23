# 05 — Scoring Rules

> **Status: policy not confirmed.** The weights below are the *illustrative*
> figures from the development plan. They are stored as data, and the seeded
> configuration is `DRAFT` / `is_approved = false` so it cannot be used to
> produce a production score until an authorised administrator approves it.
> See [D-01](./02-decisions-register.md#d-01--bgv-scoring-weights-and-threshold).

## 1. Model

A scoring configuration is a versioned row:

```
scoring_configurations
  id, version, name, threshold, allow_provisional, status, is_approved,
  approved_by, approved_at, notes, created_at
    │
    └─ scoring_config_components
         id, scoring_config_id, check_type_code, label, weight,
         outcome_multipliers (JSON), excluded_statuses (JSON)
```

Only one configuration may be `ACTIVE` at a time. Activating a configuration
requires it to be `is_approved = true`. Every score records the configuration
`version` used, so a historical score remains explainable after weights change.

## 2. Illustrative weights (illustrative, unconfirmed)

| Component | Weight |
|-----------|--------|
| Identity | 20% |
| Address | 10% |
| Education | 20% |
| Employment | 30% |
| Document Authenticity | 10% |
| Additional Verification | 10% |
| **Total** | **100%** |

The requested initial threshold is **95%**.

Weight semantics, and how a check maps to a component:

- A **component** aggregates one or more **checks** of the same `check_type_code`.
- A component's weighted contribution is
  `weight × (awarded points for the component ÷ max points for the component)`.
- If several checks share a `check_type_code`, their points are summed and the
  component's awarded/max ratio is the average of the checks' multipliers.

## 3. Status → awarded points

Implemented as `outcome_multipliers` JSON on each component.

| Check status | Multiplier | Counts toward denominator | Effect on case |
|---|---|:--:|---|
| `VERIFIED` | 1.0 | yes | — |
| `PARTIALLY_VERIFIED` | 0.5 | yes | may trigger review |
| `UNABLE_TO_VERIFY` | 0.0 | yes | no credit; **may** still block if the check is mandatory |
| `DISCREPANCY_FOUND` | 0.0 | yes | forces `BGV_REVIEW_REQUIRED` |
| `REJECTED` | 0.0 | yes | forces `BGV_REVIEW_REQUIRED` |
| `NOT_SUBMITTED` / `SUBMITTED` / `UNDER_VERIFICATION` / `CLARIFICATION_REQUIRED` | n/a | — | **blocks score generation** unless the check is non-mandatory and the configuration allows it |
| `WAIVED` / `NOT_APPLICABLE` | n/a | **no** | excluded from the denominator entirely |

The "excluded from denominator" rule for waived and not-applicable checks is a
policy choice that materially changes the score and is flagged in
[D-01](./02-decisions-register.md#component-weight-semantics-also-open).

## 4. Mandatory checks gate score generation

Score generation asserts:

```
for every check where is_mandatory = true:
    status must be a resolved status (VERIFIED | PARTIALLY_VERIFIED |
                                      UNABLE_TO_VERIFY | DISCREPANCY_FOUND | REJECTED)
and there must be no OPEN or RESPONDED clarification requests
```

Failure → `422 PRECONDITION_FAILED` with the blocking items. Provisional
scoring is possible only when `scoring_configurations.allow_provisional = true`
(default `false`, see [D-09](./02-decisions-register.md#d-09--provisional-scoring)).
A provisional score is stored with `is_provisional = true` and
`outcome = PROVISIONAL`, and it never satisfies the eligibility gate on its own.

## 5. Threshold comparison and precision

- Scores are stored and compared as **scaled integers** to avoid floating-point
  drift. The database column is `DECIMAL(5,2)`; in code the value is carried as
  an integer number of **hundredths of a percent** (`scoreHundredths`).
- The total is `round(sum(componentWeight × ratio))` to the nearest whole
  hundredth, using **half-up** rounding, applied once at the end of the sum —
  never per component.
- The threshold comparison is `scoreHundredths >= thresholdHundredths`, so a
  score of exactly 95.00 meets a 95% threshold. There is no epsilon fudge
  factor.
- Thresholds are configurable per scoring configuration; 95% is the seeded
  value only.

## 6. Eligibility rules

| Condition | Outcome |
|---|---|
| Score ≥ threshold **and** all mandatory checks resolved **and** maker-checker satisfied **and** no open clarifications | Case → `BGV_APPROVED` (awaiting approval decision), then `ELIGIBLE_FOR_FINAL_INTERVIEW` |
| Score ≥ threshold but a material discrepancy requires review | Case → `BGV_REVIEW_REQUIRED` |
| Score < threshold | Case → `BGV_REVIEW_REQUIRED`. **Never** an automatic candidate rejection |
| Mandatory check unresolved | Score generation is blocked |
| Provisional score only | Outcome `PROVISIONAL`; does not satisfy eligibility |

**A below-threshold score never produces an automated rejection notice to the
candidate.** The candidate receives a coarse status; internal reasons are
withheld unless `disclosure.show_findings_to_candidate = true`
(default `false`).

## 7. Score history

`bgv_scores` is append-only:

```
id, case_id, scoring_config_id, scoring_config_version, total_score,
threshold, outcome, is_provisional, components (JSON snapshot),
generated_by, generated_at, superseded_at
```

- Regenerating a score creates a **new row** and marks the previous row
  `superseded_at`. No score is edited.
- The `components` JSON snapshot stores the exact per-component weights,
  multipliers, awarded points and the check IDs used, so a historical score can
  be reproduced even after the configuration changes.

## 8. Manual adjustment

`POST /api/cases/:caseId/score/adjust` requires:

- `score:adjust` permission
- `adjustedScore` within 0–100
- `reason` of at least 5 characters — **mandatory**

The adjustment is stored as a **new score row** (`is_manual_adjustment = true`,
with `previous_score`, `adjusted_by`, `adjusted_at`, `reason`) plus an audit
event. The original computed score is never modified.

## 9. Traceability

For any score, the API can return:

- the scoring configuration version and its full definition at that version
- the per-component breakdown (weight, multiplier, awarded/max points)
- the underlying check results (status, outcome code, verifier, timestamps)
- the manual adjustment chain, if any

This is what makes a score *explainable* rather than merely *visible*.
