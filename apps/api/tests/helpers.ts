import type { Express } from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import { getDatabase, schema } from "../src/db/client.js";
import { runSeed } from "../src/db/seed.js";
import { createApp } from "../src/app.js";

/**
 * Integration test helpers.
 *
 * The tests run against the dedicated `checkiq_test` database. Each test file
 * starts from a truncated, re-seeded baseline so that cases are independent.
 */

let app: Express | undefined;

export function getApp(): Express {
  if (!app) app = createApp();
  return app;
}

/** Truncates every table and re-applies the seed data. */
export async function resetDatabase(): Promise<void> {
  const { pool, db } = getDatabase();
  const connection = await pool.getConnection();
  try {
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    const [tables] = await connection.query<{ TABLE_NAME: string }[]>(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()",
    );
    for (const table of tables) {
      if (table.TABLE_NAME === "__drizzle_migrations") continue;
      await connection.query(`TRUNCATE TABLE \`${table.TABLE_NAME}\``);
    }
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    connection.release();
  }
  await runSeed(db);
}

export interface AuthedRequest {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Issues a request against the API.
 *
 * Returns the supertest request object rather than a promise, so that
 * multipart uploads can chain `.attach(...)`. The object is a thenable, so
 * `await api({...})` still resolves the response.
 */
export function api(options: AuthedRequest) {
  let req = request(getApp())[options.method](options.path);
  if (options.token) req = req.set("Authorization", `Bearer ${options.token}`);
  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) req = req.set(key, value);
  }
  if (options.body !== undefined) req = req.send(options.body as object);
  return req;
}

let uniqueCounter = 0;

/** A unique Candidate ID for a test. */
export function uniqueCandidateId(prefix = "CIQ-TEST"): string {
  uniqueCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${uniqueCounter}`;
}

export const TEST_PASSWORD = "Str0ng!Passw0rd";

export interface CandidateSession {
  token: string;
  userId: string;
  candidateId: string;
  caseId: string;
  email: string;
}

/** Registers a candidate and returns their session. */
export async function createCandidate(overrides: Partial<{ candidateId: string; email: string; fullName: string }> = {}): Promise<CandidateSession> {
  const candidateId = overrides.candidateId ?? uniqueCandidateId();
  const email = overrides.email ?? `${candidateId.toLowerCase()}@example.test`;
  const response = await api({
    method: "post",
    path: "/api/auth/signup",
    body: {
      candidateId,
      fullName: overrides.fullName ?? "Test Candidate",
      email,
      mobile: "+919812345678",
      password: TEST_PASSWORD,
      confirmPassword: TEST_PASSWORD,
      company: "Test Company",
      department: "Engineering",
      position: "Senior Engineer",
    },
  });
  if (response.status !== 201) {
    throw new Error(`Candidate signup failed: ${response.status} ${JSON.stringify(response.body)}`);
  }

  // Mark email as verified in the test database
  const { db } = getDatabase();
  await db
    .update(schema.users)
    .set({ isEmailVerified: true })
    .where(eq(schema.users.emailNormalized, email.toLowerCase()));

  const login = await api({
    method: "post",
    path: "/api/auth/login",
    body: { identifier: email, password: TEST_PASSWORD },
  });
  if (login.status !== 200) {
    throw new Error(`Candidate login failed: ${login.status} ${JSON.stringify(login.body)}`);
  }

  const sessionUser = login.body.data.user;
  const dashboard = await api({
    method: "get",
    path: "/api/dashboard",
    token: login.body.data.accessToken,
  });

  return {
    token: login.body.data.accessToken,
    userId: sessionUser.id,
    candidateId,
    caseId: dashboard.body.data.caseId,
    email,
  };
}

/** Completes the candidate profile so the case can reach submission. */
export async function completeProfile(candidate: CandidateSession): Promise<void> {
  const response = await api({
    method: "put",
    path: "/api/profile",
    token: candidate.token,
    body: {
      fullName: "Test Candidate",
      dateOfBirth: "1990-05-04",
      email: candidate.email,
      mobile: "+919812345678",
      addresses: [
        {
          type: "CURRENT",
          line1: "1 Test Street",
          city: "Bengaluru",
          state: "Karnataka",
          country: "India",
          postalCode: "560001",
        },
      ],
      education: [
        {
          qualification: "B.E.",
          institution: "Test Institute",
          universityOrBoard: "Test University",
          yearOfPassing: 2012,
        },
      ],
      employments: [
        {
          employer: "Test Employer",
          designation: "Engineer",
          fromDate: "2018-01-01",
          isCurrent: true,
        },
      ],
    },
  });
  if (response.status !== 200) {
    throw new Error(`Profile update failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
}

/** Accepts the current consent version. */
export async function acceptConsent(candidate: CandidateSession): Promise<void> {
  const consent = await api({
    method: "get",
    path: "/api/consent/current",
    token: candidate.token,
  });
  const response = await api({
    method: "post",
    path: "/api/consent/accept",
    token: candidate.token,
    body: { consentVersionId: consent.body.data.id, accepted: true },
  });
  if (response.status !== 200) {
    throw new Error(`Consent acceptance failed: ${response.status}`);
  }
}

/** A 1x1 PNG used to satisfy the upload validation. */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export interface StaffSession {
  token: string;
  userId: string;
  email: string;
}

/**
 * Registers a candidate **without** creating a case.
 *
 * This models a candidate who created their account first and whose case is
 * opened afterwards by HR — the scenario the `case:create` permission exists
 * for.
 */
export async function createCandidateWithoutCase(
  overrides: Partial<{ candidateId: string; email: string; fullName: string }> = {},
): Promise<CandidateSession> {
  const candidateId = overrides.candidateId ?? uniqueCandidateId();
  const email = overrides.email ?? `${candidateId.toLowerCase()}@example.test`;
  const password = TEST_PASSWORD;
  const { hash } = await import("@node-rs/argon2");
  const passwordHash = await hash(password);
  const userId = crypto.randomUUID();

  const { db } = getDatabase();
  await db.insert(schema.users).values({
    id: userId,
    email,
    emailNormalized: email.toLowerCase(),
    passwordHash,
    fullName: overrides.fullName ?? "Registered Candidate",
    mobile: "+919812345678",
    isEmailVerified: true,
  });
  await db.insert(schema.userRoles).values({
    userId,
    roleCode: "CANDIDATE",
    assignedBy: null,
  });
  await db.insert(schema.candidateProfiles).values({
    id: crypto.randomUUID(),
    userId,
    candidateId,
    fullName: overrides.fullName ?? "Registered Candidate",
    email,
    mobile: "+919812345678",
  });

  const login = await api({
    method: "post",
    path: "/api/auth/login",
    body: { identifier: email, password },
  });
  if (login.status !== 200) {
    throw new Error(`Candidate login failed: ${login.status} ${JSON.stringify(login.body)}`);
  }

  return {
    token: login.body.data.accessToken,
    userId,
    candidateId,
    caseId: "",
    email,
  };
}

/** Creates a staff account with the given roles and signs it in. */
export async function createStaff(roles: string[]): Promise<StaffSession> {
  const { db } = getDatabase();
  const email = `staff-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}@checkiq.test`;
  const password = TEST_PASSWORD;

  const { hash } = await import("@node-rs/argon2");
  const passwordHash = await hash(password);
  const userId = crypto.randomUUID();

  await db.insert(schema.users).values({
    id: userId,
    email,
    emailNormalized: email.toLowerCase(),
    passwordHash,
    fullName: "Test Staff",
    mobile: "+919800000000",
    isEmailVerified: true,
  });
  await db.insert(schema.userRoles).values(
    roles.map((role) => ({ userId, roleCode: role, assignedBy: null })),
  );

  const login = await api({
    method: "post",
    path: "/api/auth/login",
    body: { identifier: email, password },
  });
  if (login.status !== 200) {
    throw new Error(`Staff login failed: ${login.status} ${JSON.stringify(login.body)}`);
  }

  return { token: login.body.data.accessToken, userId, email };
}

/** Uploads a placeholder document against every mandatory requirement. */
export async function uploadMandatoryDocuments(
  candidate: CandidateSession,
): Promise<void> {
  const documents = await api({
    method: "get",
    path: `/api/cases/${candidate.caseId}/documents`,
    token: candidate.token,
  });

  for (const document of documents.body.data) {
    if (!document.isMandatory) continue;
    const response = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/documents/${document.requirementId}/upload`,
      token: candidate.token,
    }).attach("file", TINY_PNG, { filename: "evidence.png", contentType: "image/png" });
    if (response.status !== 201) {
      throw new Error(
        `Document upload failed: ${response.status} ${JSON.stringify(response.body)}`,
      );
    }
  }
}

/** Uploads an arbitrary payload for a requirement. */
export async function uploadDocument(
  candidate: CandidateSession,
  requirementId: string,
  payload: Buffer,
  filename: string,
  contentType: string,
) {
  return api({
    method: "post",
    path: `/api/cases/${candidate.caseId}/documents/${requirementId}/upload`,
    token: candidate.token,
  }).attach("file", payload, { filename, contentType });
}
