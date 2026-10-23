import { beforeAll, describe, expect, it } from "vitest";
import {
  TINY_PNG,
  acceptConsent,
  api,
  completeProfile,
  createCandidate,
  createStaff,
  resetDatabase,
  uploadDocument,
  uploadMandatoryDocuments,
} from "./helpers.js";

/**
 * The audit trail: it records what happened, it never contains secrets, and
 * it cannot be edited or deleted through the API.
 */
describe("audit trail", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  it("records an event for each significant action", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);
    await acceptConsent(candidate);

    const documents = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/documents`,
      token: candidate.token,
    });
    await uploadDocument(
      candidate,
      documents.body.data[0].requirementId,
      TINY_PNG,
      "identity.png",
      "image/png",
    );

    const admin = await createStaff(["ADMINISTRATOR"]);

    const actions = [
      "USER_CREATED",
      "CANDIDATE_ID_REGISTERED",
      "CASE_CREATED",
      "PROFILE_UPDATED",
      "CONSENT_ACCEPTED",
      "DOCUMENT_UPLOADED",
    ];

    for (const action of actions) {
      const response = await api({
        method: "get",
        path: `/api/admin/audit?action=${action}&candidateId=${candidate.candidateId}`,
        token: admin.token,
      });
      expect(response.status, action).toBe(200);
      expect(response.body.data.length, action).toBeGreaterThan(0);
      expect(response.body.data[0].action).toBe(action);
    }
  });

  it("records the previous and new value for a change", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);
    const admin = await createStaff(["ADMINISTRATOR"]);

    const response = await api({
      method: "get",
      path: `/api/admin/audit?action=PROFILE_UPDATED&candidateId=${candidate.candidateId}`,
      token: admin.token,
    });

    expect(response.status).toBe(200);
    const event = response.body.data[0];
    expect(event.previousValue).toBeTruthy();
    expect(event.newValue).toBeTruthy();
    expect(event.actorId).toBeTruthy();
    expect(event.createdAt).toBeTruthy();
  });

  it("never stores a password or a token in an audit event", async () => {
    const candidate = await createCandidate();
    const admin = await createStaff(["ADMINISTRATOR"]);

    const response = await api({
      method: "get",
      path: `/api/admin/audit?candidateId=${candidate.candidateId}&pageSize=100`,
      token: admin.token,
    });

    const serialised = JSON.stringify(response.body.data);
    expect(serialised).not.toContain("Str0ng!Passw0rd");
    expect(serialised).not.toContain("passwordHash");
    expect(serialised).not.toContain("refreshToken");
  });

  it("exposes no route that edits or deletes an audit event", async () => {
    const admin = await createStaff(["ADMINISTRATOR"]);
    const list = await api({ method: "get", path: "/api/admin/audit", token: admin.token });
    const eventId = list.body.data[0]?.id ?? "00000000-0000-0000-0000-000000000000";

    for (const method of ["patch", "put", "delete"] as const) {
      const response = await api({
        method,
        path: `/api/admin/audit/${eventId}`,
        token: admin.token,
        body: { reason: "attempted edit" },
      });
      expect(response.status).toBe(404);
    }
  });

  it("records a rejected duplicate Candidate ID", async () => {
    const candidate = await createCandidate();
    await api({
      method: "post",
      path: "/api/auth/signup",
      body: {
        candidateId: candidate.candidateId,
        fullName: "Duplicate",
        email: "duplicate@example.test",
        mobile: "+919800000000",
        password: "Str0ng!Passw0rd",
        confirmPassword: "Str0ng!Passw0rd",
      },
    });

    const admin = await createStaff(["ADMINISTRATOR"]);
    const response = await api({
      method: "get",
      path: "/api/admin/audit?action=CANDIDATE_ID_DUPLICATE_REJECTED",
      token: admin.token,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it("records a document download", async () => {
    const candidate = await createCandidate();
    const documents = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/documents`,
      token: candidate.token,
    });
    const uploaded = await uploadDocument(
      candidate,
      documents.body.data[0].requirementId,
      TINY_PNG,
      "identity.png",
      "image/png",
    );

    await api({
      method: "get",
      path: `/api/documents/${uploaded.body.data.document.id}/versions/${uploaded.body.data.document.currentVersion.id}/download`,
      token: candidate.token,
    });

    const admin = await createStaff(["ADMINISTRATOR"]);
    const response = await api({
      method: "get",
      path: "/api/admin/audit?action=DOCUMENT_DOWNLOADED",
      token: admin.token,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it("records a role change with the previous and new roles", async () => {
    const admin = await createStaff(["ADMINISTRATOR"]);
    const staff = await createStaff(["BGV_EXECUTIVE"]);

    const response = await api({
      method: "patch",
      path: `/api/admin/users/${staff.userId}`,
      token: admin.token,
      body: {
        roles: ["BGV_EXECUTIVE", "BGV_REVIEWER"],
        reason: "Promoted to reviewer",
      },
    });

    expect(response.status).toBe(200);

    const audit = await api({
      method: "get",
      path: "/api/admin/audit?action=USER_ROLE_CHANGED",
      token: admin.token,
    });
    expect(audit.body.data.length).toBeGreaterThan(0);
    const event = audit.body.data[0];
    expect(event.previousValue.roles).toEqual(["BGV_EXECUTIVE"]);
    expect(event.newValue.roles).toEqual(["BGV_EXECUTIVE", "BGV_REVIEWER"]);
    expect(event.reason).toBe("Promoted to reviewer");
  });

  it("keeps every audit event for a completed submission", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);
    await acceptConsent(candidate);
    await uploadMandatoryDocuments(candidate);
    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/submit`,
      token: candidate.token,
      body: { idempotencyKey: `audit-submit-${candidate.candidateId}`, confirmDeclaration: true },
    });

    const admin = await createStaff(["ADMINISTRATOR"]);
    const response = await api({
      method: "get",
      path: `/api/admin/audit?action=CASE_SUBMITTED&caseId=${candidate.caseId}`,
      token: admin.token,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(1);
  });
});
