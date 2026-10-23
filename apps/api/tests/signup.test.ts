import { beforeAll, describe, expect, it } from "vitest";
import {
  api,
  completeProfile,
  createCandidate,
  resetDatabase,
  uniqueCandidateId,
} from "./helpers.js";

/**
 * Signup behaviour with an entered Candidate ID, and the duplicate handling
 * that protects one candidate's data from another.
 */
describe("candidate signup", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  it("signs a candidate up with a Candidate ID that has not been pre-registered", async () => {
    const candidateId = uniqueCandidateId();
    const response = await api({
      method: "post",
      path: "/api/auth/signup",
      body: {
        candidateId,
        fullName: "New Candidate",
        email: `${candidateId.toLowerCase()}@example.test`,
        mobile: "+919812345678",
        password: "Str0ng!Passw0rd",
        confirmPassword: "Str0ng!Passw0rd",
      },
    });

    expect(response.status).toBe(201);
    expect(response.body.data.user.candidateId).toBe(candidateId);
    expect(response.body.data.user.roles).toEqual(["CANDIDATE"]);
    expect(response.body.data.accessToken).toBeTruthy();
  });

  it("creates the candidate's BGV case in the document-upload state", async () => {
    const candidate = await createCandidate();
    const response = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}`,
      token: candidate.token,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("DOCUMENT_UPLOAD_IN_PROGRESS");
  });

  it("rejects a duplicate Candidate ID with an explicit conflict and a recovery path", async () => {
    const candidate = await createCandidate();

    const response = await api({
      method: "post",
      path: "/api/auth/signup",
      body: {
        candidateId: candidate.candidateId,
        fullName: "Someone Else",
        email: "someone-else@example.test",
        mobile: "+919800000000",
        password: "Str0ng!Passw0rd",
        confirmPassword: "Str0ng!Passw0rd",
      },
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("CANDIDATE_ID_ALREADY_IN_USE");
    expect(response.body.error.details.candidateId).toBe(candidate.candidateId);
    expect(response.body.error.details.canSignIn).toBe(true);
  });

  it("does not overwrite the existing account or case when a duplicate ID is used", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);

    const before = await api({
      method: "get",
      path: "/api/profile",
      token: candidate.token,
    });

    await api({
      method: "post",
      path: "/api/auth/signup",
      body: {
        candidateId: candidate.candidateId,
        fullName: "Impostor",
        email: "impostor@example.test",
        mobile: "+919800000000",
        password: "Str0ng!Passw0rd",
        confirmPassword: "Str0ng!Passw0rd",
      },
    });

    const after = await api({
      method: "get",
      path: "/api/profile",
      token: candidate.token,
    });

    expect(after.body.data.fullName).toBe(before.body.data.fullName);
    expect(after.body.data.candidateId).toBe(candidate.candidateId);
  });

  it("rejects a signup whose passwords do not match", async () => {
    const candidateId = uniqueCandidateId();
    const response = await api({
      method: "post",
      path: "/api/auth/signup",
      body: {
        candidateId,
        fullName: "Mismatched",
        email: `${candidateId.toLowerCase()}@example.test`,
        mobile: "+919812345678",
        password: "Str0ng!Passw0rd",
        confirmPassword: "Different!Passw0rd",
      },
    });

    expect(response.status).toBe(422);
  });

  it("records a signup audit event", async () => {
    const candidate = await createCandidate();
    const admin = await import("./helpers.js").then((module) =>
      module.createStaff(["ADMINISTRATOR"]),
    );

    const response = await api({
      method: "get",
      path: `/api/admin/audit?action=CANDIDATE_ID_REGISTERED&candidateId=${candidate.candidateId}`,
      token: admin.token,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.data[0].candidateId).toBe(candidate.candidateId);
  });
});
