import { beforeAll, describe, expect, it } from "vitest";
import {
  api,
  completeProfile,
  createCandidate,
  resetDatabase,
} from "./helpers.js";

/**
 * Profile update validation edge cases.
 *
 * HTML forms send empty strings for unfilled optional fields. The backend
 * schemas must coerce those to null rather than rejecting them.
 */
describe("profile update with empty optional fields", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  it("accepts empty strings for optional string fields (pan, passportNumber)", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);

    const response = await api({
      method: "put",
      path: "/api/profile",
      token: candidate.token,
      body: {
        pan: "",
        passportNumber: "",
        drivingLicenceNumber: "",
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.pan).toBeNull();
    expect(response.body.data.passportNumber).toBeNull();
    expect(response.body.data.drivingLicenceNumber).toBeNull();
  });

  it("accepts empty string for employment contactEmail", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);

    const response = await api({
      method: "put",
      path: "/api/profile",
      token: candidate.token,
      body: {
        employments: [
          {
            employer: "Test Employer",
            designation: "Engineer",
            fromDate: "2020-01-15",
            isCurrent: true,
            contactName: "",
            contactEmail: "",
            contactMobile: "",
          },
        ],
      },
    });

    expect(response.status).toBe(200);
    const emp = response.body.data.employments[0];
    expect(emp.contactName).toBeNull();
    expect(emp.contactEmail).toBeNull();
    expect(emp.contactMobile).toBeNull();
  });

  it("accepts empty string for employment toDate and dateOfBirth", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);

    const response = await api({
      method: "put",
      path: "/api/profile",
      token: candidate.token,
      body: {
        dateOfBirth: "",
        employer: undefined,
        employments: [
          {
            employer: "Test Employer",
            designation: "Engineer",
            fromDate: "2020-01-15",
            toDate: "",
            isCurrent: false,
          },
        ],
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.dateOfBirth).toBeNull();
    const emp = response.body.data.employments[0];
    expect(emp.toDate).toBeNull();
  });

  it("rejects empty string for required employment fromDate", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);

    const response = await api({
      method: "put",
      path: "/api/profile",
      token: candidate.token,
      body: {
        employments: [
          {
            employer: "Test Employer",
            designation: "Engineer",
            fromDate: "",
            isCurrent: true,
          },
        ],
      },
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("preserves address ids when updating", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);

    const profile = await api({
      method: "get",
      path: "/api/profile",
      token: candidate.token,
    });
    const address = profile.body.data.addresses[0];

    const response = await api({
      method: "put",
      path: "/api/profile",
      token: candidate.token,
      body: {
        addresses: [
          {
            id: address.id,
            type: address.type,
            line1: "2 New Street",
            city: address.city,
            state: address.state,
            country: address.country,
            postalCode: "",
          },
        ],
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.addresses[0].id).toBe(address.id);
  });
});
