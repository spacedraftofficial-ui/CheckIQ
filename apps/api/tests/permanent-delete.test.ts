import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { api, createCandidate, createStaff, TINY_PNG, uniqueCandidateId } from "./helpers.js";
import { getDatabase, schema } from "../src/db/client.js";
import { resolveStoragePath } from "../src/lib/storage.js";

/**
 * Permanent deletion: Super Administrator only, email-confirmed, erases a
 * candidate's account, case, documents and files, keeps the audit trail, and
 * refuses to erase staff whose work other cases depend on.
 */

function permanentDelete(token: string, userId: string, confirmEmail: string) {
  return api({
    method: "delete",
    path: `/api/admin/users/${userId}/permanent`,
    token,
    body: { confirmEmail, reason: "Test erase" },
  });
}

async function uploadOne(candidate: Awaited<ReturnType<typeof createCandidate>>) {
  const documents = await api({ method: "get", path: `/api/cases/${candidate.caseId}/documents`, token: candidate.token });
  const requirementId = documents.body.data[0].requirementId as string;
  const upload = await api({
    method: "post",
    path: `/api/cases/${candidate.caseId}/documents/${requirementId}/upload`,
    token: candidate.token,
  }).attach("file", TINY_PNG, { filename: "evidence.png", contentType: "image/png" });
  expect(upload.status).toBe(201);
}

describe("permanent user deletion", () => {
  it("is not available to an Administrator", async () => {
    const admin = await createStaff(["ADMINISTRATOR"]);
    const candidate = await createCandidate();
    const response = await permanentDelete(admin.token, candidate.userId, candidate.email);
    expect(response.status).toBe(403);
  });

  it("requires the user's email address to be typed correctly", async () => {
    const superAdmin = await createStaff(["SUPER_ADMINISTRATOR"]);
    const candidate = await createCandidate();
    const response = await permanentDelete(superAdmin.token, candidate.userId, "someone-else@example.test");
    expect(response.status).toBe(422);
  });

  it("refuses to delete your own account", async () => {
    const superAdmin = await createStaff(["SUPER_ADMINISTRATOR"]);
    const response = await permanentDelete(superAdmin.token, superAdmin.userId, superAdmin.email);
    expect(response.status).toBe(403);
  });

  it("erases a candidate's account, case, documents and stored files but keeps the audit record", async () => {
    const superAdmin = await createStaff(["SUPER_ADMINISTRATOR"]);
    const candidate = await createCandidate();
    await uploadOne(candidate);
    const { db } = getDatabase();

    const [version] = await db
      .select({ key: schema.documentVersions.storageKey })
      .from(schema.documentVersions)
      .innerJoin(schema.documents, eq(schema.documents.id, schema.documentVersions.documentId))
      .where(eq(schema.documents.caseId, candidate.caseId));
    const filePath = resolveStoragePath(version!.key);
    expect(existsSync(filePath)).toBe(true);

    const response = await permanentDelete(superAdmin.token, candidate.userId, candidate.email.toUpperCase());
    expect(response.status).toBe(200);
    expect(response.body.data.filesRemoved).toBe(1);

    expect(await db.select().from(schema.users).where(eq(schema.users.id, candidate.userId))).toHaveLength(0);
    expect(await db.select().from(schema.bgvCases).where(eq(schema.bgvCases.id, candidate.caseId))).toHaveLength(0);
    expect(existsSync(filePath)).toBe(false);

    const audit = await db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.action, "USER_PERMANENTLY_DELETED"));
    expect(audit.some((event) => event.entityId === candidate.userId)).toBe(true);
  });

  it("lets the same email address sign up again afterwards", async () => {
    const superAdmin = await createStaff(["SUPER_ADMINISTRATOR"]);
    const candidate = await createCandidate();
    expect((await permanentDelete(superAdmin.token, candidate.userId, candidate.email)).status).toBe(200);

    const signup = await api({
      method: "post",
      path: "/api/auth/signup",
      body: {
        candidateId: uniqueCandidateId(),
        fullName: "Back Again",
        email: candidate.email,
        mobile: "+919812345678",
        password: "Str0ng!Passw0rd",
        confirmPassword: "Str0ng!Passw0rd",
      },
    });
    expect(signup.status).toBe(201);
  });

  it("refuses to erase staff whose work another case depends on", async () => {
    const superAdmin = await createStaff(["SUPER_ADMINISTRATOR"]);
    const staff = await createStaff(["BGV_EXECUTIVE"]);
    const candidate = await createCandidate();
    await uploadOne(candidate);
    const { db } = getDatabase();
    // Attribute the candidate's upload to the staff member: a record another
    // case depends on.
    const [version] = await db
      .select({ id: schema.documentVersions.id })
      .from(schema.documentVersions)
      .innerJoin(schema.documents, eq(schema.documents.id, schema.documentVersions.documentId))
      .where(eq(schema.documents.caseId, candidate.caseId))
      .limit(1);
    expect(version).toBeDefined();
    await db
      .update(schema.documentVersions)
      .set({ uploadedBy: staff.userId })
      .where(eq(schema.documentVersions.id, version!.id));

    const response = await permanentDelete(superAdmin.token, staff.userId, staff.email);
    expect(response.status).toBe(409);
    expect(await db.select().from(schema.users).where(eq(schema.users.id, staff.userId))).toHaveLength(1);
  });

  it("erases staff with no work history", async () => {
    const superAdmin = await createStaff(["SUPER_ADMINISTRATOR"]);
    const staff = await createStaff(["HR_RECRUITMENT"]);
    const response = await permanentDelete(superAdmin.token, staff.userId, staff.email);
    expect(response.status).toBe(200);
  });
});
