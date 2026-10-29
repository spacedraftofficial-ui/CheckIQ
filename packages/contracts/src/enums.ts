import { z } from "zod";

/**
 * Shared domain vocabulary. These values are persisted in MySQL, so they are
 * treated as immutable once the database is migrated. New values require a
 * migration.
 */

export const USER_ROLES = [
  "CANDIDATE",
  "BGV_EXECUTIVE",
  "BGV_REVIEWER",
  "HR_RECRUITMENT",
  "ADMINISTRATOR",
  "SUPER_ADMINISTRATOR",
] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const userRoleSchema = z.enum(USER_ROLES);

export const ROLE_LABELS: Record<UserRole, string> = {
  CANDIDATE: "Candidate",
  BGV_EXECUTIVE: "BGV Executive",
  BGV_REVIEWER: "BGV Reviewer / Manager",
  HR_RECRUITMENT: "HR / Recruitment",
  ADMINISTRATOR: "Administrator",
  SUPER_ADMINISTRATOR: "Super Administrator",
};

export const PERMISSIONS = [
  "case:read:own",
  "case:read:assigned",
  "case:read:any",
  "case:create",
  "case:assign",
  "case:manage",
  "case:list:queue",
  "verification:record",
  "verification:read",
  "clarification:create",
  "clarification:respond:own",
  "clarification:close",
  "review:read",
  "review:decide",
  "approval:decide",
  "score:read",
  "score:generate",
  "score:adjust",
  "report:read",
  "report:generate",
  "notification:read:own",
  "notification:manage",
  "user:manage",
  "role:manage",
  "permission:manage",
  "config:read",
  "config:manage",
  "package:manage",
  "documentcategory:manage",
  "profile:write:own",
  "profile:read:any",
  "employment:read:any",
  "audit:read",
  "audit:read:own",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export const permissionSchema = z.enum(PERMISSIONS);

export const CASE_STATUSES = [
  "DRAFT",
  "BGV_INVITED",
  "REGISTRATION_PENDING",
  "DOCUMENT_UPLOAD_IN_PROGRESS",
  "SUBMITTED",
  "VERIFICATION_IN_PROGRESS",
  "CLARIFICATION_REQUIRED",
  "VERIFICATION_COMPLETED",
  "BGV_SCORE_GENERATED",
  "BGV_REVIEW_REQUIRED",
  "BELOW_BGV_ELIGIBILITY_THRESHOLD",
  "BGV_APPROVED",
  "ELIGIBLE_FOR_FINAL_INTERVIEW",
  "CLOSED",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
export const caseStatusSchema = z.enum(CASE_STATUSES);

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  DRAFT: "Draft",
  BGV_INVITED: "BGV Invited",
  REGISTRATION_PENDING: "Registration Pending",
  DOCUMENT_UPLOAD_IN_PROGRESS: "Document Upload In Progress",
  SUBMITTED: "Submitted",
  VERIFICATION_IN_PROGRESS: "Verification In Progress",
  CLARIFICATION_REQUIRED: "Clarification Required",
  VERIFICATION_COMPLETED: "Verification Completed",
  BGV_SCORE_GENERATED: "BGV Score Generated",
  BGV_REVIEW_REQUIRED: "BGV Review Required",
  BELOW_BGV_ELIGIBILITY_THRESHOLD: "Below BGV Eligibility Threshold",
  BGV_APPROVED: "BGV Approved",
  ELIGIBLE_FOR_FINAL_INTERVIEW: "Eligible for Final Interview",
  CLOSED: "Closed",
};

/**
 * Terminal statuses never transition out of the machine unless reopened by an
 * authorised administrator, which is modelled as an explicit audit event.
 */
export const TERMINAL_CASE_STATUSES: readonly CaseStatus[] = ["CLOSED"];

export const CHECK_STATUSES = [
  "NOT_SUBMITTED",
  "SUBMITTED",
  "UNDER_VERIFICATION",
  "CLARIFICATION_REQUIRED",
  "VERIFIED",
  "PARTIALLY_VERIFIED",
  "UNABLE_TO_VERIFY",
  "DISCREPANCY_FOUND",
  "REJECTED",
] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];
export const checkStatusSchema = z.enum(CHECK_STATUSES);

export const CHECK_TYPE_CODES = [
  "IDENTITY",
  "ADDRESS",
  "EDUCATION",
  "EMPLOYMENT",
  "EMPLOYMENT_DURATION",
  "DESIGNATION",
  "SALARY",
  "DOCUMENT_AUTHENTICITY",
  "REFERENCES",
  "CRIMINAL_RECORD",
  "CUSTOM",
] as const;
export type CheckTypeCode = (typeof CHECK_TYPE_CODES)[number];
export const checkTypeCodeSchema = z.enum(CHECK_TYPE_CODES);

export const DOCUMENT_STATUSES = [
  "MISSING",
  "UPLOADED",
  "UNDER_REVIEW",
  "ACCEPTED",
  "REJECTED",
  "CLARIFICATION_REQUIRED",
  "SUPERSEDED",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export const documentStatusSchema = z.enum(DOCUMENT_STATUSES);

export const DOCUMENT_CATEGORY_CODES = [
  "IDENTITY",
  "ADDRESS_PROOF",
  "EDUCATION",
  "EMPLOYMENT",
  "SALARY",
  "TAX",
  "DOCUMENT_AUTHENTICITY",
  "OTHER",
] as const;
export type DocumentCategoryCode = (typeof DOCUMENT_CATEGORY_CODES)[number];
export const documentCategoryCodeSchema = z.enum(DOCUMENT_CATEGORY_CODES);

export const CLARIFICATION_STATUSES = [
  "OPEN",
  "RESPONDED",
  "CLOSED",
  "CANCELLED",
] as const;
export type ClarificationStatus = (typeof CLARIFICATION_STATUSES)[number];
export const clarificationStatusSchema = z.enum(CLARIFICATION_STATUSES);

export const REVIEW_STATUSES = [
  "PENDING",
  "APPROVED",
  "RETURNED_FOR_WORK",
  "REJECTED",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const reviewStatusSchema = z.enum(REVIEW_STATUSES);

export const SCORE_OUTCOMES = [
  "PENDING",
  "ABOVE_THRESHOLD",
  "BELOW_THRESHOLD",
  "PROVISIONAL",
] as const;
export type ScoreOutcome = (typeof SCORE_OUTCOMES)[number];
export const scoreOutcomeSchema = z.enum(SCORE_OUTCOMES);

export const NOTIFICATION_CHANNELS = ["EMAIL", "IN_APP"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export const notificationChannelSchema = z.enum(NOTIFICATION_CHANNELS);

export const NOTIFICATION_DELIVERY_STATUSES = [
  "PENDING",
  "SENT",
  "FAILED",
  "SUPPRESSED",
] as const;
export type NotificationDeliveryStatus = (typeof NOTIFICATION_DELIVERY_STATUSES)[number];
export const notificationDeliveryStatusSchema = z.enum(NOTIFICATION_DELIVERY_STATUSES);

export const NOTIFICATION_EVENTS = [
  "ACCOUNT_CREATED",
  "ACCOUNT_ACTIVATED",
  "PROFILE_COMPLETED",
  "DOCUMENTS_REQUIRED",
  "DOCUMENT_UPLOADED",
  "DOCUMENT_REJECTED",
  "CASE_SUBMITTED",
  "CLARIFICATION_REQUESTED",
  "CLARIFICATION_RESPONDED",
  "CLARIFICATION_RESUBMITTED",
  "VERIFICATION_IN_PROGRESS",
  "VERIFICATION_COMPLETED",
  "SCORE_GENERATED",
  "BGV_COMPLETED",
  "BGV_OUTCOME",
  "CASE_ASSIGNED",
  "REVIEW_REQUIRED",
  "ADMIN_NOTICE",
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];
export const notificationEventSchema = z.enum(NOTIFICATION_EVENTS);

export const AUDIT_ACTIONS = [
  "AUTH_LOGIN_SUCCEEDED",
  "AUTH_LOGIN_FAILED",
  "AUTH_LOGOUT",
  "AUTH_PASSWORD_CHANGED",
  "AUTH_TOKEN_REFRESHED",
  "USER_CREATED",
  "USER_UPDATED",
  "USER_ROLE_CHANGED",
  "USER_PERMISSIONS_CHANGED",
  "USER_DISABLED",
  "USER_DELETED",
  "USER_EMAIL_VERIFIED",
  "CANDIDATE_ID_REGISTERED",
  "CANDIDATE_ID_DUPLICATE_REJECTED",
  "PROFILE_UPDATED",
  "CONSENT_ACCEPTED",
  "DOCUMENT_UPLOADED",
  "DOCUMENT_REPLACED",
  "DOCUMENT_VIEWED",
  "DOCUMENT_DOWNLOADED",
  "DOCUMENT_REJECTED",
  "DOCUMENT_STATUS_CHANGED",
  "CASE_CREATED",
  "CASE_STATUS_CHANGED",
  "CASE_ASSIGNED",
  "CASE_SUBMITTED",
  "VERIFICATION_RECORDED",
  "VERIFICATION_STATUS_CHANGED",
  "CLARIFICATION_REQUESTED",
  "CLARIFICATION_RESPONDED",
  "CLARIFICATION_CLOSED",
  "SCORE_GENERATED",
  "SCORE_ADJUSTED",
  "REVIEW_RECORDED",
  "APPROVAL_RECORDED",
  "CASE_CLOSED",
  "CASE_DISABLED",
  "CASE_ENABLED",
  "REPORT_GENERATED",
  "NOTIFICATION_SENT",
  "NOTIFICATION_FAILED",
  "CONFIG_CHANGED",
  "ACCESS_DENIED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export const auditActionSchema = z.enum(AUDIT_ACTIONS);

export const ALLOWED_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;
export type AllowedUploadMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

export const ALLOWED_UPLOAD_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"] as const;
