# 07 — Security Design

Candidate information and documents are treated as sensitive personal data.
This document describes what the implementation does today, and what remains a
policy decision for the organisation.

## 1. Authentication

| Concern | Implementation |
|---------|----------------|
| Password storage | Argon2id (`@node-rs/argon2`), 19 MiB memory, 2 iterations, 1 lane. The library default algorithm is Argon2id. |
| Password policy | 10+ characters with upper and lower case, a digit and a symbol. Enforced on the server by Zod. |
| Session model | Short-lived access token (15 min, HS256 JWT) plus a rotating opaque refresh token (7 days) stored as a SHA-256 hash in `auth_sessions`. |
| Token storage | The refresh token is an `httpOnly`, `SameSite=Lax`, `Secure`-in-production cookie scoped to `/api/auth`. The access token is held **in memory only** by the web client — never in `localStorage` or `sessionStorage`. |
| Refresh rotation | Every refresh rotates the token. Re-use of a rotated token revokes the whole token family and is audited as `AUTH_LOGOUT` with the reason "Refresh token reuse detected". |
| Session invalidation | `users.session_epoch` is incremented on password change and on account deactivation. The access-token middleware compares the epoch on every request, so deactivation takes effect immediately. |
| Account recovery | Out of scope for the MVP. `SEED_ADMIN_PASSWORD` and the seed account exist only for development. A production deployment must disable the seed and provide a recovery flow. |
| OTP | Not implemented. If enabled later, the OTP must be hashed at rest, single-use, short-lived and rate limited — see decision D-17. |

### Why possession of a Candidate ID is not authentication

A Candidate ID identifies a case; it does not authorise anything. Signup
accepts an unregistered Candidate ID because the brief requires an open
onboarding flow, but:

- every subsequent operation requires an authenticated session;
- the access-control layer resolves the candidate's own case from the session,
  never from a client-supplied identifier;
- a Candidate ID is never accepted as a bearer credential.

## 2. Authorisation

Four layers, evaluated on every protected request:

1. **Authentication** — a valid, unrevoked session.
2. **Role** — the principal holds a required role.
3. **Permission** — the principal holds a required permission.
4. **Resource scope** — the principal may act on *this* record.

Layer 4 is the one that protects against a candidate changing an identifier in
a URL. It is always resolved in SQL:

```sql
WHERE bgv_cases.profile_id = <the session's candidate profile id>
```

A case outside the principal's scope is reported as `404 Not Found`, not
`403`, so the API does not confirm that the record exists. Every denied
cross-scope attempt is written to the audit trail.

The full permission matrix is in
[`03-roles-and-permissions.md`](./03-roles-and-permissions.md).

## 3. Input validation and output handling

| Concern | Implementation |
|---------|----------------|
| Request validation | Every body, query and route parameter is parsed by a Zod schema (`packages/contracts`). The **parsed** value replaces the raw value, so handlers never touch unvalidated input. |
| Output encoding | React escapes by default. The API returns JSON; `X-Content-Type-Options: nosniff` is set by Helmet. |
| SQL injection | All queries are built through Drizzle's parameterised query builder. Raw SQL is used in exactly two places — the migration runner and the sequence allocation — both with bound parameters. |
| Error disclosure | Unexpected errors are logged with their stack but reported as a generic `INTERNAL_ERROR`. Driver messages and stack traces never reach a client. |
| Mass assignment | Update handlers pick the fields they accept. A client cannot set a role, an owner or a case status through a profile update. |
| File uploads | See §5. |

## 4. Web vulnerabilities

| Threat | Mitigation |
|--------|-----------|
| CSRF | The refresh cookie is `SameSite=Lax` and scoped to `/api/auth`. The API is designed to be served same-origin behind a reverse proxy; the Vite dev server proxies `/api` for the same reason. Every state-changing operation requires a bearer token, which a cross-site form post cannot supply. |
| XSS | React escapes output. The application ships no `dangerouslySetInnerHTML`. A strict CSP is applied at the reverse proxy. The access token is not in browser storage, so an XSS payload cannot read it from persistent storage. |
| Clickjacking | `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'none'` via Helmet. |
| MIME sniffing | `X-Content-Type-Options: nosniff`. |
| Referrer leakage | `Referrer-Policy: no-referrer`; the SPA also sets `<meta name="referrer" content="no-referrer">`. |
| Open redirect | There is no redirect endpoint. |
| Server-side request forgery | The server makes no outbound requests based on user input. |
| Denial of service | Rate limits on the API surface, authentication, signup and uploads; request body size limits; upload size limits. |
| Information disclosure | Sensitive fields are masked for callers without the matching permission. The error envelope carries a request id, not internals. |

### Rate limits

| Scope | Default |
|-------|---------|
| Whole API | 300 requests / 15 minutes / IP |
| Login | 10 attempts / 15 minutes / (IP + identifier) |
| Signup | 5 attempts / hour / IP |
| Uploads | 120 / hour / user |

The key generator uses `ipKeyGenerator` so that IPv6 clients cannot bypass the
limit by rotating within a /64.

## 5. Document handling

| Control | Implementation |
|---------|----------------|
| Accepted types | PDF, JPG, JPEG, PNG. Configurable in `system_config`. |
| Extension | Checked against the allowlist. |
| Size | Checked against `upload.max_file_size_bytes` (10 MiB default). |
| Empty file | Rejected. |
| Real content | Detected with `file-type` from the file's **content signature**, not from the browser-supplied MIME type. A file whose content does not match its extension is rejected. |
| Storage | Written to a temporary file, validated, then atomically renamed into `<STORAGE_DIR>/<yyyy>/<mm>/<uuid>.<ext>`. |
| Key opacity | The storage key is a UUID. It is not derived from the filename and is not guessable. |
| Public access | There is no static route over the storage directory. Files are served only through an authenticated, authorised download route. |
| Path traversal | The resolved path must stay inside the storage root; the check uses `path.relative` so it is correct on both Windows and POSIX. |
| Versioning | A replacement creates a new version and supersedes the previous one. Nothing is overwritten or deleted. |
| Download header | `Content-Disposition: attachment` with an encoded filename, and `nosniff`. |
| Download auditing | Every view and download writes an audit event. |
| Malware scanning | A `ScannerPort` interface exists. The default implementation reports `SKIPPED`, so the data model distinguishes "not scanned" from "scanned and clean". A ClamAV implementation is a single-file change (decision D-16). |
| Interrupted uploads | The temporary file is removed when validation fails. A file is only moved into permanent storage after it has passed validation. |

## 6. Encryption

| Data | At rest | In transit |
|------|---------|-----------|
| PAN, passport number, driving licence number, employer contact details | AES-256-GCM field-level encryption (`apps/api/src/lib/crypto.ts`). The key comes from the environment, never from the database. | TLS |
| Passwords | Argon2id | TLS |
| Refresh tokens | SHA-256 hash | TLS |
| Everything else | Relies on database-level encryption at rest (deployment concern) | TLS |
| All traffic | — | TLS 1.2+ at the reverse proxy; `Strict-Transport-Security` is set by Helmet |

Masking: sensitive values are returned masked (`********1234`) to callers
without `profile:read:any`. The owner and staff with the permission see the
real value.

Key rotation is a documented operation rather than an implemented one: the
ciphertext carries a key id, so a new key can be introduced and re-encrypted in
a controlled migration (decision D-18).

## 7. Logging

The structured logger (pino) redacts, on every call:

```
req.headers.authorization, req.headers.cookie, set-cookie,
password, confirmPassword, currentPassword, newPassword, passwordHash,
token, refreshToken, accessToken, otp, otpCode,
pan, panEncrypted, passportNumber, drivingLicenceNumberEncrypted,
contactEmailEncrypted, contactMobileEncrypted, checksumSha256, storageKey
```

Audit events apply a second, independent redaction pass over the
previous/new value payloads, so a caller that puts a secret into an audit
payload cannot leak it. Document contents are never logged.

Request logs contain the method, path (without the query string), status,
duration and request id. They contain no body and no document metadata.

## 8. Audit trail

`audit_events` is append-only:

- there is no `PATCH`, `PUT` or `DELETE` route over the table — the API
  exposes `GET` only;
- the table has no `updated_at` column;
- the audit writer is the only write path;
- the table is read-only to every role except `audit:read`.

Each event records the actor (id, name, role), the action, the entity type and
id, the case and Candidate ID, the previous and new values, a reason where
one applies, the request id and the timestamp.

## 9. Secrets

- Secrets are read from the environment. Nothing sensitive is committed.
- `.env` is git-ignored; `.env.example` documents every variable with a
  placeholder value.
- The seed administrator password comes from the environment and the account
  is flagged `mustChangePassword`.
- `system_config` rows marked `is_secret` are never returned through the
  configuration API.

## 10. Deployment requirements

| Requirement | Detail |
|-------------|--------|
| HTTPS | Terminated at the reverse proxy. `COOKIE_SECURE=true` is enforced at boot in production. |
| Separate environments | `DATABASE_URL`, `JWT_ACCESS_SECRET` and `PII_ENCRYPTION_KEY` differ per environment. The API refuses to start in production with `COOKIE_SECURE=false`. |
| Private storage | The storage volume is mounted into the API only. It is never served by a web server. |
| Backups | MySQL dumps plus a storage-volume snapshot, on a schedule. Restore is rehearsed — see [`10-deployment-operations.md`](./10-deployment-operations.md). |
| File validation | Enforced in the API before a file reaches permanent storage. |
| Malware scanning | Integration point present; a scanner must be configured before production (decision D-16). |
| Audit logging | Sensitive access (document views and downloads) and every administrative action are recorded. |

## 11. Policy decisions that are not implemented

These are flagged rather than invented. None of them is a code change waiting
to be written; each needs an organisational answer first.

| Decision | Reference |
|----------|-----------|
| Retention and archival periods | D-03 |
| Legal hold, correction requests, deletion | D-14 |
| Third-party and external access | D-13 |
| Criminal and court-record checks | D-04 |
| Approved consent and declaration wording | D-02 |
| Directory / SSO integration | D-22 |
| Session duration and re-authentication | D-17 |
| Key management and rotation | D-18 |
