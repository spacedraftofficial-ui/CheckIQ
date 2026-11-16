import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { api, createCandidate, createStaff, uniqueCandidateId } from "./helpers.js";
import { getDatabase, schema } from "../src/db/client.js";
import { hashOtp, MAX_OTP_ATTEMPTS } from "../src/modules/auth/otp.js";

/**
 * One-time codes are bound to the account they were issued for, limited in
 * the number of guesses, and may repeat across accounts without failing.
 */

async function signupUnverified(): Promise<{ email: string; code: string; userId: string }> {
  const candidateId = uniqueCandidateId();
  const email = `${candidateId.toLowerCase()}@example.test`;
  const response = await api({
    method: "post",
    path: "/api/auth/signup",
    body: {
      candidateId,
      fullName: "Otp Person",
      email,
      mobile: "+919812345678",
      password: "Str0ng!Passw0rd",
      confirmPassword: "Str0ng!Passw0rd",
    },
  });
  expect(response.status).toBe(201);
  return { email, code: response.body.data.verificationCode, userId: response.body.data.userId };
}

function verify(email: string, code: string) {
  return api({ method: "post", path: "/api/auth/verify-email", body: { email, code }, auth: false });
}

/** A code that is guaranteed not to match `code`. */
function wrongCode(code: string): string {
  return code === "111111" ? "222222" : "111111";
}

describe("email verification codes", () => {
  it("does not verify an account using another account's code", async () => {
    const a = await signupUnverified();
    const b = await signupUnverified();

    const response = await verify(b.email, a.code);
    expect(response.status).toBe(400);

    const [user] = await getDatabase()
      .db.select({ verified: schema.users.isEmailVerified })
      .from(schema.users)
      .where(eq(schema.users.id, b.userId));
    expect(user?.verified).toBe(false);
  });

  it("destroys the code after too many wrong attempts", async () => {
    const a = await signupUnverified();
    for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) {
      expect((await verify(a.email, wrongCode(a.code))).status).toBe(400);
    }
    // Even the right code no longer works; a new one must be requested.
    expect((await verify(a.email, a.code)).status).toBe(400);
  });

  it("lets two accounts hold the same code at once", async () => {
    const a = await signupUnverified();
    const b = await signupUnverified();
    await getDatabase()
      .db.update(schema.emailVerificationTokens)
      .set({ tokenHash: hashOtp(a.code) })
      .where(eq(schema.emailVerificationTokens.userId, b.userId));

    expect((await verify(a.email, a.code)).status).toBe(200);
    expect((await verify(b.email, a.code)).status).toBe(200);
  });
});

describe("password reset codes", () => {
  async function issueResetCode(userId: string, code: string): Promise<void> {
    await getDatabase().db.insert(schema.passwordResetTokens).values({
      id: crypto.randomUUID(),
      userId,
      tokenHash: hashOtp(code),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
  }

  it("only resets the password of the account the code belongs to", async () => {
    const victim = await createCandidate();
    const attacker = await createCandidate();
    await issueResetCode(victim.userId, "424242");

    const wrongAccount = await api({
      method: "post",
      path: "/api/auth/reset-password",
      body: { email: attacker.email, code: "424242", newPassword: "N3w!Passw0rd#1" },
      auth: false,
    });
    expect(wrongAccount.status).toBe(401);

    const rightAccount = await api({
      method: "post",
      path: "/api/auth/reset-password",
      body: { email: victim.email, code: "424242", newPassword: "N3w!Passw0rd#1" },
      auth: false,
    });
    expect(rightAccount.status).toBe(200);
  });

  it("destroys the reset code after too many wrong attempts", async () => {
    const candidate = await createCandidate();
    await issueResetCode(candidate.userId, "424242");
    const attempt = (code: string) =>
      api({
        method: "post",
        path: "/api/auth/reset-password",
        body: { email: candidate.email, code, newPassword: "N3w!Passw0rd#1" },
        auth: false,
      });

    for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) {
      expect((await attempt("111111")).status).toBe(401);
    }
    expect((await attempt("424242")).status).toBe(401);
  });
});

describe("staff sign-in", () => {
  it("lets a staff account created by an administrator sign in without email verification", async () => {
    const superAdmin = await createStaff(["SUPER_ADMINISTRATOR"]);
    const email = `exec-${Date.now()}@checkiq.test`;
    const created = await api({
      method: "post",
      path: "/api/admin/users",
      token: superAdmin.token,
      body: { email, fullName: "New Executive", roles: ["BGV_EXECUTIVE"], temporaryPassword: "Temp!Password123" },
    });
    expect(created.status).toBe(201);

    const login = await api({
      method: "post",
      path: "/api/auth/login",
      body: { identifier: email, password: "Temp!Password123" },
      auth: false,
    });
    expect(login.status).toBe(200);
  });
});
