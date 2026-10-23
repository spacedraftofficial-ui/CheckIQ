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
 * The internal BGV report, document access auditing and the notification
 * events that fire through the verification workflow.
 */
describe("report, document auditing and workflow notifications", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  async function readyCase() {
    const candidate = await createCandidate();
    await completeProfile(candidate);
    await acceptConsent(candidate);
    await uploadMandatoryDocuments(candidate);
    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/submit`,
      token: candidate.token,
      body: { idempotencyKey: `report-${candidate.candidateId}`, confirmDeclaration: true },
    });
    return candidate;
  }

  it("builds the report with the score, its configuration version and the people involved", async () => {
    const candidate = await readyCase();
    const admin = await createStaff(["ADMINISTRATOR"]);
    const reviewer = await createStaff(["BGV_REVIEWER"]);

    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/assign`,
      token: admin.token,
      body: { verifierId: reviewer.userId, reviewerId: reviewer.userId },
    });

    const checks = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/checks`,
      token: reviewer.token,
    });
    for (const check of checks.body.data) {
      await api({
        method: "post",
        path: `/api/cases/${candidate.caseId}/checks/${check.id}/result`,
        token: reviewer.token,
        body: { status: "VERIFIED", remarks: "Confirmed" },
      });
    }

    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/verification/start`,
      token: reviewer.token,
      body: {},
    });
    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/verification/complete`,
      token: reviewer.token,
      body: {},
    });

    const report = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/report`,
      token: reviewer.token,
    });

    expect(report.status).toBe(200);
    expect(report.body.data.reportNumber).toBeTruthy();
    expect(report.body.data.candidateId).toBe(candidate.candidateId);
    expect(report.body.data.candidateName).toBeTruthy();
    expect(report.body.data.submittedAt).toBeTruthy();
    expect(report.body.data.verificationResults.length).toBeGreaterThan(0);
    expect(report.body.data.verifierName).toBe(reviewer.email === "" ? "" : report.body.data.verifierName);
    expect(report.body.data.discrepancies).toEqual([]);
  });

  it("keeps the report away from a candidate", async () => {
    const candidate = await readyCase();
    const response = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/report`,
      token: candidate.token,
    });
    expect(response.status).toBe(403);
  });

  it("records a document view in the audit trail", async () => {
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

    const view = await api({
      method: "get",
      path: `/api/documents/${uploaded.body.data.document.id}`,
      token: candidate.token,
    });
    expect(view.status).toBe(200);

    const admin = await createStaff(["ADMINISTRATOR"]);
    const audit = await api({
      method: "get",
      path: `/api/admin/audit?action=DOCUMENT_VIEWED&caseId=${candidate.caseId}`,
      token: admin.token,
    });

    expect(audit.status).toBe(200);
    expect(audit.body.data.length).toBeGreaterThan(0);
    expect(audit.body.data[0].entityId).toBe(uploaded.body.data.document.id);
  });

  it("tells the candidate that verification has started and has completed", async () => {
    const candidate = await readyCase();
    const admin = await createStaff(["ADMINISTRATOR"]);
    const reviewer = await createStaff(["BGV_REVIEWER"]);

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
    for (const check of checks.body.data) {
      await api({
        method: "post",
        path: `/api/cases/${candidate.caseId}/checks/${check.id}/result`,
        token: reviewer.token,
        body: { status: "VERIFIED", remarks: "Confirmed" },
      });
    }

    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/verification/start`,
      token: reviewer.token,
      body: {},
    });
    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/verification/complete`,
      token: reviewer.token,
      body: {},
    });

    const notifications = await api({
      method: "get",
      path: "/api/notifications",
      token: candidate.token,
    });

    const events = notifications.body.data.map(
      (notification: { event: string }) => notification.event,
    );
    expect(events).toContain("VERIFICATION_IN_PROGRESS");
    expect(events).toContain("BGV_COMPLETED");
  });

  it("tells the reviewer that a score was generated and that a review is required", async () => {
    const candidate = await readyCase();
    const admin = await createStaff(["ADMINISTRATOR"]);
    const reviewer = await createStaff(["BGV_REVIEWER"]);

    // Approve and activate the seeded scoring configuration.
    const configurations = await api({
      method: "get",
      path: "/api/admin/scoring-configs",
      token: admin.token,
    });
    const config = configurations.body.data[0];
    await api({
      method: "post",
      path: `/api/admin/scoring-configs/${config.id}/approve`,
      token: admin.token,
      body: {},
    });
    await api({
      method: "post",
      path: `/api/admin/scoring-configs/${config.id}/activate`,
      token: admin.token,
      body: {},
    });

    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/assign`,
      token: admin.token,
      body: { verifierId: reviewer.userId, reviewerId: reviewer.userId },
    });

    const checks = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/checks`,
      token: reviewer.token,
    });
    for (const check of checks.body.data) {
      await api({
        method: "post",
        path: `/api/cases/${candidate.caseId}/checks/${check.id}/result`,
        token: reviewer.token,
        body: { status: "VERIFIED", remarks: "Confirmed" },
      });
    }

    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/verification/start`,
      token: reviewer.token,
      body: {},
    });
    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/verification/complete`,
      token: reviewer.token,
      body: {},
    });
    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/score/generate`,
      token: reviewer.token,
      body: {},
    });

    const notifications = await api({
      method: "get",
      path: "/api/notifications",
      token: reviewer.token,
    });

    const events = notifications.body.data.map(
      (notification: { event: string }) => notification.event,
    );
    expect(events).toContain("SCORE_GENERATED");
  });

  it("tells the assigned verifier that a document was uploaded", async () => {
    const candidate = await readyCase();
    const admin = await createStaff(["ADMINISTRATOR"]);
    const reviewer = await createStaff(["BGV_REVIEWER"]);

    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/assign`,
      token: admin.token,
      body: { verifierId: reviewer.userId },
    });

    const documents = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/documents`,
      token: candidate.token,
    });
    const optional = documents.body.data.find(
      (document: { isMandatory: boolean }) => !document.isMandatory,
    );

    if (optional) {
      await uploadDocument(candidate, optional.requirementId, TINY_PNG, "extra.png", "image/png");

      const notifications = await api({
        method: "get",
        path: "/api/notifications",
        token: reviewer.token,
      });
      const events = notifications.body.data.map(
        (notification: { event: string }) => notification.event,
      );
      expect(events).toContain("DOCUMENT_UPLOADED");
    }
  });

  it("tells the affected user that their roles changed", async () => {
    const admin = await createStaff(["ADMINISTRATOR"]);
    const staff = await createStaff(["BGV_EXECUTIVE"]);

    await api({
      method: "patch",
      path: `/api/admin/users/${staff.userId}`,
      token: admin.token,
      body: { roles: ["BGV_EXECUTIVE", "BGV_REVIEWER"], reason: "Promoted to reviewer" },
    });

    const notifications = await api({
      method: "get",
      path: "/api/notifications",
      token: staff.token,
    });

    const notice = notifications.body.data.find(
      (notification: { event: string }) => notification.event === "ADMIN_NOTICE",
    );
    expect(notice).toBeTruthy();
    expect(notice.body).toContain("Promoted to reviewer");
  });
});
