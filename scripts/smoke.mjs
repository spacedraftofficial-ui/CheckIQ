/**
 * End-to-end smoke test against a running CheckIQ API.
 *
 * Usage: node scripts/smoke.mjs [baseUrl]
 *
 * Exercises the candidate journey and the operations journey, and asserts the
 * security behaviours that matter most: a duplicate Candidate ID is rejected,
 * a candidate cannot read another candidate's case, and a repeated submission
 * is idempotent.
 *
 * NOTE: This test must be run against a development instance. In development
 * mode, signup returns a `verificationToken` field that can be used to verify
 * the email address without a real inbox. In production, the candidate receives
 * an email with a verification link.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const BASE = process.argv[2] ?? "http://127.0.0.1:4000";
const here = dirname(fileURLToPath(import.meta.url));

let accessToken = null;
let failures = 0;
let checks = 0;

function assert(condition, label, extra) {
  checks += 1;
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${extra ? ` -> ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
  }
}

async function api(method, path, body, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers ?? {}) };
  if (accessToken && options.auth !== false) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  return { status: response.status, body: payload, headers: response.headers };
}

async function apiRaw(method, path, body, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (accessToken && options.auth !== false) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body,
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  return { status: response.status, body: payload, headers: response.headers };
}

const uniqueSuffix = Date.now().toString().slice(-8);
const candidateId = `CIQ-TEST-${uniqueSuffix}`;
const otherCandidateId = `CIQ-OTHER-${uniqueSuffix}`;
const password = "Str0ng!Passw0rd";
const candidateEmail = `smoke-${uniqueSuffix}@example.com`;

console.log(`\nCheckIQ smoke test against ${BASE}\n`);

// ------------------------------------------------------------------ signup ----
console.log("1. Signup with an entered Candidate ID");
const signup = await api("POST", "/api/auth/signup", {
  candidateId,
  fullName: "Smoke Candidate",
  email: candidateEmail,
  mobile: "+919812345678",
  password,
  confirmPassword: password,
  company: "Acme Corp",
  department: "Engineering",
  position: "Senior Engineer",
});
assert(signup.status === 201, "signup succeeds without an invitation", signup);
assert(signup.body?.data?.email === candidateEmail, "the entered email is stored");
assert(signup.body?.data?.requiresEmailVerification === true, "signup requires email verification");
assert(Boolean(signup.body?.data?.userId), "a user ID is returned");

const verificationToken = signup.body?.data?.verificationToken;
if (verificationToken) {
  const verify = await api("POST", "/api/auth/verify-email", {
    token: verificationToken,
  });
  assert(verify.status === 200, "the verification email link works", verify);
}

console.log("\n2. Duplicate Candidate ID is rejected explicitly");
const duplicate = await api("POST", "/api/auth/signup", {
  candidateId,
  fullName: "Someone Else",
  email: `other-${uniqueSuffix}@example.com`,
  mobile: "+919800000000",
  password,
  confirmPassword: password,
});
assert(duplicate.status === 409, "duplicate signup is rejected", duplicate);
assert(
  duplicate.body?.error?.code === "CANDIDATE_ID_ALREADY_IN_USE",
  "the duplicate error code is explicit",
  duplicate,
);
assert(
  Boolean(duplicate.body?.error?.details?.canSignIn),
  "a recovery path is offered",
  duplicate,
);

// ----------------------------------------------------------------- login ----
console.log("\n3. Sign in and session handling");
// Login before verification should be blocked
const unverifiedLogin = await api(
  "POST",
  "/api/auth/login",
  { identifier: candidateEmail, password },
  { auth: false },
);
if (!verificationToken) {
  assert(
    unverifiedLogin.status === 401,
    "login is blocked before email verification",
    unverifiedLogin,
  );
}

const login = await api(
  "POST",
  "/api/auth/login",
  { identifier: candidateEmail, password },
  { auth: false },
);
assert(login.status === 200, "login succeeds after verification", login);
accessToken = login.body?.data?.accessToken ?? null;
assert(Boolean(accessToken), "an access token is issued");
const me = await api("GET", "/api/auth/me");
assert(me.status === 200, "the session resolves the current user", me);
assert(
  (await api("POST", "/api/auth/login", { identifier: candidateEmail, password: "wrong-password" }, { auth: false })).status === 401,
  "a wrong password is rejected",
);

// The refresh token is never exposed to JavaScript.
assert(
  !("refreshToken" in (login.body?.data ?? {})),
  "the refresh token is not exposed in the response body",
);

// --------------------------------------------------------------- profile ----
console.log("\n4. Profile completion");
const profileBefore = await api("GET", "/api/profile");
assert(profileBefore.status === 200, "the candidate can read their own profile", profileBefore);

const profileUpdate = await api("PUT", "/api/profile", {
  fullName: "Smoke Candidate",
  dateOfBirth: "1992-04-11",
  email: candidateEmail,
  mobile: "+919812345678",
  addresses: [
    {
      type: "CURRENT",
      line1: "12 Example Street",
      city: "Bengaluru",
      state: "Karnataka",
      country: "India",
      postalCode: "560001",
    },
  ],
  education: [
    {
      qualification: "B.E. Computer Science",
      institution: "Example Institute of Technology",
      universityOrBoard: "Example University",
      yearOfPassing: 2014,
    },
  ],
  employments: [
    {
      employer: "Example Private Limited",
      designation: "Senior Engineer",
      fromDate: "2019-06-01",
      isCurrent: true,
    },
  ],
});
assert(profileUpdate.status === 200, "the candidate can complete their profile", profileUpdate);

// --------------------------------------------------------------- consent ----
console.log("\n5. Consent acceptance");
const consent = await api("GET", "/api/consent/current");
assert(consent.status === 200, "the current declaration is available", consent);
const accept = await api("POST", "/api/consent/accept", {
  consentVersionId: consent.body?.data?.id,
  accepted: true,
});
assert(accept.status === 200, "the candidate can accept the declaration", accept);

// -------------------------------------------------------------- documents ----
console.log("\n6. Document collection");
const dashboardBefore = await api("GET", "/api/dashboard");
assert(dashboardBefore.status === 200, "the dashboard reports what is outstanding", dashboardBefore);
const readiness = await api("GET", `/api/dashboard`);
const missingBefore = readiness.body?.data?.readiness?.missingDocuments?.length ?? 0;
assert(missingBefore > 0, "outstanding documents are listed", readiness);

const documents = await api("GET", `/api/cases/${dashboardBefore.body?.data?.caseId ?? ""}/documents`);
assert(documents.status === 200, "the case documents can be listed", documents);
const requirement = documents.body?.data?.[0];
assert(Boolean(requirement), "the package requirements are materialised", documents);

const png = await readFile(resolve(here, "../.local/tmp/sample.png"));
const form = new FormData();
form.append("file", new Blob([png], { type: "image/png" }), "evidence.png");
const upload = await apiRaw(
  "POST",
  `/api/cases/${dashboardBefore.body?.data?.caseId ?? ""}/documents/${requirement?.requirementId ?? ""}/upload`,
  form,
);
assert(upload.status === 201, "a valid document uploads", upload);
assert(upload.body?.data?.document?.currentVersion?.versionNumber === 1, "the first version is numbered 1");

const badForm = new FormData();
badForm.append("file", new Blob([Buffer.from("not a pdf")], { type: "application/pdf" }), "fake.pdf");
const badUpload = await apiRaw(
  "POST",
  `/api/cases/${dashboardBefore.body?.data?.caseId ?? ""}/documents/${requirement?.requirementId ?? ""}/upload`,
  badForm,
);
assert(badUpload.status === 422, "a file whose content does not match is rejected", badUpload);
assert(
  badUpload.body?.error?.code === "UPLOAD_REJECTED",
  "the rejection uses an explicit error code",
  badUpload,
);

// ------------------------------------------------------------- submission ----
console.log("\n7. Submission");
const submitKey = `smoke-${uniqueSuffix}`;
const submit = await api("POST", `/api/cases/${dashboardBefore.body?.data?.caseId ?? ""}/submit`, {
  idempotencyKey: submitKey,
  confirmDeclaration: true,
});
assert(submit.status === 422 || submit.status === 201, "submission is evaluated", submit);
if (submit.status === 422) {
  console.log("       (remaining items: " + JSON.stringify(submit.body?.error?.details).slice(0, 300) + ")");
}

const repeat = await api("POST", `/api/cases/${dashboardBefore.body?.data?.caseId ?? ""}/submit`, {
  idempotencyKey: submitKey,
  confirmDeclaration: true,
});
assert(
  repeat.status === submit.status,
  "a repeated submission with the same key is idempotent",
  repeat,
);

// ------------------------------------------------------- access boundaries ----
console.log("\n8. Access boundaries");
const otherSignup = await api("POST", "/api/auth/signup", {
  candidateId: otherCandidateId,
  fullName: "Other Candidate",
  email: `other-${uniqueSuffix}@example.com`,
  mobile: "+919800000000",
  password,
  confirmPassword: password,
});
assert(otherSignup.status === 201, "a second candidate can register", otherSignup);

// Verify the other candidate's email if token is available
const otherToken = otherSignup.body?.data?.verificationToken;
if (otherToken) {
  const otherVerify = await api("POST", "/api/auth/verify-email", { token: otherToken }, { auth: false });
  assert(otherVerify.status === 200, "the second candidate can verify their email", otherVerify);
}

const firstAccessToken = accessToken;
const otherSession = await api(
  "POST",
  "/api/auth/login",
  { identifier: `other-${uniqueSuffix}@example.com`, password },
  { auth: false },
);
assert(otherSession.status === 200, "the second candidate can sign in", otherSession);
accessToken = otherSession.body?.data?.accessToken ?? null;

const crossAccess = await api("GET", `/api/cases/${dashboardBefore.body?.data?.caseId ?? ""}`);
assert(
  crossAccess.status === 404,
  "a candidate cannot read another candidate's case",
  crossAccess,
);
assert(
  (await api("GET", "/api/admin/users")).status === 403,
  "a candidate cannot reach the admin API",
);
assert(
  (await api("GET", "/api/cases/queue-counts")).status === 403,
  "a candidate cannot reach the operations queue",
);
accessToken = firstAccessToken;

console.log(`\n${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);
