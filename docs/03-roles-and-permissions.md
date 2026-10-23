# 03 — Roles and Permissions

## 1. Model

Authorisation is a three-layer model evaluated on every protected request:

```
request
  ├─ 1. Authentication  — valid, non-revoked session → principal
  ├─ 2. Role check      — principal holds a required role
  └─ 3. Permission check— principal holds a required permission
       └─ 4. Resource scope — principal may act on THIS record (ownership / assignment)
```

Layers 1–3 are static and permission-driven. Layer 4 is the **resource scope**
check — the part that stops a candidate reading another candidate's case even
when both hold `case:read`.

Roles are stored in `roles`; the role→permission mapping lives in
`role_permissions`. Users hold roles through `user_roles`. Both are editable by
an administrator, and every change writes an audit event.

## 2. Roles

| Code | Label | Purpose |
|------|-------|---------|
| `CANDIDATE` | Candidate | Own profile, documents, clarifications, own case status |
| `BGV_EXECUTIVE` | BGV Executive | Perform assigned verification checks, request clarifications |
| `BGV_REVIEWER` | BGV Reviewer / Manager | Review material findings, decide maker-checker reviews |
| `HR_RECRUITMENT` | HR / Recruitment | Create/manage cases, view authorised recruitment outcomes |
| `ADMINISTRATOR` | Administrator | Users, document categories, packages, configuration, scoring rules |
| `SUPER_ADMINISTRATOR` | Super Administrator | System governance, role/permission management, privileged overrides |

Least privilege is the default: a newly created administrator holds no
super-administrator powers, and no role implies another.

## 3. Permission catalogue

Permission strings are stable identifiers in
`packages/contracts/src/enums.ts` (`PERMISSIONS`) and mirrored in the database.

| Permission | Grants |
|------------|--------|
| `case:read:own` | Read the candidate's own case |
| `case:read:assigned` | Read cases assigned to the user |
| `case:read:any` | Read any case (scoped by role policy) |
| `case:create` | Create a case for a candidate |
| `case:assign` | Assign verifier / reviewer |
| `case:list:queue` | Access the operations queue and filters |
| `verification:record` | Record a check result / finding |
| `verification:read` | Read individual check findings and remarks |
| `clarification:create` | Raise a clarification request |
| `clarification:respond:own` | Respond to a clarification on one's own case |
| `clarification:close` | Close a clarification request |
| `review:read` | Read reviews and approvals |
| `review:decide` | Record a maker-checker decision |
| `approval:decide` | Record the final approval decision |
| `score:read` | Read scores and score history |
| `score:generate` | Generate a score |
| `score:adjust` | Manually adjust a score (reason required) |
| `report:read` | Read the internal BGV report |
| `report:generate` | Generate an internal BGV report |
| `notification:read:own` | Read own notifications |
| `notification:manage` | Read/manage all notifications and templates |
| `user:manage` | Create/update staff users, activate/deactivate |
| `role:manage` | Create/modify roles and role→permission mapping |
| `permission:manage` | Assign roles to users |
| `config:read` | Read system configuration |
| `config:manage` | Change system configuration |
| `package:manage` | Manage BGV packages, requirements, checks |
| `documentcategory:manage` | Manage document categories and types |
| `profile:write:own` | Update own profile |
| `profile:read:any` | Read unmasked profile data of any candidate |
| `employment:read:any` | Read unmasked employment history of any candidate |
| `audit:read` | Read the full audit trail |
| `audit:read:own` | Read audit events scoped to one's own candidate |

## 4. Default role → permission matrix

`✓` granted · `—` not granted

| Permission | CANDIDATE | BGV_EXEC | BGV_REV | HR | ADMIN | SUPER_ADMIN |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| `case:read:own` | ✓ | — | — | — | — | ✓ |
| `case:read:assigned` | — | ✓ | ✓ | — | ✓ | ✓ |
| `case:read:any` | — | — | ✓ | ✓ | ✓ | ✓ |
| `case:create` | — | — | — | ✓ | ✓ | ✓ |
| `case:assign` | — | — | ✓ | ✓ | ✓ | ✓ |
| `case:list:queue` | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| `verification:record` | — | ✓ | ✓ | — | — | ✓ |
| `verification:read` | — | ✓ | ✓ | — | — | ✓ |
| `clarification:create` | — | ✓ | ✓ | — | — | ✓ |
| `clarification:respond:own` | ✓ | — | — | — | — | ✓ |
| `clarification:close` | — | ✓ | ✓ | — | — | ✓ |
| `review:read` | — | — | ✓ | — | ✓ | ✓ |
| `review:decide` | — | — | ✓ | — | — | ✓ |
| `approval:decide` | — | — | ✓ | ✓ | — | ✓ |
| `score:read` | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| `score:generate` | — | — | ✓ | — | ✓ | ✓ |
| `score:adjust` | — | — | — | — | ✓ | ✓ |
| `report:read` | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| `report:generate` | — | — | ✓ | ✓ | ✓ | ✓ |
| `notification:read:own` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `notification:manage` | — | — | — | — | ✓ | ✓ |
| `user:manage` | — | — | — | — | ✓ | ✓ |
| `role:manage` | — | — | — | — | — | ✓ |
| `permission:manage` | — | — | — | — | — | ✓ |
| `config:read` | — | — | — | — | ✓ | ✓ |
| `config:manage` | — | — | — | — | ✓ | ✓ |
| `package:manage` | — | — | — | — | ✓ | ✓ |
| `documentcategory:manage` | — | — | — | — | ✓ | ✓ |
| `profile:write:own` | ✓ | — | — | — | — | ✓ |
| `profile:read:any` | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| `employment:read:any` | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| `audit:read` | — | — | — | — | ✓ | ✓ |
| `audit:read:own` | ✓ | — | — | — | — | ✓ |

Notes:

- `BGV_REVIEWER` holds `approval:decide`; `SUPER_ADMINISTRATOR` holds it too, so
  a super administrator can act in an emergency but **cannot** approve a case
  they verified themselves (see §6).
- `HR_RECRUITMENT` has no `verification:read`, so individual check remarks are
  masked for HR by default (D-19).
- `ADMINISTRATOR` holds no `approval:decide` — administration and case
  approval are deliberately separated.

## 5. Resource scope (the fourth layer)

Permission alone never grants data access. Every data-returning handler
resolves scope explicitly.

| Resource | Candidate | BGV Executive | BGV Reviewer | HR | Admin |
|----------|-----------|---------------|--------------|----|-------|
| Candidate profile | Own only | Assigned cases | Any | Any | Any |
| Document bytes | Own only | Assigned cases | Any | Metadata only | Any |
| Check findings | Own status label only | Assigned cases | Any | Masked | Any |
| Score | Not disclosed by default | Assigned cases | Any | Any | Any |
| Audit trail | Own events | — | — | — | All |

Implementation rules:

1. A candidate-scoped query **always** includes `WHERE candidate_id = <own id>`
   in the SQL, not an application-level `if`. This is the primary defence
   against IDOR.
2. Staff access is limited to cases they are assigned to, unless they hold
   `case:read:any`.
3. `GET /api/cases/:id` resolves the case, then checks scope before returning
   anything — a 404 (not 403) is returned for out-of-scope resources so the
   endpoint does not confirm existence.
4. Every denied cross-scope access writes an `ACCESS_DENIED` audit event.

## 6. Maker-checker separation

When `bgv_packages.requires_maker_checker = true`:

- The user who recorded the deciding verification result is the **maker**.
- The final approver must be a different user.
- A reviewer may not approve a case whose checks they personally recorded, when
  `review.allow_self_review = false` (default).
- Violations are rejected on the backend with `PRECONDITION_FAILED` and logged.

## 7. Backend enforcement patterns

Three middleware, applied in this order:

```ts
// 1. Authentication — populates req.principal
app.use("/api", authenticate);

// 2. Static authorisation — role and/or permission
app.post("/api/cases/:id/checks/:checkId/result", requirePermission("verification:record"), handler);

// 3. Dynamic scope — inside the handler, before any data is loaded
const scoped = await assertCaseAccess(principal, caseId);
```

Rules that apply to every handler:

- The server never trusts a client-supplied role, permission, `candidateId` or
  owner field. Ownership is resolved from the session.
- Filtering, sorting and pagination happen in SQL with the scope predicate
  applied — never by loading all rows and filtering in JavaScript.
- Buttons hidden in React are a **UX affordance only**. Hiding is never the
  enforcement mechanism.
- Role and permission changes are audited with the previous and new values.

## 8. Super administrator overrides

`SUPER_ADMINISTRATOR` may:

- Manage roles, permissions and role assignment
- Reopen a closed case (mandatory reason, audit event)
- Approve an active scoring configuration
- Toggle configuration flags that affect verification behaviour

They may **not**:

- Approve a case they verified themselves (maker-checker still applies)
- Edit or delete audit events
- Read or decrypt another candidate's documents without a case assignment and a
  matching `case:read:*` permission
