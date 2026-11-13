import { describe, expect, it } from "vitest";
import { api, createCandidate, createStaff } from "./helpers.js";

/**
 * Admin user management: the candidate / staff split of the user list, and the
 * privilege boundary between Administrator and Super Administrator.
 */
describe("admin user list split", () => {
  it("lists only candidates under userType=candidate", async () => {
    const admin = await createStaff(["ADMINISTRATOR"]);
    const candidate = await createCandidate();
    const staff = await createStaff(["BGV_EXECUTIVE"]);

    const response = await api({
      method: "get",
      path: "/api/admin/users?userType=candidate&pageSize=100",
      token: admin.token,
    });
    expect(response.status).toBe(200);
    const ids = response.body.data.map((u: { id: string }) => u.id);
    expect(ids).toContain(candidate.userId);
    expect(ids).not.toContain(staff.userId);
    expect(ids).not.toContain(admin.userId);
  });

  it("lists staff and administrators under userType=staff", async () => {
    const admin = await createStaff(["ADMINISTRATOR"]);
    const candidate = await createCandidate();
    const staff = await createStaff(["BGV_REVIEWER"]);

    const response = await api({
      method: "get",
      path: "/api/admin/users?userType=staff&pageSize=100",
      token: admin.token,
    });
    expect(response.status).toBe(200);
    const ids = response.body.data.map((u: { id: string }) => u.id);
    expect(ids).toContain(staff.userId);
    expect(ids).toContain(admin.userId);
    expect(ids).not.toContain(candidate.userId);
  });

  it("filters by a role held by several users without a server error", async () => {
    const admin = await createStaff(["ADMINISTRATOR"]);
    await createStaff(["BGV_EXECUTIVE"]);
    await createStaff(["BGV_EXECUTIVE"]);

    const response = await api({
      method: "get",
      path: "/api/admin/users?role=BGV_EXECUTIVE",
      token: admin.token,
    });
    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThanOrEqual(2);
  });
});

describe("administrator privilege boundary", () => {
  it("prevents an Administrator from granting Super Administrator", async () => {
    const admin = await createStaff(["ADMINISTRATOR"]);
    const staff = await createStaff(["BGV_EXECUTIVE"]);

    const response = await api({
      method: "patch",
      path: `/api/admin/users/${staff.userId}`,
      token: admin.token,
      body: { roles: ["SUPER_ADMINISTRATOR"] },
    });
    expect(response.status).toBe(403);
  });

  it("prevents an Administrator from creating an administrator account", async () => {
    const admin = await createStaff(["ADMINISTRATOR"]);
    const response = await api({
      method: "post",
      path: "/api/admin/users",
      token: admin.token,
      body: {
        email: `new-admin-${Date.now()}@checkiq.test`,
        fullName: "New Admin",
        roles: ["ADMINISTRATOR"],
        temporaryPassword: "Temp!Password123",
      },
    });
    expect(response.status).toBe(403);
  });

  it("rejects CANDIDATE as a staff account role", async () => {
    const superAdmin = await createStaff(["SUPER_ADMINISTRATOR"]);
    const response = await api({
      method: "post",
      path: "/api/admin/users",
      token: superAdmin.token,
      body: {
        email: `cand-${Date.now()}@checkiq.test`,
        fullName: "Not Staff",
        roles: ["CANDIDATE"],
        temporaryPassword: "Temp!Password123",
      },
    });
    expect(response.status).toBe(422);
  });

  it("prevents an Administrator from disabling or deleting a Super Administrator", async () => {
    const admin = await createStaff(["ADMINISTRATOR"]);
    const superAdmin = await createStaff(["SUPER_ADMINISTRATOR"]);

    const disable = await api({
      method: "patch",
      path: `/api/admin/users/${superAdmin.userId}`,
      token: admin.token,
      body: { isActive: false },
    });
    expect(disable.status).toBe(403);

    const remove = await api({
      method: "delete",
      path: `/api/admin/users/${superAdmin.userId}`,
      token: admin.token,
    });
    expect(remove.status).toBe(403);

    const reset = await api({
      method: "post",
      path: `/api/admin/users/${superAdmin.userId}/reset-password`,
      token: admin.token,
    });
    expect(reset.status).toBe(403);
  });

  it("lets a Super Administrator grant administrator roles", async () => {
    const superAdmin = await createStaff(["SUPER_ADMINISTRATOR"]);
    const staff = await createStaff(["BGV_EXECUTIVE"]);

    const response = await api({
      method: "patch",
      path: `/api/admin/users/${staff.userId}`,
      token: superAdmin.token,
      body: { roles: ["ADMINISTRATOR"] },
    });
    expect(response.status).toBe(200);
  });

  it("prevents disabling your own account or changing your own roles", async () => {
    const superAdmin = await createStaff(["SUPER_ADMINISTRATOR"]);

    const disable = await api({
      method: "patch",
      path: `/api/admin/users/${superAdmin.userId}`,
      token: superAdmin.token,
      body: { isActive: false },
    });
    expect(disable.status).toBe(403);

    const demote = await api({
      method: "patch",
      path: `/api/admin/users/${superAdmin.userId}`,
      token: superAdmin.token,
      body: { roles: ["BGV_EXECUTIVE"] },
    });
    expect(demote.status).toBe(403);
  });

  it("re-grants a role that was revoked earlier", async () => {
    const admin = await createStaff(["ADMINISTRATOR"]);
    const staff = await createStaff(["BGV_EXECUTIVE", "BGV_REVIEWER"]);
    const path = `/api/admin/users/${staff.userId}`;

    const revoke = await api({ method: "patch", path, token: admin.token, body: { roles: ["BGV_EXECUTIVE"] } });
    expect(revoke.status).toBe(200);

    const regrant = await api({
      method: "patch",
      path,
      token: admin.token,
      body: { roles: ["BGV_EXECUTIVE", "BGV_REVIEWER"] },
    });
    expect(regrant.status).toBe(200);

    const detail = await api({ method: "get", path, token: admin.token });
    expect(detail.body.data.roles.sort()).toEqual(["BGV_EXECUTIVE", "BGV_REVIEWER"]);
  });
});
