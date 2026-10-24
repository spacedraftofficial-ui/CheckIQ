import { Router } from "express";
import { z } from "zod";
import {
  changePasswordRequestSchema,
  loginRequestSchema,
  refreshRequestSchema,
  signupRequestSchema,
} from "@checkiq/contracts";
import { validate } from "../../middleware/validate.js";
import { authenticate, requirePrincipal } from "../../middleware/authenticate.js";
import { authRateLimit, signupRateLimit } from "../../middleware/rate-limit.js";
import { changePassword, login, logout, refresh, signup } from "./auth.service.js";
import { REFRESH_COOKIE_NAME } from "./auth.service.js";
import { clearRefreshCookie, setRefreshCookie } from "./auth.cookie.js";
import { buildSessionUser } from "./auth.service.js";
import { verifyEmailOtp, resendVerificationEmail } from "./email-verification.service.js";

export const authRouter = Router();

function requestContext(req: { ipAddress?: string; userAgent?: string; requestId: string }) {
  return {
    ipAddress: req.ipAddress ?? null,
    userAgent: req.userAgent ?? null,
    requestId: req.requestId,
  };
}

/**
 * POST /api/auth/signup
 *
 * Registers a candidate with an entered Candidate ID. No invitation, OTP or
 * pre-registered record is required. The candidate must verify their email
 * before they can sign in.
 */
authRouter.post(
  "/signup",
  signupRateLimit,
  validate({ body: signupRequestSchema }),
  async (req, res) => {
    const result = await signup(req.body, requestContext(req));
    const responseData: Record<string, unknown> = {
      userId: result.userId,
      email: result.email,
      fullName: result.fullName,
      requiresEmailVerification: result.requiresEmailVerification,
    };
    // Only expose the verification code in development for testing convenience.
    if (result.verificationCode) {
      responseData.verificationCode = result.verificationCode;
    }
    res.status(201).json({ data: responseData });
  },
);

/**
 * POST /api/auth/login
 */
authRouter.post(
  "/login",
  authRateLimit,
  validate({ body: loginRequestSchema }),
  async (req, res) => {
    const result = await login(req.body, requestContext(req));
    setRefreshCookie(res, result.refreshToken);
    res.status(200).json({ data: result.response });
  },
);

/**
 * POST /api/auth/verify-email
 */
const verifyEmailSchema = z.object({
  code: z.string().length(6, "Enter the 6-digit verification code"),
});

authRouter.post(
  "/verify-email",
  validate({ body: verifyEmailSchema }),
  async (req, res) => {
    const result = await verifyEmailOtp(req.body.code);
    if (result.success) {
      res.status(200).json({ data: { verified: true, message: result.message } });
    } else {
      res.status(400).json({
        error: { code: "EMAIL_VERIFICATION_FAILED", message: result.message },
      });
    }
  },
);

/**
 * POST /api/auth/resend-verification
 */
const resendVerificationSchema = z.object({
  email: z.email("Enter a valid email address"),
});

authRouter.post(
  "/resend-verification",
  signupRateLimit,
  validate({ body: resendVerificationSchema }),
  async (req, res) => {
    const result = await resendVerificationEmail(req.body.email);
    res.status(200).json({ data: { sent: result.sent, message: result.message } });
  },
);

/**
 * POST /api/auth/refresh
 *
 * Rotates the refresh token and returns a new access token.
 */
authRouter.post(
  "/refresh",
  validate({ body: refreshRequestSchema }),
  async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    const result = await refresh(token, requestContext(req));
    setRefreshCookie(res, result.refreshToken);
    res.status(200).json({ data: result.response });
  },
);

/**
 * POST /api/auth/logout
 */
authRouter.post("/logout", async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
  await logout(token, req.principal?.userId ?? null, requestContext(req));
  clearRefreshCookie(res);
  res.status(200).json({ data: { signedOut: true } });
});

/**
 * GET /api/auth/me
 */
authRouter.get("/me", authenticate, requirePrincipal, async (req, res) => {
  const user = await buildSessionUser(req.principal!.userId);
  res.status(200).json({ data: user });
});

/**
 * POST /api/auth/change-password
 */
authRouter.post(
  "/change-password",
  authenticate,
  requirePrincipal,
  validate({ body: changePasswordRequestSchema }),
  async (req, res) => {
    await changePassword(
      req.principal!.userId,
      req.body.currentPassword,
      req.body.newPassword,
      requestContext(req),
    );
    res.status(200).json({ data: { changed: true } });
  },
);
