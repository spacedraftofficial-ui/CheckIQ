# 09 — UI Flows

The web application is a single-page React app (`apps/web`). It uses React
Router for navigation, TanStack Query for server state, React Hook Form with
Zod for forms, and Tailwind CSS for styling.

## 1. Principles

1. **The server decides.** The client never decides whether a case can be
   submitted, whether a score meets the threshold, or whether a user may open a
   record. It renders what the server returns.
2. **Every state is visible.** Each view has an explicit loading, empty,
   success, validation-error and failure state.
3. **Consequential actions are confirmed.** Submission, approval and role
   changes require an explicit confirmation.
4. **Accessible by default.** Every control has a label, the DOM order matches
   the visual order, focus is visible, and the layout works from 360 px to
   1440 px.
5. **No sensitive data in the browser.** The access token lives in memory. The
   only browser storage used is `sessionStorage`, and only for the submission
   idempotency key (a random opaque string, not sensitive data).

## 2. Screen map

| Route | Audience | Purpose |
|-------|----------|---------|
| `/` | Visitor | Enter the Candidate ID and continue. |
| `/signup` | Visitor | Create the candidate account. |
| `/login` | Visitor | Sign in. |
| `/dashboard` | Candidate | Progress, outstanding items, current status. |
| `/profile` | Candidate | Complete the profile. |
| `/documents` | Candidate | Upload and replace documents. |
| `/consent` | Candidate | Read and accept the declaration. |
| `/clarifications` | Candidate | Respond to clarification requests. |
| `/submit` | Candidate | Review the checklist and submit. |
| `/notifications` | All | The notification inbox. |
| `/ops` | Staff | The case queue, with counts and filters. |
| `/ops/cases/:caseId` | Staff | Case detail, checks, documents, clarification, history. |
| `/ops/cases/:caseId/verification` | Staff | Record results, generate a score, review and approve. |
| `/ops/cases/:caseId/report` | Staff | The internal BGV report. |
| `/admin/users` | Administrator | Staff accounts and roles. |
| `/admin/packages` | Administrator | Packages and the document catalogue. |
| `/admin/config` | Administrator | Runtime configuration and scoring configurations. |

## 3. Candidate journey

### 3.1 Enter the Candidate ID (`/`)

- A single labelled input with the worked example `CIQ-2026-000001` shown as a
  hint.
- **No client-side validation of the ID's existence.** The server decides.
- The button is disabled while the field is empty.

### 3.2 Create the account (`/signup`)

- The Candidate ID is carried over from the landing screen and stays editable.
- Fields: Candidate ID, full name, email, mobile, password, confirm password,
  and optional company, department and position.
- Client-side Zod validation mirrors the server rules; the server remains
  authoritative.
- A duplicate Candidate ID produces a clear panel: the ID is already
  registered, sign in instead, and contact support if this is an error. The
  form is **not** cleared and the account is not created.
- On success the candidate lands on `/dashboard`.

### 3.3 Overview (`/dashboard`)

- Case number, Candidate ID and a status badge with candidate-facing wording.
- An "action required" banner when a clarification is open or items are
  outstanding.
- A four-step progress list: profile → declaration → documents → submit, each
  with a link to fix it.
- A document list with the status of every requirement. Reviewer remarks are
  shown only for a document that is in `CLARIFICATION_REQUIRED`.
- Clarification requests are summarised with an overdue marker.

### 3.4 Profile (`/profile`)

- Personal details, addresses, education and employment history.
- Repeating groups use a `useFieldArray` repeater with add and remove.
- Sensitive fields (PAN, passport, driving licence) are optional and are
  stored encrypted.
- Saving shows a confirmation and refreshes the dashboard.

### 3.5 Documents (`/documents`)

- One card per package requirement, showing the current status, the current
  version and the file size.
- A file input restricted to PDF, JPG and PNG with the size limit stated in
  the hint text.
- A rejected upload shows the server's reason in plain language.
- "View N versions" opens the version history, which lists every version with
  its upload time and marks the current one. Previous versions are never
  removed.

### 3.6 Declaration (`/consent`)

- The full wording is displayed in a scrollable panel.
- A checkbox states the candidate has read and agrees.
- Accepting records the version and the timestamp. Previously accepted versions
  remain in the audit trail.

### 3.7 Clarifications (`/clarifications`)

- Open requests show the issue, the required action, the remarks and the due
  date, with an overdue marker.
- The candidate writes a response and sends it. A response after the due date
  is accepted and recorded as late.
- Closed requests are listed below with their closure reason.

### 3.8 Submit (`/submit`)

- A four-item checklist reflecting the server's readiness result. Each
  outstanding item links to the page that fixes it.
- A confirmation checkbox: "I confirm that the information and documents I
  have provided are true and complete."
- The submit button is disabled until the checklist passes and the box is
  ticked.
- The idempotency key is generated once per page load and kept in
  `sessionStorage`, so a retry after a network error reuses the same key and
  cannot create a second submission.
- On success a confirmation screen shows the case number and the submission
  time.

## 4. Operations journey

### 4.1 Queue (`/ops`)

- Count cards for each meaningful status. Clicking a card filters the list.
- A search box (Candidate ID, name, case number) and a status filter.
- The table shows the case, the candidate, the position, the status, the
  assigned verifier, the score and the last update.
- An empty result explains that nothing matches and offers a way to clear the
  filters.
- Pagination shows the page, the total and the number of pages.

### 4.2 Case detail (`/ops/cases/:caseId`)

- Header with the candidate, the case number, the Candidate ID, the package
  and the status.
- A summary grid: position, company, department, score, verifier, reviewer,
  submission date and eligibility.
- The verification checks with their status, remarks, evidence reference and
  verifier.
- The documents with their status and a download action.
- A "request clarification" form naming the issue and the required action.
- The full status history with the actor, role, timestamp and reason.

### 4.3 Verification (`/ops/cases/:caseId/verification`)

- One card per check with a form to record the outcome, the evidence
  reference and the remarks. The remarks field states that they are required
  for a discrepancy, rejection or unable-to-verify outcome.
- The score panel shows the total, the threshold, the configuration version
  and the per-component breakdown, with a "generate score" action.
- The review and approval panel offers: record a review approval, return the
  case for further work, approve the case, and open the report.
- A server rejection (for example a maker-checker violation) is shown in
  place, with the server's explanation.

### 4.4 The internal report (`/ops/cases/:caseId/report`)

- A print-ready page with the report number, the case number and the generation
  time.
- The candidate's identification, the position, company, department and package.
- The timeline: initiated, submitted and completed.
- A table of every verification result with its status, outcome, verifier and
  remarks.
- The discrepancies, in a highlighted panel, when there are any.
- The outcome: the final score, the scoring configuration version, the
  eligibility result, and the verifier, reviewer and approver.
- A print button. The page is never available to a candidate.

### 4.5 Administration (`/admin/*`)

- **Users**: the staff list with their roles and status, an enable/disable
  action, and a form to create a staff account with a temporary password.
- **Packages**: the packages with their requirement and check counts, and the
  document catalogue.
- **Configuration**: the runtime configuration grouped by category, each value
  editable in place with a save action, and the scoring configurations with
  their weights, approval state and activation action.

## 5. Feedback states

| State | Treatment |
|-------|-----------|
| Loading | A labelled spinner inside a card, with `role="status"` so it is announced. |
| Empty | An icon, a title, an explanation and, where useful, an action to clear the filter. |
| Validation error | The message is shown next to the field; the form is not submitted. |
| Server error | A red panel with the server's message. The technical detail is never shown to the user. |
| Success | A green confirmation panel. |
| Disabled action | The button is disabled and its label explains why (for example "Complete every item in the checklist before you can submit"). |

## 6. Accessibility

- Every input has a `<label>` bound with `htmlFor`/`id`. The label text is
  always present — placeholders are hints, not labels.
- Status is never conveyed by colour alone: every badge carries its text.
- The focus ring is visible on every interactive element.
- Tables have a caption and scoped headers.
- Form errors use `role="alert"`; status messages use `role="status"`.
- Buttons that trigger a consequential action are explicit about the action
  ("Submit for verification", "Approve case", "Accept and continue").
- The layout is responsive from 360 px; the operations table scrolls
  horizontally rather than overflowing the page.

## 7. Client-side authorisation

The client hides navigation a role cannot use, and route guards redirect a user
who opens a page they may not use. **Neither is a security control** — every
route is protected on the server, and a client that ignores the guard receives
`403` or `404`.
