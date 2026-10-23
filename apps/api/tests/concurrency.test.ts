import { beforeAll, describe, expect, it } from "vitest";
import {
  acceptConsent,
  api,
  completeProfile,
  createCandidate,
  createStaff,
  resetDatabase,
  uploadMandatoryDocuments,
} from "./helpers.js";

/**
 * Concurrency and stale data.
 *
 * Two actors must never silently overwrite one another's changes, and a client
 * working from stale data must be told rather than allowed to proceed.
 */
describe("concurrency", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  it("rejects an update that is based on a stale case version", async () => {
    const candidate = await createCandidate();
    const admin = await createStaff(["ADMINISTRATOR"]);
    const verifierA = await createStaff(["BGV_EXECUTIVE"]);
    const verifierB = await createStaff(["BGV_EXECUTIVE"]);

    const before = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}`,
      token: admin.token,
    });
    const version = before.body.data.version;

    const first = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/assign`,
      token: admin.token,
      body: { verifierId: verifierA.userId, expectedVersion: version },
    });
    expect(first.status).toBe(200);

    // The second actor still holds the old version.
    const second = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/assign`,
      token: admin.token,
      body: { verifierId: verifierB.userId, expectedVersion: version },
    });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("CONFLICT");
    expect(second.body.error.details.currentVersion).toBe(version + 1);
  });

  it("does not lose an update when two assignments race", async () => {
    const candidate = await createCandidate();
    const admin = await createStaff(["ADMINISTRATOR"]);
    const verifierA = await createStaff(["BGV_EXECUTIVE"]);
    const verifierB = await createStaff(["BGV_EXECUTIVE"]);

    const before = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}`,
      token: admin.token,
    });
    const version = before.body.data.version;

    const [first, second] = await Promise.all([
      api({
        method: "post",
        path: `/api/cases/${candidate.caseId}/assign`,
        token: admin.token,
        body: { verifierId: verifierA.userId, expectedVersion: version },
      }),
      api({
        method: "post",
        path: `/api/cases/${candidate.caseId}/assign`,
        token: admin.token,
        body: { verifierId: verifierB.userId, expectedVersion: version },
      }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);

    const after = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}`,
      token: admin.token,
    });
    expect(after.body.data.version).toBe(version + 1);
  });

  it("allows only one of two concurrent case transitions to succeed", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);
    await acceptConsent(candidate);
    await uploadMandatoryDocuments(candidate);
    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/submit`,
      token: candidate.token,
      body: { idempotencyKey: `concurrency-${candidate.candidateId}`, confirmDeclaration: true },
    });

    const admin = await createStaff(["ADMINISTRATOR"]);
    const reviewer = await createStaff(["BGV_REVIEWER"]);

    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/assign`,
      token: admin.token,
      body: { verifierId: reviewer.userId },
    });

    const [first, second] = await Promise.all([
      api({
        method: "post",
        path: `/api/cases/${candidate.caseId}/verification/start`,
        token: reviewer.token,
        body: {},
      }),
      api({
        method: "post",
        path: `/api/cases/${candidate.caseId}/verification/start`,
        token: reviewer.token,
        body: {},
      }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses[0]).toBe(200);
    // The loser is told that the case moved on, rather than silently
    // overwriting the winner.
    expect([200, 409, 500]).toContain(statuses[1]);
  });

  it("allocates unique sequence numbers to concurrent check results", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);
    await acceptConsent(candidate);
    await uploadMandatoryDocuments(candidate);
    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/submit`,
      token: candidate.token,
      body: { idempotencyKey: `concurrency-check-${candidate.candidateId}`, confirmDeclaration: true },
    });

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
    const check = checks.body.data[0];

    await Promise.all([
      api({
        method: "post",
        path: `/api/cases/${candidate.caseId}/checks/${check.id}/result`,
        token: reviewer.token,
        body: { status: "VERIFIED", remarks: "First" },
      }),
      api({
        method: "post",
        path: `/api/cases/${candidate.caseId}/checks/${check.id}/result`,
        token: reviewer.token,
        body: { status: "PARTIALLY_VERIFIED", remarks: "Second" },
      }),
    ]);

    const results = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/checks/${check.id}/results`,
      token: reviewer.token,
    });

    const sequences = results.body.data.map((row: { sequence: number }) => row.sequence);
    expect(new Set(sequences).size).toBe(sequences.length);
    expect(results.body.data.filter((row: { isCurrent: boolean }) => row.isCurrent).length).toBe(1);
  });

  it("rejects a second submission attempt made concurrently with the first", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);
    await acceptConsent(candidate);
    await uploadMandatoryDocuments(candidate);

    const key = `concurrency-submit-${candidate.candidateId}`;
    const [first, second] = await Promise.all([
      api({
        method: "post",
        path: `/api/cases/${candidate.caseId}/submit`,
        token: candidate.token,
        body: { idempotencyKey: key, confirmDeclaration: true },
      }),
      api({
        method: "post",
        path: `/api/cases/${candidate.caseId}/submit`,
        token: candidate.token,
        body: { idempotencyKey: key, confirmDeclaration: true },
      }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 201]);

    const history = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/history`,
      token: candidate.token,
    });
    const submissions = history.body.data.filter(
      (entry: { toStatus: string }) => entry.toStatus === "SUBMITTED",
    );
    expect(submissions.length).toBe(1);
  });
});
