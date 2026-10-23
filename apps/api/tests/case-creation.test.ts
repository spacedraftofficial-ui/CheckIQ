import { beforeAll, describe, expect, it } from "vitest";
import {
  api,
  createCandidate,
  createCandidateWithoutCase,
  createStaff,
  resetDatabase,
} from "./helpers.js";

/**
 * Case creation by HR.
 *
 * The `case:create` permission is held by HR, the administrator and the super
 * administrator. A case belongs to a candidate profile, and a profile belongs
 * to an account, so the candidate must have registered first.
 */
describe("case creation", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  it("opens a case for a candidate who has already registered", async () => {
    const candidate = await createCandidateWithoutCase();
    const hr = await createStaff(["HR_RECRUITMENT"]);

    const response = await api({
      method: "post",
      path: "/api/cases",
      token: hr.token,
      body: {
        candidateId: candidate.candidateId,
        company: "Acme Corp",
        department: "Engineering",
        position: "Senior Engineer",
      },
    });

    expect(response.status).toBe(201);
    expect(response.body.data.candidateId).toBe(candidate.candidateId);
    expect(response.body.data.status).toBe("DOCUMENT_UPLOAD_IN_PROGRESS");
    expect(response.body.data.caseNumber).toBeTruthy();
  });

  it("refuses to open a case for a Candidate ID that is not registered", async () => {
    const hr = await createStaff(["HR_RECRUITMENT"]);

    const response = await api({
      method: "post",
      path: "/api/cases",
      token: hr.token,
      body: { candidateId: "CIQ-NOBODY-000001" },
    });

    expect(response.status).toBe(422);
    expect(response.body.error.message).toContain("must create their account");
  });

  it("refuses to open a second case for the same candidate and package", async () => {
    const candidate = await createCandidateWithoutCase();
    const hr = await createStaff(["HR_RECRUITMENT"]);

    const first = await api({
      method: "post",
      path: "/api/cases",
      token: hr.token,
      body: { candidateId: candidate.candidateId },
    });
    expect(first.status).toBe(201);

    const response = await api({
      method: "post",
      path: "/api/cases",
      token: hr.token,
      body: { candidateId: candidate.candidateId },
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("CONFLICT");
  });

  it("refuses case creation to a candidate", async () => {
    const candidate = await createCandidate();

    const response = await api({
      method: "post",
      path: "/api/cases",
      token: candidate.token,
      body: { candidateId: candidate.candidateId },
    });

    expect(response.status).toBe(403);
  });

  it("refuses case creation to a BGV executive", async () => {
    const executive = await createStaff(["BGV_EXECUTIVE"]);

    const response = await api({
      method: "post",
      path: "/api/cases",
      token: executive.token,
      body: { candidateId: "CIQ-ANY-000001" },
    });

    expect(response.status).toBe(403);
  });

  it("instantiates the package documents and checks for the new case", async () => {
    const candidate = await createCandidateWithoutCase();
    const hr = await createStaff(["HR_RECRUITMENT"]);

    const created = await api({
      method: "post",
      path: "/api/cases",
      token: hr.token,
      body: { candidateId: candidate.candidateId },
    });

    const documents = await api({
      method: "get",
      path: `/api/cases/${created.body.data.id}/documents`,
      token: hr.token,
    });
    const checks = await api({
      method: "get",
      path: `/api/cases/${created.body.data.id}/checks`,
      token: hr.token,
    });

    expect(documents.status).toBe(200);
    expect(documents.body.data.length).toBeGreaterThan(0);
    expect(checks.status).toBe(200);
    expect(checks.body.data.length).toBeGreaterThan(0);
  });

  it("notifies the candidate that documents are required", async () => {
    const candidate = await createCandidateWithoutCase();
    const hr = await createStaff(["HR_RECRUITMENT"]);

    await api({
      method: "post",
      path: "/api/cases",
      token: hr.token,
      body: { candidateId: candidate.candidateId },
    });

    const notifications = await api({
      method: "get",
      path: "/api/notifications",
      token: candidate.token,
    });

    const required = notifications.body.data.find(
      (notification: { event: string }) => notification.event === "DOCUMENTS_REQUIRED",
    );
    expect(required).toBeTruthy();
    expect(required.body).toContain("document");
  });

  it("records the case creation in the audit trail", async () => {
    const candidate = await createCandidateWithoutCase();
    const hr = await createStaff(["HR_RECRUITMENT"]);
    const admin = await createStaff(["ADMINISTRATOR"]);

    const created = await api({
      method: "post",
      path: "/api/cases",
      token: hr.token,
      body: { candidateId: candidate.candidateId },
    });

    const audit = await api({
      method: "get",
      path: `/api/admin/audit?action=CASE_CREATED&caseId=${created.body.data.id}`,
      token: admin.token,
    });

    expect(audit.status).toBe(200);
    expect(audit.body.data.length).toBeGreaterThan(0);
    expect(audit.body.data[0].actorRole).toBe("HR_RECRUITMENT");
  });
});
