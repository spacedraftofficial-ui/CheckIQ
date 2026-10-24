import { describe, expect, it } from "vitest";
import { api, createStaff, createCandidate, createCandidateWithoutCase } from "./helpers.js";

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
    const other = await createCandidateWithoutCase({ candidateId: "CIQ-OTHER-001" });

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
});
