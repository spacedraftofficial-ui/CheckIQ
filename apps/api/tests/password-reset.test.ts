import { describe, expect, it } from "vitest";
import { api, createStaff, createCandidateWithoutCase, TEST_PASSWORD } from "./helpers.js";
import { getDatabase, schema } from "../src/db/client.js";
import { eq } from "drizzle-orm";
import { passwordSchema } from "@checkiq/contracts";

/**
 * Admin password-reset flow tests.
 *
 * Covers: permission boundary, temp password generation, login with temp
 * password, password change, self-reset prevention, and deleted-user guard.
 */
describe("admin password reset", () => {
  it("generates a temporary password that satisfies the password policy", async () => {
    const staff = await createStaff(["ADMINISTRATOR"]);
    const candidate = await createCandidateWithoutCase({ candidateId: `CIQ-PW-${Date.now()}` });

    const response = await api({
      method: "post",
      path: `/api/admin/users/${candidate.userId}/reset-password`,
      token: staff.token,
    });

    expect(response.status).toBe(200);
    const tempPassword = response.body.data.temporaryPassword as string;
    expect(tempPassword).toBeTruthy();
    expect(() => passwordSchema.parse(tempPassword)).not.toThrow();
  });

  it("logs the user in with the temporary password and flags mustChangePassword", async () => {
    const staff = await createStaff(["ADMINISTRATOR"]);
    const candidate = await createCandidateWithoutCase({ candidateId: `CIQ-LOGIN-${Date.now()}` });

    const reset = await api({
      method: "post",
      path: `/api/admin/users/${candidate.userId}/reset-password`,
      token: staff.token,
    });
    expect(reset.status).toBe(200);
    const tempPassword = reset.body.data.temporaryPassword as string;

    const login = await api({
      method: "post",
      path: "/api/auth/login",
      body: { identifier: candidate.email, password: tempPassword },
    });

    expect(login.status).toBe(200);
    expect(login.body.data.user.mustChangePassword).toBe(true);
  });

  it("allows the user to change their password after reset", async () => {
    const staff = await createStaff(["ADMINISTRATOR"]);
    const candidate = await createCandidateWithoutCase({ candidateId: `CIQ-CHANGE-${Date.now()}` });

    const reset = await api({
      method: "post",
      path: `/api/admin/users/${candidate.userId}/reset-password`,
      token: staff.token,
    });
    const tempPassword = reset.body.data.temporaryPassword as string;

    const login = await api({
      method: "post",
      path: "/api/auth/login",
      body: { identifier: candidate.email, password: tempPassword },
    });
    expect(login.status).toBe(200);
    const token = login.body.data.accessToken as string;
    const newPassword = "N3w!StrongPass";

    const change = await api({
      method: "post",
      path: "/api/auth/change-password",
      token,
      body: { currentPassword: tempPassword, newPassword },
    });
    expect(change.status).toBe(200);

    const [user] = await getDatabase()
      .db.select({ mustChangePassword: schema.users.mustChangePassword })
      .from(schema.users)
      .where(eq(schema.users.id, candidate.userId));
    expect(user?.mustChangePassword).toBe(false);

    const loginNew = await api({
      method: "post",
      path: "/api/auth/login",
      body: { identifier: candidate.email, password: newPassword },
    });
    expect(loginNew.status).toBe(200);
    expect(loginNew.body.data.user.mustChangePassword).toBe(false);
  });

  it("rejects a user without user:manage from resetting passwords", async () => {
    const verifier = await createStaff(["BGV_REVIEWER"]);
    const candidate = await createCandidateWithoutCase({ candidateId: `CIQ-PERMS-${Date.now()}` });

    const response = await api({
      method: "post",
      path: `/api/admin/users/${candidate.userId}/reset-password`,
      token: verifier.token,
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("prevents an admin from resetting their own password", async () => {
    const staff = await createStaff(["ADMINISTRATOR"]);

    const response = await api({
      method: "post",
      path: `/api/admin/users/${staff.userId}/reset-password`,
      token: staff.token,
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects a reset request for a non-existent user", async () => {
    const staff = await createStaff(["ADMINISTRATOR"]);

    const response = await api({
      method: "post",
      path: "/api/admin/users/00000000-0000-0000-0000-000000000000/reset-password",
      token: staff.token,
    });

    expect(response.status).toBe(404);
  });

  it("rejects a reset request for a deleted user", async () => {
    const staff = await createStaff(["ADMINISTRATOR"]);
    const candidate = await createCandidateWithoutCase({ candidateId: `CIQ-DEL-PW-${Date.now()}` });

    const del = await api({
      method: "delete",
      path: `/api/admin/users/${candidate.userId}`,
      token: staff.token,
      body: { reason: "test" },
    });
    expect(del.status).toBe(200);

    const response = await api({
      method: "post",
      path: `/api/admin/users/${candidate.userId}/reset-password`,
      token: staff.token,
    });

    expect(response.status).toBe(404);
  });

  it("invalidates old sessions after a password reset", async () => {
    const staff = await createStaff(["ADMINISTRATOR"]);
    const candidate = await createCandidateWithoutCase({ candidateId: `CIQ-SESS-${Date.now()}` });

    const originalLogin = await api({
      method: "post",
      path: "/api/auth/login",
      body: { identifier: candidate.email, password: TEST_PASSWORD },
    });
    expect(originalLogin.status).toBe(200);
    const originalToken = originalLogin.body.data.accessToken as string;

    const reset = await api({
      method: "post",
      path: `/api/admin/users/${candidate.userId}/reset-password`,
      token: staff.token,
    });
    expect(reset.status).toBe(200);

    // The old access token should be invalidated — session epoch was bumped
    const profile = await api({
      method: "get",
      path: "/api/profile",
      token: originalToken,
    });
    expect(profile.status).toBe(401);
  });
});

