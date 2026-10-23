# CheckIQ — Background Verification Platform

CheckIQ manages the background verification (BGV) lifecycle for candidates after a
technical interview round.

**Scope boundary.** CheckIQ is a BGV workflow system. It is *not* an HRMS, ATS,
recruitment portal, payroll, attendance, onboarding, or employee management system.
COSMO HRMS integration is explicitly a future phase and is not built in the MVP.

## Documentation index

| # | Document | Purpose |
|---|----------|---------|
| 01 | [Product Requirements](./01-product-requirements.md) | Scope, actors, functional requirements, non-goals |
| 02 | [Decisions Register](./02-decisions-register.md) | Open decisions requiring organisation input, with working assumptions |
| 03 | [Roles & Permissions](./03-roles-and-permissions.md) | RBAC model, permission matrix, access boundaries |
| 04 | [Workflows & State Machine](./04-workflows-and-state-machine.md) | Case status model, valid transitions, actor rules |
| 05 | [Scoring Rules](./05-scoring-rules.md) | Configurable scoring model, thresholds, adjustments |
| 06 | [Database Schema](./06-database-schema.md) | Normalised MySQL schema, keys, indexes, retention |
| 07 | [Security Design](./07-security-design.md) | AuthN/AuthZ, storage, hardening, privacy controls |
| 08 | [API Contracts](./08-api-contracts.md) | Endpoint catalogue, conventions, error model |
| 09 | [UI Flows](./09-ui-flows.md) | Candidate and operations screen flows and states |
| 10 | [Deployment & Operations](./10-deployment-operations.md) | Environments, migrations, backups, runbooks |
| 11 | [Accounts & Credentials](./11-local-accounts.md) | Local sign-in details, role capabilities, creating accounts |

## Repository layout

```
checkiq/
├─ apps/
│  ├─ api/              Node.js + Express + TypeScript (authoritative server)
│  └─ web/              React + Vite + TypeScript (SPA)
├─ packages/
│  └─ contracts/        Shared Zod schemas + types (API contract source of truth)
├─ docs/                This documentation set
├─ ops/                 Local infrastructure helpers (MySQL, docker-compose)
└─ .env.example         Environment configuration template
```

## Guiding principles

1. **The server is authoritative.** Permissions, state transitions, required
   fields, file validation and scoring are enforced in `apps/api`. The React
   client only reflects server decisions.
2. **Append-only history.** Findings, clarification threads, scores, reviews and
   audit events are never overwritten. Corrections are new records that reference
   the prior state.
3. **Least privilege by default.** Every protected route requires an explicit
   permission. Roles ship with a narrow default permission set.
4. **Configurable, not hard-coded.** Candidate ID format, BGV packages, document
   requirements, checks, scoring weights and thresholds are data, not code.
5. **No invented policy.** Consent wording, retention periods, legal hold rules,
   criminal-record check availability and the final scoring weights are flagged
   for organisation sign-off (see `02-decisions-register.md`).
