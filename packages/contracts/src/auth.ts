import { z } from "zod";
import { userRoleSchema } from "./enums.js";

export const passwordSchema = z
  .string()
  .min(10, { error: "Password must be at least 10 characters" })
  .max(128, { error: "Password must be at most 128 characters" })
  .regex(/[a-z]/, { error: "Password must contain a lowercase letter" })
  .regex(/[A-Z]/, { error: "Password must contain an uppercase letter" })
  .regex(/[0-9]/, { error: "Password must contain a digit" })
  .regex(/[^A-Za-z0-9]/, { error: "Password must contain a symbol" });

export const candidateIdSchema = z
  .string()
  .trim()
  .min(3, { error: "Candidate ID must be at least 3 characters" })
  .max(64, { error: "Candidate ID must be at most 64 characters" });

/**
 * Signup accepts a Candidate ID that has not been pre-registered. The format is
 * configurable server-side; this schema only enforces a safe character set.
 */
export const candidateIdFormatSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/, {
    error: "Candidate ID may contain letters, numbers, dot, underscore and hyphen only",
  });

export const signupRequestSchema = z.object({
  candidateId: candidateIdFormatSchema,
  fullName: z.string().trim().min(2, { error: "Full name is required" }).max(160),
  email: z.email({ error: "Enter a valid email address" }).max(254),
  mobile: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9\s-]{6,19}$/, { error: "Enter a valid mobile number" }),
  password: passwordSchema,
  confirmPassword: z.string(),
  company: z.string().trim().max(160).optional(),
  department: z.string().trim().max(160).optional(),
  position: z.string().trim().max(160).optional(),
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const loginRequestSchema = z.object({
  identifier: z.string().trim().min(3, { error: "Enter your email or Candidate ID" }).max(254),
  password: z.string().min(1, { error: "Password is required" }).max(128),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.object({});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const sessionUserSchema = z.object({
  id: z.string().uuid(),
  email: z.email(),
  fullName: z.string(),
  roles: z.array(userRoleSchema),
  permissions: z.array(z.string()),
  candidateId: z.string().nullable(),
  mustChangePassword: z.boolean(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const authResponseSchema = z.object({
  user: sessionUserSchema,
  /**
   * Short-lived access token. The client keeps it in memory only — it is never
   * written to localStorage or sessionStorage. The refresh token is delivered
   * separately as an httpOnly cookie.
   */
  accessToken: z.string(),
  expiresInSeconds: z.number().int().positive(),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const signupDuplicateResponseSchema = z.object({
  code: z.literal("CANDIDATE_ID_ALREADY_IN_USE"),
  candidateId: z.string(),
  message: z.string(),
  /** Recovery guidance shown to the candidate. */
  recovery:
    z.object({
      canSignIn: z.boolean(),
      supportContactConfigured: z.boolean(),
    }),
});
export type SignupDuplicateResponse = z.infer<typeof signupDuplicateResponseSchema>;
