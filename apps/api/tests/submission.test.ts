import { beforeAll, describe, expect, it } from "vitest";
import {
  acceptConsent,
  api,
  completeProfile,
  createCandidate,
  resetDatabase,
  uploadMandatoryDocuments,
} from "./helpers.js";

/**
 * Submission: readiness, idempotency and state transitions.
 */
describe("submission", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  it("refuses to submit while the profile is incomplete and lists what is missing", async () => {
    const candidate = await createCandidate();
    await uploadMandatoryDocuments(candidate);
    await acceptConsent(candidate);

    const response = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/submit`,
      token: candidate.token,
      body: { idempotencyKey: "submit-missing-profile-0001", confirmDeclaration: true },
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("PRECONDITION_FAILED");
    expect(response.body.error.details.profileFields.length).toBeGreaterThan(0);
  });

  it("refuses to submit while a mandatory document is missing", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);
    await acceptConsent(candidate);

    const response = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/submit`,
      token: candidate.token,
      body: { idempotencyKey: "submit-missing-docs-0001", confirmDeclaration: true },
    });

    expect(response.status).toBe(422);
    expect(response.body.error.details.documents.length).toBeGreaterThan(0);
  });

  it("refuses to submit before the declaration is accepted", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);
    await uploadMandatoryDocuments(candidate);

    const response = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/submit`,
      token: candidate.token,
      body: { idempotencyKey: "submit-no-consent-0001", confirmDeclaration: true },
    });

    expect(response.status).toBe(422);
    expect(response.body.error.details.consent.accepted).toBe(false);
  });

  it("submits once every requirement is met", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);
    await acceptConsent(candidate);
    await uploadMandatoryDocuments(candidate);

    const response = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/submit`,
      token: candidate.token,
      body: { idempotencyKey: "submit-valid-00000001", confirmDeclaration: true },
    });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe("SUBMITTED");
    expect(response.body.data.alreadySubmitted).toBe(false);
    expect(response.body.data.submittedAt).toBeTruthy();
  });

  it("is idempotent: a repeated request with the same key does not submit twice", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);
    await acceptConsent(candidate);
    await uploadMandatoryDocuments(candidate);

    const key = "submit-idempotent-00001";
    const first = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/submit`,
      token: candidate.token,
      body: { idempotencyKey: key, confirmDeclaration: true },
    });
    const second = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/submit`,
      token: candidate.token,
      body: { idempotencyKey: key, confirmDeclaration: true },
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data.alreadySubmitted).toBe(true);
    expect(second.body.data.submittedAt).toBe(first.body.data.submittedAt);
  });

  it("rejects a second submission with a different key", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);
    await acceptConsent(candidate);
    await uploadMandatoryDocuments(candidate);

    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/submit`,
      token: candidate.token,
      body: { idempotencyKey: "submit-different-a-0001", confirmDeclaration: true },
    });
    const second = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/submit`,
      token: candidate.token,
      body: { idempotencyKey: "submit-different-b-0001", confirmDeclaration: true },
    });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("CONFLICT");
  });

  it("creates exactly one submission event for a case", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);
    await acceptConsent(candidate);
    await uploadMandatoryDocuments(candidate);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await api({
        method: "post",
        path: `/api/cases/${candidate.caseId}/submit`,
        token: candidate.token,
        body: { idempotencyKey: "submit-repeat-key-0001", confirmDeclaration: true },
      });
    }

    const history = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/history`,
      token: candidate.token,
    });

    const submissionEvents = history.body.data.filter(
      (entry: { toStatus: string }) => entry.toStatus === "SUBMITTED",
    );
    expect(submissionEvents.length).toBe(1);
  });

  it("rejects a submission from a candidate who does not own the case", async () => {
    const owner = await createCandidate();
    const other = await createCandidate();

    const response = await api({
      method: "post",
      path: `/api/cases/${owner.caseId}/submit`,
      token: other.token,
      body: { idempotencyKey: "submit-not-owner-0001", confirmDeclaration: true },
    });

    expect(response.status).toBe(404);
  });

  it("moves the case into the submitted state and records the transition", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);
    await acceptConsent(candidate);
    await uploadMandatoryDocuments(candidate);

    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/submit`,
      token: candidate.token,
      body: { idempotencyKey: "submit-transition-0001", confirmDeclaration: true },
    });

    const detail = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}`,
      token: candidate.token,
    });
    expect(detail.body.data.status).toBe("SUBMITTED");

    const history = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/history`,
      token: candidate.token,
    });
    const transition = history.body.data.find(
      (entry: { toStatus: string }) => entry.toStatus === "SUBMITTED",
    );
    expect(transition).toBeTruthy();
    expect(transition.fromStatus).toBe("DOCUMENT_UPLOAD_IN_PROGRESS");
  });
});
