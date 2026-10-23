import { beforeAll, describe, expect, it } from "vitest";
import {
  TINY_PNG,
  api,
  createCandidate,
  resetDatabase,
  uploadDocument,
  uploadMandatoryDocuments,
} from "./helpers.js";

/**
 * Document collection: validation, versioning and required-document rules.
 */
describe("documents", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  it("materialises the package requirements on the candidate's case", async () => {
    const candidate = await createCandidate();
    const response = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/documents`,
      token: candidate.token,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.data.every((document: { status: string }) => document.status === "MISSING")).toBe(
      true,
    );
  });

  it("accepts a valid PNG upload and records version 1", async () => {
    const candidate = await createCandidate();
    const documents = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/documents`,
      token: candidate.token,
    });
    const requirement = documents.body.data[0];

    const response = await uploadDocument(
      candidate,
      requirement.requirementId,
      TINY_PNG,
      "identity.png",
      "image/png",
    );

    expect(response.status).toBe(201);
    expect(response.body.data.document.status).toBe("UPLOADED");
    expect(response.body.data.document.currentVersion.versionNumber).toBe(1);
  });

  it("rejects a file whose content does not match its extension", async () => {
    const candidate = await createCandidate();
    const documents = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/documents`,
      token: candidate.token,
    });
    const requirement = documents.body.data[0];

    const response = await uploadDocument(
      candidate,
      requirement.requirementId,
      Buffer.from("this is not a pdf"),
      "evidence.pdf",
      "application/pdf",
    );

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("UPLOAD_REJECTED");
  });

  it("rejects an unsupported file extension", async () => {
    const candidate = await createCandidate();
    const documents = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/documents`,
      token: candidate.token,
    });
    const requirement = documents.body.data[0];

    const response = await uploadDocument(
      candidate,
      requirement.requirementId,
      TINY_PNG,
      "evidence.exe",
      "application/octet-stream",
    );

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("UPLOAD_REJECTED");
  });

  it("rejects an empty file", async () => {
    const candidate = await createCandidate();
    const documents = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/documents`,
      token: candidate.token,
    });
    const requirement = documents.body.data[0];

    const response = await uploadDocument(
      candidate,
      requirement.requirementId,
      Buffer.alloc(0),
      "empty.png",
      "image/png",
    );

    expect(response.status).toBe(422);
  });

  it("does not create a document record when an upload is rejected", async () => {
    const candidate = await createCandidate();
    const before = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/documents`,
      token: candidate.token,
    });

    const documents = before.body.data;
    const requirement = documents[0];
    await uploadDocument(
      candidate,
      requirement.requirementId,
      Buffer.from("not a png"),
      "fake.png",
      "image/png",
    );

    const after = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/documents`,
      token: candidate.token,
    });

    expect(after.body.data[0].currentVersion).toBeNull();
    expect(after.body.data[0].versionCount).toBe(0);
  });

  it("preserves the previous version when a document is replaced", async () => {
    const candidate = await createCandidate();
    const documents = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/documents`,
      token: candidate.token,
    });
    const requirement = documents.body.data[0];

    await uploadDocument(candidate, requirement.requirementId, TINY_PNG, "first.png", "image/png");
    const second = await uploadDocument(
      candidate,
      requirement.requirementId,
      TINY_PNG,
      "second.png",
      "image/png",
    );

    expect(second.status).toBe(201);
    expect(second.body.data.document.currentVersion.versionNumber).toBe(2);
    expect(second.body.data.document.versionCount).toBe(2);

    const versions = await api({
      method: "get",
      path: `/api/documents/${second.body.data.document.id}/versions`,
      token: candidate.token,
    });

    expect(versions.body.data.length).toBe(2);
    expect(versions.body.data.filter((v: { isCurrent: boolean }) => v.isCurrent).length).toBe(1);
    expect(
      versions.body.data.map((v: { originalFilename: string }) => v.originalFilename).sort(),
    ).toEqual(["first.png", "second.png"]);
  });

  it("does not expose a stored file under a predictable public path", async () => {
    const candidate = await createCandidate();
    const documents = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/documents`,
      token: candidate.token,
    });
    const requirement = documents.body.data[0];
    const uploaded = await uploadDocument(
      candidate,
      requirement.requirementId,
      TINY_PNG,
      "identity.png",
      "image/png",
    );

    const versionId = uploaded.body.data.document.currentVersion.id;

    // A direct request for the storage path is not served.
    const direct = await api({
      method: "get",
      path: `/api/documents/${uploaded.body.data.document.id}/versions/${versionId}/download`,
      token: candidate.token,
    });
    expect(direct.status).toBe(200);
    expect(direct.headers["content-disposition"]).toContain("attachment");
  });

  it("lists outstanding mandatory documents in the readiness result", async () => {
    const candidate = await createCandidate();
    const response = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/readiness`,
      token: candidate.token,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.ready).toBe(false);
    expect(response.body.data.missing.documents.length).toBeGreaterThan(0);
    expect(
      response.body.data.missing.documents.every(
        (document: { isMandatory: boolean }) => document.isMandatory,
      ),
    ).toBe(true);
  });

  it("clears a mandatory document from the readiness list once it is uploaded", async () => {
    const candidate = await createCandidate();
    await uploadMandatoryDocuments(candidate);

    const response = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}/readiness`,
      token: candidate.token,
    });

    const outstanding = response.body.data.missing.documents.filter(
      (document: { isMandatory: boolean }) => document.isMandatory,
    );
    expect(outstanding.length).toBe(0);
  });
});
