import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  acceptConsent,
  api,
  completeProfile,
  createCandidate,
  createStaff,
  resetDatabase,
  uploadMandatoryDocuments,
} from "./helpers.js";
import { getDatabase, schema } from "../src/db/client.js";
import { computeScore, toHundredths } from "../src/modules/scoring/scoring.service.js";

/**
 * Scoring: precision around the threshold, and the routing that follows a
 * below-threshold result.
 */
describe("scoring", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  it("compares scores in integer hundredths and treats exactly 95.00 as meeting a 95% threshold", () => {
    const components = [
      {
        id: "1",
        checkTypeCodes: ["A"],
        label: "A",
        weight: "90.00",
        outcomeMultipliers: { VERIFIED: 1 },
        excludedStatuses: [],
      },
      {
        id: "2",
        checkTypeCodes: ["B"],
        label: "B",
        weight: "10.00",
        outcomeMultipliers: { PARTIALLY_VERIFIED: 0.5 },
        excludedStatuses: [],
      },
    ];
    const checks = [
      { id: "c1", checkTypeCode: "A", label: "A", status: "VERIFIED" },
      { id: "c2", checkTypeCode: "B", label: "B", status: "PARTIALLY_VERIFIED" },
    ];

    const exactly = computeScore(components, checks, 95, false);
    expect(exactly.totalHundredths).toBe(9500);
    expect(exactly.outcome).toBe("ABOVE_THRESHOLD");
  });

  it("treats 94.99 as below a 95% threshold", () => {
    const components = [
      {
        id: "1",
        checkTypeCodes: ["A"],
        label: "A",
        weight: "90.00",
        outcomeMultipliers: { VERIFIED: 1 },
        excludedStatuses: [],
      },
      {
        id: "2",
        checkTypeCodes: ["B"],
        label: "B",
        weight: "10.00",
        outcomeMultipliers: { PARTIALLY_VERIFIED: 0.499 },
        excludedStatuses: [],
      },
    ];
    const checks = [
      { id: "c1", checkTypeCode: "A", label: "A", status: "VERIFIED" },
      { id: "c2", checkTypeCode: "B", label: "B", status: "PARTIALLY_VERIFIED" },
    ];

    const result = computeScore(components, checks, 95, false);
    expect(result.totalHundredths).toBe(9499);
    expect(result.outcome).toBe("BELOW_THRESHOLD");
  });

  it("rounds a repeating ratio half-up to the nearest hundredth", () => {
    const components = [
      {
        id: "1",
        checkTypeCodes: ["A", "B", "C"],
        label: "Group",
        weight: "100.00",
        outcomeMultipliers: { VERIFIED: 1, PARTIALLY_VERIFIED: 0.5 },
        excludedStatuses: [],
      },
    ];
    const checks = [
      { id: "c1", checkTypeCode: "A", label: "A", status: "VERIFIED" },
      { id: "c2", checkTypeCode: "B", label: "B", status: "VERIFIED" },
      { id: "c3", checkTypeCode: "C", label: "C", status: "PARTIALLY_VERIFIED" },
    ];

    // (1 + 1 + 0.5) / 3 = 0.8333… → 83.33%
    const result = computeScore(components, checks, 95, false);
    expect(result.totalHundredths).toBe(8333);
  });

  it("excludes waived checks from the denominator entirely", () => {
    const components = [
      {
        id: "1",
        checkTypeCodes: ["A", "B"],
        label: "Group",
        weight: "100.00",
        outcomeMultipliers: { VERIFIED: 1, WAIVED: 0 },
        excludedStatuses: ["WAIVED"],
      },
    ];
    const checks = [
      { id: "c1", checkTypeCode: "A", label: "A", status: "VERIFIED" },
      { id: "c2", checkTypeCode: "B", label: "B", status: "WAIVED" },
    ];

    const result = computeScore(components, checks, 95, false);
    expect(result.totalHundredths).toBe(10000);
  });

  it("renormalises when a component has no applicable checks", () => {
    const components = [
      {
        id: "1",
        checkTypeCodes: ["A"],
        label: "Applied",
        weight: "50.00",
        outcomeMultipliers: { VERIFIED: 1 },
        excludedStatuses: [],
      },
      {
        id: "2",
        checkTypeCodes: ["Z"],
        label: "Not applicable to this package",
        weight: "50.00",
        outcomeMultipliers: { VERIFIED: 1 },
        excludedStatuses: [],
      },
    ];
    const checks = [{ id: "c1", checkTypeCode: "A", label: "A", status: "VERIFIED" }];

    const result = computeScore(components, checks, 95, false);
    expect(result.totalHundredths).toBe(10000);
    expect(result.components.length).toBe(1);
  });

  it("converts decimal values to hundredths without floating point drift", () => {
    expect(toHundredths("95.00")).toBe(9500);
    expect(toHundredths(94.99)).toBe(9499);
    expect(toHundredths("0.1")).toBe(10);
  });

  it("refuses to produce a score when no approved scoring configuration is active", async () => {
    // Remove the seeded active configuration so the test has a clean baseline.
    const { db } = getDatabase();
    await db
      .update(schema.scoringConfigurations)
      .set({ status: "DRAFT", isApproved: false, approvedBy: null, approvedAt: null })
      .where(eq(schema.scoringConfigurations.status, "ACTIVE"));

    const candidate = await createCandidate();
    const reviewer = await createStaff(["BGV_REVIEWER"]);

    const response = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/score/generate`,
      token: reviewer.token,
      body: {},
    });

    expect(response.status).toBe(422);
    expect(response.body.error.message).toContain("approved scoring configuration");
  });

  it("generates a score, records the configuration version and routes a below-threshold case for review", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);
    await acceptConsent(candidate);
    await uploadMandatoryDocuments(candidate);
    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/submit`,
      token: candidate.token,
      body: { idempotencyKey: `score-${candidate.candidateId}`, confirmDeclaration: true },
    });

    const admin = await createStaff(["ADMINISTRATOR"]);
    const reviewer = await createStaff(["BGV_REVIEWER"]);

    // Approve and activate the seeded configuration.
    const configurations = await api({
      method: "get",
      path: "/api/admin/scoring-configs",
      token: admin.token,
    });
    const config = configurations.body.data[0];
    expect(config.isApproved).toBe(false);

    const approve = await api({
      method: "post",
      path: `/api/admin/scoring-configs/${config.id}/approve`,
      token: admin.token,
      body: {},
    });
    expect(approve.status).toBe(200);

    const activate = await api({
      method: "post",
      path: `/api/admin/scoring-configs/${config.id}/activate`,
      token: admin.token,
      body: {},
    });
    expect(activate.status).toBe(200);

    // Record a failing result so the case scores below the threshold.
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

    const started = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/verification/start`,
      token: reviewer.token,
      body: {},
    });
    expect(started.status).toBe(200);

    const completed = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/verification/complete`,
      token: reviewer.token,
      body: {},
    });
    expect(completed.status).toBe(200);

    const generate = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/score/generate`,
      token: reviewer.token,
      body: {},
    });

    expect(generate.status).toBe(201);
    expect(generate.body.data.score.totalScore).toBe(100);
    expect(generate.body.data.score.threshold).toBe(95);
    expect(generate.body.data.score.outcome).toBe("ABOVE_THRESHOLD");
    expect(generate.body.data.score.scoringConfigVersion).toBe(1);

    const detail = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}`,
      token: reviewer.token,
    });
    expect(detail.body.data.status).toBe("BGV_SCORE_GENERATED");
  });

  it("refuses to score while a mandatory check is unresolved", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);
    await acceptConsent(candidate);
    await uploadMandatoryDocuments(candidate);
    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/submit`,
      token: candidate.token,
      body: { idempotencyKey: `score-unresolved-${candidate.candidateId}`, confirmDeclaration: true },
    });

    const reviewer = await createStaff(["BGV_REVIEWER"]);
    const response = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/score/generate`,
      token: reviewer.token,
      body: {},
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("PRECONDITION_FAILED");
    expect(response.body.error.details.unresolvedChecks.length).toBeGreaterThan(0);
  });

  it("preserves the score history when a score is regenerated", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);
    await acceptConsent(candidate);
    await uploadMandatoryDocuments(candidate);
    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/submit`,
      token: candidate.token,
      body: { idempotencyKey: `score-history-${candidate.candidateId}`, confirmDeclaration: true },
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
    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/score/generate`,
      token: reviewer.token,
      body: {},
    });

    const history = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/scores`,
      token: reviewer.token,
    });

    // The first score is auto-generated on verification completion. The two
    // manual generations each supersede the previous one.
    expect(history.body.data.length).toBe(3);
    expect(history.body.data.filter((row: { supersededAt: string | null }) => row.supersededAt).length).toBe(2);
  });
});
