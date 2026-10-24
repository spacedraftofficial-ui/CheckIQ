# AGENTS.md

Working notes for anyone (human or agent) changing this repository.

## Layout

- `apps/api` — Node.js + Express + TypeScript. The **authoritative** server:
  permissions, state transitions, required fields, file validation and scoring
  all live here.
- `apps/web` — React + Vite single-page application. It renders what the API
  returns; it never decides.
- `packages/contracts` — the shared Zod schemas and types. Both apps import
  from `@checkiq/contracts`. Change a contract here first, then the server,
  then the client.
- `docs/` — the product and design documentation. `docs/02-decisions-register.md`
  lists the decisions that still need the organisation's input.

## Commands

```bash
npm install          # install workspace dependencies
npm run dev          # API on :4000, web app on :5173
npm run typecheck    # every package
npm run lint         # every package
npm test             # API + web suites
npm run db:migrate   # apply migrations
npm run db:seed      # reference data (idempotent)
npm run db:generate  # generate a SQL migration after a schema change
```

The web app proxies `/api` to the API in development, so the browser sees a
single origin. Do not change the client to call the API on a different origin —
that breaks the refresh-token cookie.

## Conventions

- TypeScript everywhere. `noUncheckedIndexedAccess` and `noUnusedLocals` are
  on; the build fails on unused variables.
- The API uses **ESM** with `NodeNext` resolution. Relative imports must carry
  the `.js` extension.
- The web app uses `Bundler` resolution and imports without extensions.
- Zod schemas live in `packages/contracts` and are the only place a request
  shape is defined.
- Database access goes through Drizzle. Raw SQL is limited to the migration
  runner and the sequence allocation, both with bound parameters.
- `eq(column, null)` does **not** produce `IS NULL` in Drizzle — use
  `isNull(column)`. This has bitten the codebase once already.
- MySQL DDL is not transactional. The migration runner applies statements
  without a transaction, and a failure leaves a partially applied schema.
- `timestamp(3)` cannot be combined with an `ON UPDATE` clause. `updated_at`
  columns use second precision for this reason.

## Authorisation

Authorisation has four layers: authentication → role → permission → resource
scope. The fourth layer is the one that stops a candidate reading another
candidate's case, and it is always resolved in SQL — never by filtering in
JavaScript.

When adding an endpoint:

1. Add the route under the right module in `apps/api/src/modules`.
2. Apply `requirePrincipal` and the required `requirePermission`.
3. Resolve the record's scope with `resolveCase` (or an equivalent scoped
   query) before reading any of its data.
4. Write an audit event for the action.

Hiding a button in React is a UX affordance, not a control.

## Data handling

- Sensitive identity fields are encrypted at rest. Use `encryptSensitive` /
  `decryptSensitive` and mask with `maskSensitive` for callers without the
  matching permission.
- Never log passwords, tokens, OTP values or document contents. The logger
  redacts them, but the audit writer has its own redaction pass — use it.
- Documents are stored under opaque keys in a private volume. There is no
  static route over the storage directory, and there must not be one.
- Audit events are append-only. Do not add an update or delete path.

## Testing

- The API suite uses a dedicated `checkiq_test` database. It truncates and
  re-seeds between files, so a test must not depend on data from another file.
- The tests share one database and therefore run with `fileParallelism: false`.
- A new business rule needs a test. A new permission needs an access-boundary
  test.
- `node scripts/smoke.mjs` exercises the candidate and operations journeys
  against a running instance.

## Production deployment

The API can serve the frontend SPA from its build directory in production,
allowing a single Node.js process to serve both the API and the static frontend:

1. Build contracts, API, and web: `npm run build` (or workspace-equivalent commands).
2. The API serves `apps/web/dist` as static files when it exists at
   `dist/../web/dist` relative to the compiled API entry point.
3. Environment: set `NODE_ENV=production`, `CORS_ORIGINS` to the site's domain
   (or leave empty when serving the SPA from the same origin), `COOKIE_SECURE=true`,
   and configure all secrets via environment variables.

For Hostinger single-site deployment:
- Root: `./`
- Build command: `npm run build`
- Entry file: `apps/api/dist/index.js`
- Application type: Express
- Node.js version: 22
- Environment variables must be set in Hostinger hPanel (do NOT commit `.env` with secrets)

## Before saying a feature is done

```bash
npm run typecheck && npm run lint && npm test
```

And update `docs/` if the change affects a contract, a state transition, a
permission or a documented decision.
