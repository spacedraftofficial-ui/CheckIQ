import { beforeAll, describe, expect, it } from "vitest";
import {
  TINY_PNG,
  api,
  createCandidate,
  createStaff,
  resetDatabase,
  uploadDocument,
} from "./helpers.js";

/**
 * Access boundaries.
 *
 * The server — not the client — decides who may read and change a record.
 */
describe("access control", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  it("prevents a candidate from reading another candidate's case", async () => {
    const first = await createCandidate();
    const second = await createCandidate();

    const response = await api({
      method: "get",
      path: `/api/cases/${first.caseId}`,
      token: second.token,
    });

    // A 404 rather than a 403, so the API does not confirm that the record
    // exists.
    expect(response.status).toBe(404);
  });

  it("prevents a candidate from listing another candidate's documents", async () => {
    const first = await createCandidate();
    const second = await createCandidate();

    const response = await api({
      method: "get",
      path: `/api/cases/${first.caseId}/documents`,
      token: second.token,
    });

    expect(response.status).toBe(404);
  });

  it("prevents a candidate from downloading another candidate's document", async () => {
    const first = await createCandidate();
    const second = await createCandidate();

    const documents = await api({
      method: "get",
      path: `/api/cases/${first.caseId}/documents`,
      token: first.token,
    });
    const requirement = documents.body.data[0];
    const uploaded = await uploadDocument(
      first,
      requirement.requirementId,
      TINY_PNG,
      "identity.png",
      "image/png",
    );
    const versionId = uploaded.body.data.document.currentVersion.id;

    const response = await api({
      method: "get",
      path: `/api/documents/${uploaded.body.data.document.id}/versions/${versionId}/download`,
      token: second.token,
    });

    expect(response.status).toBe(404);
  });

  it("prevents a candidate from reaching the operations queue", async () => {
    const candidate = await createCandidate();
    const response = await api({
      method: "get",
      path: "/api/cases/queue-counts",
      token: candidate.token,
    });
    expect(response.status).toBe(403);
  });

  it("prevents a candidate from reaching the administration API", async () => {
    const candidate = await createCandidate();
    for (const path of ["/api/admin/users", "/api/admin/config", "/api/admin/audit"]) {
      const response = await api({ method: "get", path, token: candidate.token });
      expect(response.status).toBe(403);
    }
  });

  it("prevents a candidate from recording a verification result", async () => {
    const candidate = await createCandidate();
    const checks = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/checks`,
      token: candidate.token,
    });
    const check = checks.body.data[0];

    const response = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/checks/${check.id}/result`,
      token: candidate.token,
      body: { status: "VERIFIED" },
    });

    expect(response.status).toBe(403);
  });

  it("allows a BGV executive into the operations queue", async () => {
    const executive = await createStaff(["BGV_EXECUTIVE"]);
    const response = await api({
      method: "get",
      path: "/api/cases/queue-counts",
      token: executive.token,
    });
    expect(response.status).toBe(200);
  });

  it("keeps individual check findings hidden from HR by default", async () => {
    const candidate = await createCandidate();
    const executive = await createStaff(["BGV_EXECUTIVE"]);
    const hr = await createStaff(["HR_RECRUITMENT"]);
    const admin = await createStaff(["ADMINISTRATOR"]);

    // Assignment is an administrative action; the executive cannot assign
    // work to themselves.
    const assignment = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/assign`,
      token: admin.token,
      body: { verifierId: executive.userId },
    });
    expect(assignment.status).toBe(200);

    const checks = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/checks`,
      token: executive.token,
    });
    expect(checks.status).toBe(200);
    const check = checks.body.data[0];
    expect(check).toBeTruthy();

    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/checks/${check.id}/result`,
      token: executive.token,
      body: { status: "VERIFIED", remarks: "Checked against the source record" },
    });

    const hrView = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/checks`,
      token: hr.token,
    });

    expect(hrView.status).toBe(200);
    expect(hrView.body.data[0].remarks).toBeNull();
  });

  it("keeps the audit trail out of reach of a candidate", async () => {
    const candidate = await createCandidate();
    const response = await api({
      method: "get",
      path: "/api/admin/audit",
      token: candidate.token,
    });
    expect(response.status).toBe(403);
  });

  it("exposes the audit trail to an administrator", async () => {
    const admin = await createStaff(["ADMINISTRATOR"]);
    const response = await api({ method: "get", path: "/api/admin/audit", token: admin.token });
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it("rejects an unauthenticated request to a protected route", async () => {
    const response = await api({ method: "get", path: "/api/dashboard" });
    expect(response.status).toBe(401);
  });

  it("rejects a request with a tampered access token", async () => {
    const candidate = await createCandidate();
    const response = await api({
      method: "get",
      path: "/api/dashboard",
      token: `${candidate.token.slice(0, -4)}AAAA`,
    });
    expect(response.status).toBe(401);
  });
});
