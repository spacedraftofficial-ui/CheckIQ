import { describe, expect, it } from "vitest";
import { api, createCandidate, createStaff } from "./helpers.js";

/** The operations case list shows, and can be searched by, the candidate's email. */
describe("case list", () => {
  it("includes the candidate email on each case", async () => {
    const candidate = await createCandidate();
    const admin = await createStaff(["ADMINISTRATOR"]);

    const response = await api({ method: "get", path: "/api/cases?pageSize=100", token: admin.token });
    expect(response.status).toBe(200);
    const row = response.body.data.find((item: { candidateId: string }) => item.candidateId === candidate.candidateId);
    expect(row?.candidateEmail).toBe(candidate.email);
  });

  it("finds a case by part of the candidate email", async () => {
    const candidate = await createCandidate();
    const admin = await createStaff(["ADMINISTRATOR"]);
    // Includes "@" so it cannot match the candidate ID or name, only the email.
    const fragment = `${candidate.email.split("@")[0]!}@example`;

    const response = await api({
      method: "get",
      path: `/api/cases?search=${encodeURIComponent(fragment)}`,
      token: admin.token,
    });
    expect(response.status).toBe(200);
    const emails = response.body.data.map((item: { candidateEmail: string }) => item.candidateEmail);
    expect(emails).toContain(candidate.email);
  });
});
