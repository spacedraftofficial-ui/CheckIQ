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
 * Notification behaviour.
 *
 * A failed notification must never undo a successful business transaction.
 */
describe("notifications", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  it("records an in-app notification for the candidate on submission", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);
    await acceptConsent(candidate);
    await uploadMandatoryDocuments(candidate);

    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/submit`,
      token: candidate.token,
      body: { idempotencyKey: `notify-${candidate.candidateId}`, confirmDeclaration: true },
    });

    const notifications = await api({
      method: "get",
      path: "/api/notifications",
      token: candidate.token,
    });

    expect(notifications.status).toBe(200);
    const submission = notifications.body.data.find(
      (notification: { event: string; channel: string }) =>
        notification.event === "CASE_SUBMITTED" && notification.channel === "IN_APP",
    );
    expect(submission).toBeTruthy();
    expect(submission.deliveryStatus).toBe("SENT");
  });

  it("does not undo a successful submission when a notification fails to send", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);
    await acceptConsent(candidate);
    await uploadMandatoryDocuments(candidate);

    // Email delivery is disabled in the test environment, so the email channel
    // fails while the in-app channel succeeds.
    const submit = await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/submit`,
      token: candidate.token,
      body: { idempotencyKey: `notify-fail-${candidate.candidateId}`, confirmDeclaration: true },
    });

    expect(submit.status).toBe(201);
    expect(submit.body.data.status).toBe("SUBMITTED");

    const detail = await api({
      method: "get",
      path: `/api/cases/${candidate.caseId}`,
      token: candidate.token,
    });
    expect(detail.body.data.status).toBe("SUBMITTED");
    expect(detail.body.data.submittedAt).toBeTruthy();

    const notifications = await api({
      method: "get",
      path: "/api/notifications",
      token: candidate.token,
    });

    const emailNotification = notifications.body.data.find(
      (notification: { event: string; channel: string }) =>
        notification.event === "CASE_SUBMITTED" && notification.channel === "EMAIL",
    );
    expect(emailNotification).toBeTruthy();
    expect(emailNotification.deliveryStatus).toBe("FAILED");
    expect(emailNotification.lastError).toBeTruthy();

    const inAppNotification = notifications.body.data.find(
      (notification: { event: string; channel: string }) =>
        notification.event === "CASE_SUBMITTED" && notification.channel === "IN_APP",
    );
    expect(inAppNotification.deliveryStatus).toBe("SENT");
  });

  it("does not send a duplicate notification for a repeated submission", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);
    await acceptConsent(candidate);
    await uploadMandatoryDocuments(candidate);

    const key = `notify-duplicate-${candidate.candidateId}`;
    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/submit`,
      token: candidate.token,
      body: { idempotencyKey: key, confirmDeclaration: true },
    });
    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/submit`,
      token: candidate.token,
      body: { idempotencyKey: key, confirmDeclaration: true },
    });

    const notifications = await api({
      method: "get",
      path: "/api/notifications",
      token: candidate.token,
    });

    const submissionNotifications = notifications.body.data.filter(
      (notification: { event: string }) => notification.event === "CASE_SUBMITTED",
    );
    expect(submissionNotifications.length).toBe(2); // one in-app, one email
  });

  it("keeps a candidate's notifications private to that candidate", async () => {
    const first = await createCandidate();
    const second = await createCandidate();

    const firstNotifications = await api({
      method: "get",
      path: "/api/notifications",
      token: first.token,
    });
    const secondNotifications = await api({
      method: "get",
      path: "/api/notifications",
      token: second.token,
    });

    // Each candidate sees only their own notifications, and neither sees a
    // notification addressed to the other.
    expect(firstNotifications.body.data.length).toBeGreaterThan(0);
    expect(
      firstNotifications.body.data.every(
        (notification: { recipientUserId: string }) => notification.recipientUserId === first.userId,
      ),
    ).toBe(true);
    expect(
      secondNotifications.body.data.every(
        (notification: { recipientUserId: string }) => notification.recipientUserId === second.userId,
      ),
    ).toBe(true);
  });

  it("marks a notification as read", async () => {
    const candidate = await createCandidate();
    await completeProfile(candidate);
    await acceptConsent(candidate);
    await uploadMandatoryDocuments(candidate);
    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/submit`,
      token: candidate.token,
      body: { idempotencyKey: `notify-read-${candidate.candidateId}`, confirmDeclaration: true },
    });

    const notifications = await api({
      method: "get",
      path: "/api/notifications",
      token: candidate.token,
    });

    for (const notification of notifications.body.data) {
      const read = await api({
        method: "post",
        path: `/api/notifications/${notification.id}/read`,
        token: candidate.token,
        body: {},
      });
      expect(read.status).toBe(200);
    }

    const unread = await api({
      method: "get",
      path: "/api/notifications/unread-count",
      token: candidate.token,
    });
    expect(unread.body.data.unread).toBe(0);
  });

  it("does not let one candidate mark another's notification as read", async () => {
    const first = await createCandidate();
    const second = await createCandidate();

    await completeProfile(first);
    await acceptConsent(first);
    await uploadMandatoryDocuments(first);
    await api({
      method: "post",
      path: `/api/cases/${first.caseId}/submit`,
      token: first.token,
      body: { idempotencyKey: `notify-priv-${first.candidateId}`, confirmDeclaration: true },
    });

    const notifications = await api({
      method: "get",
      path: "/api/notifications",
      token: first.token,
    });
    const notification = notifications.body.data[0];

    const response = await api({
      method: "post",
      path: `/api/notifications/${notification.id}/read`,
      token: second.token,
      body: {},
    });

    expect(response.status).toBe(404);
  });

  it("notifies the verifier when a case is assigned", async () => {
    const candidate = await createCandidate();
    const executive = await createStaff(["BGV_EXECUTIVE"]);
    const admin = await createStaff(["ADMINISTRATOR"]);

    await api({
      method: "post",
      path: `/api/cases/${candidate.caseId}/assign`,
      token: admin.token,
      body: { verifierId: executive.userId },
    });

    const notifications = await api({
      method: "get",
      path: "/api/notifications",
      token: executive.token,
    });

    const assignment = notifications.body.data.find(
      (notification: { event: string }) => notification.event === "CASE_ASSIGNED",
    );
    expect(assignment).toBeTruthy();
  });
});
