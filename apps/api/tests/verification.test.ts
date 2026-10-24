import { beforeAll, describe, expect, it } from "vitest";
import {
  acceptConsent,
  api,
  completeProfile,
  createCandidate,
  createStaff,
  resetDatabase,
  uploadMandatoryDocuments,
  uniqueCandidateId,
} from "./helpers.js";

/**
 * Verification workflow: check results, clarification, resubmission, invalid
 * transitions and maker-checker separation.
 */
describe("verification", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  async function submitReadyCase() {
    const candidate = await createCandidate();
    await completeProfile(candidate);
    await acceptConsent(candidate);
    await uploadMandatoryDocuments(candidate);
    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/submit`,
      token: candidate.token,
      body: { idempotencyKey: `verify-${candidate.candidateId}`, confirmDeclaration: true },
    });
    return candidate;
  }

  it("records a check result and keeps the previous result in the history", async () => {
    const candidate = await submitReadyCase();
    const executive = await createStaff(["BGV_EXECUTIVE"]);
    const admin = await createStaff(["ADMINISTRATOR"]);

    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/assign`,
      token: admin.token,
      body: { verifierId: executive.userId },
    });

    const checks = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/checks`,
      token: executive.token,
    });
    const check = checks.body.data[0];

    const first = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/checks/${check.id}/result`,
      token: executive.token,
      body: { status: "DISCREPANCY_FOUND", remarks: "Name on the document differs" },
    });
    expect(first.status).toBe(201);

    const second = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/checks/${check.id}/result`,
      token: executive.token,
      body: { status: "VERIFIED", remarks: "Resolved after the candidate provided a corrected document" },
    });
    expect(second.status).toBe(201);

    const results = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/checks/${check.id}/results`,
      token: executive.token,
    });

    expect(results.body.data.length).toBe(2);
    expect(results.body.data[0].status).toBe("DISCREPANCY_FOUND");
    expect(results.body.data[1].status).toBe("VERIFIED");
    expect(results.body.data.filter((row: { isCurrent: boolean }) => row.isCurrent).length).toBe(1);
  });

  it("requires remarks for a discrepancy outcome", async () => {
    const candidate = await submitReadyCase();
    const executive = await createStaff(["BGV_EXECUTIVE"]);
    const admin = await createStaff(["ADMINISTRATOR"]);
    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/assign`,
      token: admin.token,
      body: { verifierId: executive.userId },
    });

    const checks = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/checks`,
      token: executive.token,
    });
    const check = checks.body.data[0];

    const response = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/checks/${check.id}/result`,
      token: executive.token,
      body: { status: "DISCREPANCY_FOUND" },
    });

    expect(response.status).toBe(422);
  });

  it("raises a clarification, notifies the candidate and moves the case", async () => {
    const candidate = await submitReadyCase();
    const executive = await createStaff(["BGV_EXECUTIVE"]);
    const admin = await createStaff(["ADMINISTRATOR"]);
    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/assign`,
      token: admin.token,
      body: { verifierId: executive.userId },
    });

    const checks = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/checks`,
      token: executive.token,
    });
    const check = checks.body.data[0];

    const response = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/clarifications`,
      token: executive.token,
      body: {
        checkId: check.id,
        issueSummary: "The uploaded address proof is not legible",
        requiredAction: "Upload a clearer scan showing the address and the last three months",
        remarks: "The current scan is too low resolution",
        dueDate: "2026-12-01",
      },
    });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe("OPEN");

    const detail = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}`,
      token: candidate.token,
    });
    expect(detail.body.data.status).toBe("CLARIFICATION_REQUIRED");

    const notifications = await api({
      method: "get",
      path: "/api/notifications",
      token: candidate.token,
    });
    const clarificationNotice = notifications.body.data.find(
      (notification: { event: string }) => notification.event === "CLARIFICATION_REQUESTED",
    );
    expect(clarificationNotice).toBeTruthy();
  });

  it("lets the candidate respond and records the response", async () => {
    const candidate = await submitReadyCase();
    const executive = await createStaff(["BGV_EXECUTIVE"]);
    const admin = await createStaff(["ADMINISTRATOR"]);
    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/assign`,
      token: admin.token,
      body: { verifierId: executive.userId },
    });

    const checks = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/checks`,
      token: executive.token,
    });
    const check = checks.body.data[0];

    const created = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/clarifications`,
      token: executive.token,
      body: {
        checkId: check.id,
        issueSummary: "The uploaded address proof is not legible",
        requiredAction: "Upload a clearer scan",
      },
    });

    const response = await api({
      method: "post",
      path: `/api/clarifications/${created.body.data.id}/respond`,
      token: candidate.token,
      body: { responseText: "I have uploaded a clearer scan" },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("RESPONDED");

    const clarifications = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/clarifications`,
      token: executive.token,
    });
    expect(clarifications.body.data[0].responseText).toBe("I have uploaded a clearer scan");
  });

  it("records a late response without rejecting it", async () => {
    const candidate = await submitReadyCase();
    const executive = await createStaff(["BGV_EXECUTIVE"]);
    const admin = await createStaff(["ADMINISTRATOR"]);
    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/assign`,
      token: admin.token,
      body: { verifierId: executive.userId },
    });

    const created = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/clarifications`,
      token: executive.token,
      body: {
        issueSummary: "The uploaded address proof is not legible",
        requiredAction: "Upload a clearer scan",
        dueDate: "2020-01-01",
      },
    });

    const response = await api({
      method: "post",
      path: `/api/clarifications/${created.body.data.id}/respond`,
      token: candidate.token,
      body: { responseText: "Sorry for the delay" },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.isLate).toBe(true);
  });

  it("refuses to submit while a clarification is still open", async () => {
    const candidate = await submitReadyCase();
    const executive = await createStaff(["BGV_EXECUTIVE"]);
    const admin = await createStaff(["ADMINISTRATOR"]);
    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/assign`,
      token: admin.token,
      body: { verifierId: executive.userId },
    });

    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/clarifications`,
      token: executive.token,
      body: {
        issueSummary: "The uploaded address proof is not legible",
        requiredAction: "Upload a clearer scan",
      },
    });

    const response = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/readiness`,
      token: candidate.token,
    });

    expect(response.body.data.ready).toBe(false);
    expect(response.body.data.missing.openClarifications.length).toBe(1);
  });

  it("closes a clarification and keeps the thread history", async () => {
    const candidate = await submitReadyCase();
    const executive = await createStaff(["BGV_EXECUTIVE"]);
    const admin = await createStaff(["ADMINISTRATOR"]);
    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/assign`,
      token: admin.token,
      body: { verifierId: executive.userId },
    });

    const created = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/clarifications`,
      token: executive.token,
      body: {
        issueSummary: "The uploaded address proof is not legible",
        requiredAction: "Upload a clearer scan",
      },
    });

    const response = await api({
      method: "post",
      path: `/api/clarifications/${created.body.data.id}/close`,
      token: executive.token,
      body: { reason: "Verified against the source record" },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("CLOSED");

    const clarifications = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/clarifications`,
      token: executive.token,
    });
    expect(clarifications.body.data[0].status).toBe("CLOSED");
    expect(clarifications.body.data[0].issueSummary).toBe(
      "The uploaded address proof is not legible",
    );
  });

  it("rejects an invalid status transition on the backend", async () => {
    const candidate = await createCandidate();
    const reviewer = await createStaff(["BGV_REVIEWER"]);

    // The case is still in DOCUMENT_UPLOAD_IN_PROGRESS, so it cannot be
    // approved.
    const response = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/approval`,
      token: reviewer.token,
      body: { decision: "APPROVED", remarks: "Attempted early approval" },
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("INVALID_STATE_TRANSITION");
  });

  it("rejects a self-approval when maker-checker applies", async () => {
    const candidate = await submitReadyCase();
    const reviewer = await createStaff(["BGV_REVIEWER"]);
    const admin = await createStaff(["ADMINISTRATOR"]);

    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/assign`,
      token: admin.token,
      body: { verifierId: reviewer.userId },
    });

    const checks = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/checks`,
      token: reviewer.token,
    });
    const check = checks.body.data[0];

    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/checks/${check.id}/result`,
      token: reviewer.token,
      body: { status: "VERIFIED", remarks: "Confirmed" },
    });

    const response = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/approval`,
      token: reviewer.token,
      body: { decision: "APPROVED", remarks: "Self approval attempt" },
    });

    expect(response.status).toBe(403);
  });

  it("allows an administrator to manually verify a candidate's email", async () => {
    const admin = await createStaff(["ADMINISTRATOR"]);
    const { getDatabase, schema } = await import("../src/db/client.js");

    // Create an unverified candidate by directly inserting into the database
    const { hash } = await import("@node-rs/argon2");
    const passwordHash = await hash("Str0ng!Passw0rd");
    const userId = crypto.randomUUID();
    const candidateId = uniqueCandidateId();
    const email = `${candidateId.toLowerCase()}@example.test`;
    const { db } = getDatabase();

    await db.insert(schema.users).values({
      id: userId,
      email,
      emailNormalized: email.toLowerCase(),
      passwordHash,
      fullName: "Unverified User",
      mobile: "+919876543210",
      isEmailVerified: false,
    });
    await db.insert(schema.userRoles).values({
      userId,
      roleCode: "CANDIDATE",
      assignedBy: null,
    });

    // Verify the user's email via the admin endpoint
    const response = await api({
      method: "post",
      path: `/api/admin/users/${userId}/verify-email`,
      token: admin.token,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.emailVerified).toBe(true);

    // Log in should now succeed
    const login = await api({
      method: "post",
      path: "/api/auth/login",
      body: { identifier: email, password: "Str0ng!Passw0rd" },
    });

    expect(login.status).toBe(200);
  });
});
