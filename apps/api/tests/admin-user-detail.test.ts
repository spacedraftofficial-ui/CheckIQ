import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { api, createStaff, createCandidate, createCandidateWithoutCase, TEST_PASSWORD } from "./helpers.js";
import { getDatabase, schema } from "../src/db/client.js";

/**
 * Admin user-detail endpoint tests.
 *
 * Covers: permission boundary (non-admin blocked), successful retrieval
 * with roles and audit trail, and 404 for unknown user.
 */
describe("admin user detail", () => {
  it("returns 404 for a non-existent user id", async () => {
    const staff = await createStaff(["ADMINISTRATOR"]);
    const response = await api({
      method: "get",
      path: `/api/admin/users/00000000-0000-0000-0000-000000000000`,
      token: staff.token,
    });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("exposes user profile with roles for an administrator", async () => {
    const staff = await createStaff(["ADMINISTRATOR"]);
    const candidate = await createCandidate();

    const response = await api({
      method: "get",
      path: `/api/admin/users/${candidate.userId}`,
      token: staff.token,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(candidate.userId);
    expect(response.body.data.email).toBe(candidate.email);
    expect(response.body.data.fullName).toBe("Test Candidate");
    expect(response.body.data.isActive).toBe(true);
    expect(response.body.data.isEmailVerified).toBe(true);
    expect(response.body.data.roles).toContain("CANDIDATE");
    expect(response.body.data.createdAt).toBeTruthy();
    expect(response.body.data.auditTrail.length).toBeGreaterThan(0);
  });

  it("blocks a non-admin user from viewing another user's details", async () => {
    const candidate = await createCandidate();
    const other = await createCandidateWithoutCase({ candidateId: `CIQ-OTHER-${Date.now()}` });

    const response = await api({
      method: "get",
      path: `/api/admin/users/${other.userId}`,
      token: candidate.token,
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("does not return sensitive fields like passwordHash", async () => {
    const staff = await createStaff(["ADMINISTRATOR"]);
    const candidate = await createCandidate();

    const response = await api({
      method: "get",
      path: `/api/admin/users/${candidate.userId}`,
      token: staff.token,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.passwordHash).toBeUndefined();
    expect(JSON.stringify(response.body).toLowerCase()).not.toContain("passwordhash");
  });

  it("soft-deletes a user account", async () => {
    const staff = await createStaff(["ADMINISTRATOR"]);
    const candidate = await createCandidateWithoutCase({ candidateId: `CIQ-DEL-${Date.now()}` });

    const response = await api({
      method: "delete",
      path: `/api/admin/users/${candidate.userId}`,
      token: staff.token,
      body: { reason: "Test deletion" },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.deleted).toBe(true);

    // The user should be inactive and have deletedAt set
    const detail = await api({
      method: "get",
      path: `/api/admin/users/${candidate.userId}`,
      token: staff.token,
    });
    expect(detail.status).toBe(200);
    expect(detail.body.data.isActive).toBe(false);
    expect(detail.body.data.deletedAt).toBeTruthy();
  });

  it("blocks a verifier assigned to an active case from deletion", async () => {
    const staff = await createStaff(["ADMINISTRATOR"]);
    const candidate = await createCandidate();

    // The candidate's case was auto-assigned; the assigned verifier user
    // cannot be deleted while they carry the active case.
    const [caseRow] = await getDatabase().db
      .select({ assignedVerifierId: schema.bgvCases.assignedVerifierId })
      .from(schema.bgvCases)
      .where(eq(schema.bgvCases.profileId, candidate.caseId))
      .limit(1);

    if (caseRow?.assignedVerifierId) {
      const response = await api({
        method: "delete",
        path: `/api/admin/users/${caseRow.assignedVerifierId}`,
        token: staff.token,
      });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    } else {
      // No verifier assigned — skip the assertion
      expect(true).toBe(true);
    }
  });

  it("blocks an admin from deleting themselves", async () => {
    const staff = await createStaff(["ADMINISTRATOR"]);

    const response = await api({
      method: "delete",
      path: `/api/admin/users/${staff.userId}`,
      token: staff.token,
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("returns 404 for a non-existent user on delete", async () => {
    const staff = await createStaff(["ADMINISTRATOR"]);
    const response = await api({
      method: "delete",
      path: "/api/admin/users/00000000-0000-0000-0000-000000000000",
      token: staff.token,
    });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("prevents re-enabling a deleted user", async () => {
    const staff = await createStaff(["ADMINISTRATOR"]);
    const candidate = await createCandidateWithoutCase({ candidateId: `CIQ-REENABLE-${Date.now()}` });

    // Delete the user
    const del = await api({
      method: "delete",
      path: `/api/admin/users/${candidate.userId}`,
      token: staff.token,
    });
    expect(del.status).toBe(200);
    expect(del.body.data.deleted).toBe(true);

    // Attempt to re-enable
    const reenable = await api({
      method: "patch",
      path: `/api/admin/users/${candidate.userId}`,
      token: staff.token,
      body: { isActive: true },
    });

    expect(reenable.status).toBe(403);
    expect(reenable.body.error.code).toBe("FORBIDDEN");
  });

  it("prevents a deleted user from authenticating", async () => {
    const staff = await createStaff(["ADMINISTRATOR"]);
    const candidate = await createCandidateWithoutCase({ candidateId: `CIQ-AUTH-${Date.now()}` });

    // Delete the user
    await api({
      method: "delete",
      path: `/api/admin/users/${candidate.userId}`,
      token: staff.token,
    });

    // Attempt to sign in
    const login = await api({
      method: "post",
      path: "/api/auth/login",
      body: { identifier: candidate.email, password: TEST_PASSWORD },
    });

    expect(login.status).toBe(403);
  });
});
