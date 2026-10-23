import { z } from "zod";

export const consentVersionSchema = z.object({
  id: z.string().uuid(),
  version: z.string(),
  title: z.string(),
  body: z.string(),
  effectiveFrom: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type ConsentVersion = z.infer<typeof consentVersionSchema>;

export const consentAcceptanceSchema = z.object({
  id: z.string().uuid(),
  consentVersionId: z.string().uuid(),
  version: z.string(),
  acceptedAt: z.string(),
  acceptedByUserId: z.string().uuid(),
  candidateId: z.string(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
});
export type ConsentAcceptance = z.infer<typeof consentAcceptanceSchema>;

export const acceptConsentSchema = z.object({
  consentVersionId: z.string().uuid(),
  /** Must be true — the candidate must actively confirm reading the wording. */
  accepted: z.literal(true),
});
export type AcceptConsentRequest = z.infer<typeof acceptConsentSchema>;
