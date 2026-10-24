/**
 * Catalogue data seeded into the database on first run.
 *
 * These are development defaults. Everything here is editable by an
 * administrator at runtime — the seed only establishes the starting point.
 * Policy-dependent values (scoring weights, consent wording) are clearly
 * marked and must be confirmed before production use.
 */

export const DOCUMENT_CATEGORY_SEED = [
  { code: "IDENTITY", name: "Identity verification", displayOrder: 1 },
  { code: "ADDRESS_PROOF", name: "Address verification", displayOrder: 2 },
  { code: "EDUCATION", name: "Education verification", displayOrder: 3 },
  { code: "EMPLOYMENT", name: "Employment verification", displayOrder: 4 },
  { code: "SALARY", name: "Salary information", displayOrder: 5 },
  { code: "TAX", name: "Tax documents", displayOrder: 6 },
  { code: "DOCUMENT_AUTHENTICITY", name: "Document authenticity", displayOrder: 7 },
  { code: "OTHER", name: "Other supporting documents", displayOrder: 8 },
] as const;

export const DOCUMENT_TYPE_SEED = [
  { categoryCode: "IDENTITY", code: "PAN_CARD", name: "PAN card", displayOrder: 1 },
  { categoryCode: "IDENTITY", code: "AADHAAR", name: "Aadhaar card", displayOrder: 2 },
  { categoryCode: "IDENTITY", code: "PASSPORT", name: "Passport", displayOrder: 3 },
  { categoryCode: "IDENTITY", code: "DRIVING_LICENCE", name: "Driving licence", displayOrder: 4 },
  { categoryCode: "ADDRESS_PROOF", code: "UTILITY_BILL", name: "Utility bill", displayOrder: 1 },
  { categoryCode: "ADDRESS_PROOF", code: "RENT_AGREEMENT", name: "Rent agreement", displayOrder: 2 },
  { categoryCode: "ADDRESS_PROOF", code: "BANK_STATEMENT", name: "Bank statement", displayOrder: 3 },
  { categoryCode: "EDUCATION", code: "EDUCATION_CERTIFICATE", name: "Education certificate", displayOrder: 1 },
  { categoryCode: "EDUCATION", code: "MARKSHEET", name: "Marksheet", displayOrder: 2 },
  { categoryCode: "EDUCATION", code: "TRANSFER_CERTIFICATE", name: "Transfer certificate", displayOrder: 3 },
  { categoryCode: "EDUCATION", code: "REGISTRATION_CERTIFICATE", name: "Registration certificate", displayOrder: 4 },
  { categoryCode: "EMPLOYMENT", code: "OFFER_LETTER", name: "Offer letter", displayOrder: 1 },
  { categoryCode: "EMPLOYMENT", code: "APPOINTMENT_LETTER", name: "Appointment letter", displayOrder: 2 },
  { categoryCode: "EMPLOYMENT", code: "EXPERIENCE_LETTER", name: "Experience letter", displayOrder: 3 },
  { categoryCode: "EMPLOYMENT", code: "RELIEVING_LETTER", name: "Relieving letter", displayOrder: 4 },
  { categoryCode: "EMPLOYMENT", code: "EMPLOYMENT_ID", name: "Employment ID card", displayOrder: 5 },
  { categoryCode: "SALARY", code: "SALARY_SLIP", name: "Salary slip", displayOrder: 1 },
  { categoryCode: "SALARY", code: "SALARY_ACCOUNT_PROOF", name: "Salary account proof", displayOrder: 2 },
  { categoryCode: "TAX", code: "FORM_16", name: "Form 16", displayOrder: 1 },
  { categoryCode: "DOCUMENT_AUTHENTICITY", code: "DECLARED_DOCUMENT", name: "Self-declared document copy", displayOrder: 1 },
  {
    categoryCode: "DOCUMENT_AUTHENTICITY",
    code: "ORGANISATION_LETTER",
    name: "Letter from issuing organisation",
    displayOrder: 2,
  },
  {
    categoryCode: "DOCUMENT_AUTHENTICITY",
    code: "VERIFICATION_RECEIPT",
    name: "Verification acknowledgement",
    displayOrder: 3,
  },
  { categoryCode: "OTHER", code: "SUPPORTING_DOCUMENT", name: "Other supporting document", displayOrder: 1 },
] as const;

export const CHECK_DEFINITION_SEED = [
  {
    code: "IDENTITY",
    name: "Identity verification",
    description: "Confirms the identity document matches the candidate.",
    isMandatoryDefault: true,
    requiresReviewOnDiscrepancy: true,
    isAvailable: true,
    displayOrder: 1,
  },
  {
    code: "ADDRESS",
    name: "Address verification",
    description: "Confirms the declared current and permanent addresses.",
    isMandatoryDefault: true,
    requiresReviewOnDiscrepancy: true,
    isAvailable: true,
    displayOrder: 2,
  },
  {
    code: "EDUCATION",
    name: "Education verification",
    description: "Confirms qualification, institution, board and year of passing.",
    isMandatoryDefault: true,
    requiresReviewOnDiscrepancy: true,
    isAvailable: true,
    displayOrder: 3,
  },
  {
    code: "EMPLOYMENT",
    name: "Previous employment verification",
    description: "Confirms the declared previous employer and designation.",
    isMandatoryDefault: true,
    requiresReviewOnDiscrepancy: true,
    isAvailable: true,
    displayOrder: 4,
  },
  {
    code: "EMPLOYMENT_DURATION",
    name: "Employment duration verification",
    description: "Confirms the declared employment dates.",
    isMandatoryDefault: true,
    requiresReviewOnDiscrepancy: true,
    isAvailable: true,
    displayOrder: 5,
  },
  {
    code: "DESIGNATION",
    name: "Designation verification",
    description: "Confirms the designation held during the declared employment.",
    isMandatoryDefault: true,
    requiresReviewOnDiscrepancy: true,
    isAvailable: true,
    displayOrder: 6,
  },
  {
    code: "SALARY",
    name: "Salary information verification",
    description: "Confirms salary information where the package requires it.",
    isMandatoryDefault: false,
    requiresReviewOnDiscrepancy: true,
    isAvailable: true,
    displayOrder: 7,
  },
  {
    code: "DOCUMENT_AUTHENTICITY",
    name: "Document authenticity verification",
    description: "Confirms uploaded documents are genuine and unaltered.",
    isMandatoryDefault: true,
    requiresReviewOnDiscrepancy: true,
    isAvailable: true,
    displayOrder: 8,
  },
  {
    code: "REFERENCES",
    name: "Reference checks",
    description: "Checks supplied references where the package requires it.",
    isMandatoryDefault: false,
    requiresReviewOnDiscrepancy: true,
    isAvailable: true,
    displayOrder: 9,
  },
  {
    code: "CUSTOM",
    name: "Additional organisation-defined check",
    description: "A check defined by the organisation for a specific package.",
    isMandatoryDefault: false,
    requiresReviewOnDiscrepancy: true,
    isAvailable: true,
    displayOrder: 10,
  },
  {
    code: "CRIMINAL_RECORD",
    name: "Criminal or court record check",
    description:
      "Disabled by default. Enable only after the organisation confirms this check is appropriate and permitted for its use case (decision D-04).",
    isMandatoryDefault: false,
    requiresReviewOnDiscrepancy: true,
    isAvailable: false,
    displayOrder: 11,
  },
] as const;

export const PROFILE_FIELD_SEED = [
  { fieldKey: "fullName", label: "Full name", section: "PERSONAL", dataType: "TEXT", required: true, displayOrder: 1 },
  { fieldKey: "dateOfBirth", label: "Date of birth", section: "PERSONAL", dataType: "DATE", required: true, displayOrder: 2 },
  { fieldKey: "gender", label: "Gender", section: "PERSONAL", dataType: "SELECT", required: false, displayOrder: 3, options: ["MALE", "FEMALE", "NON_BINARY", "PREFER_NOT_TO_SAY"] },
  { fieldKey: "email", label: "Email address", section: "CONTACT", dataType: "EMAIL", required: true, displayOrder: 4 },
  { fieldKey: "mobile", label: "Mobile number", section: "CONTACT", dataType: "PHONE", required: true, displayOrder: 5 },
  { fieldKey: "currentAddress", label: "Current address", section: "ADDRESS", dataType: "TEXTAREA", required: true, displayOrder: 6 },
  { fieldKey: "permanentAddress", label: "Permanent address", section: "ADDRESS", dataType: "TEXTAREA", required: false, displayOrder: 7 },
  { fieldKey: "pan", label: "PAN", section: "IDENTITY", dataType: "TEXT", required: false, displayOrder: 8 },
  { fieldKey: "passportNumber", label: "Passport number", section: "IDENTITY", dataType: "TEXT", required: false, displayOrder: 9 },
  { fieldKey: "drivingLicenceNumber", label: "Driving licence number", section: "IDENTITY", dataType: "TEXT", required: false, displayOrder: 10 },
  { fieldKey: "education", label: "Education qualification", section: "EDUCATION", dataType: "TEXTAREA", required: true, displayOrder: 11 },
  { fieldKey: "employment", label: "Employment history", section: "EMPLOYMENT", dataType: "TEXTAREA", required: true, displayOrder: 12 },
] as const;

export const STANDARD_PACKAGE_SEED = {
  code: "STANDARD",
  name: "Standard Background Verification",
  description:
    "Identity, address, education, employment and document authenticity checks. Development default — confirm against policy (decision D-08).",
  requiresMakerChecker: true,
  profileFields: [
    "fullName",
    "dateOfBirth",
    "email",
    "mobile",
    "currentAddress",
    "education",
    "employment",
  ],
  requirements: [
    { categoryCode: "IDENTITY", documentTypeCode: "PAN_CARD", label: "PAN card", isMandatory: true, displayOrder: 1 },
    { categoryCode: "IDENTITY", documentTypeCode: "AADHAAR", label: "Aadhaar card", isMandatory: false, displayOrder: 2 },
    { categoryCode: "ADDRESS_PROOF", documentTypeCode: "UTILITY_BILL", label: "Address proof", isMandatory: true, displayOrder: 3 },
    { categoryCode: "EDUCATION", documentTypeCode: "EDUCATION_CERTIFICATE", label: "Education certificate", isMandatory: true, displayOrder: 4 },
    { categoryCode: "EDUCATION", documentTypeCode: "MARKSHEET", label: "Marksheet", isMandatory: false, displayOrder: 5 },
    { categoryCode: "EMPLOYMENT", documentTypeCode: "RELIEVING_LETTER", label: "Experience or relieving letter", isMandatory: true, displayOrder: 6 },
    { categoryCode: "EMPLOYMENT", documentTypeCode: "OFFER_LETTER", label: "Offer or appointment letter", isMandatory: false, displayOrder: 7 },
    { categoryCode: "DOCUMENT_AUTHENTICITY", documentTypeCode: "DECLARED_DOCUMENT", label: "Documents for authenticity check", isMandatory: true, displayOrder: 8 },
  ],
  checks: [
    { code: "IDENTITY", isMandatory: true, weight: 20 },
    { code: "ADDRESS", isMandatory: true, weight: 10 },
    { code: "EDUCATION", isMandatory: true, weight: 20 },
    { code: "EMPLOYMENT", isMandatory: true, weight: 15 },
    { code: "EMPLOYMENT_DURATION", isMandatory: true, weight: 10 },
    { code: "DESIGNATION", isMandatory: true, weight: 5 },
    { code: "DOCUMENT_AUTHENTICITY", isMandatory: true, weight: 10 },
    { code: "REFERENCES", isMandatory: false, weight: 5 },
    { code: "CUSTOM", isMandatory: false, weight: 5 },
  ],
} as const;

/**
 * Illustrative, unconfirmed weights (decision D-01). For development, the
 * seeded configuration is marked APPROVED and ACTIVE so scoring works out of
 * the box. Before production use, an administrator should approve a new
 * configuration version with the organisation's final weights and threshold.
 */
export const SCORING_COMPONENT_SEED = [
  { checkTypeCodes: ["IDENTITY"], label: "Identity", weight: "20.00" },
  { checkTypeCodes: ["ADDRESS"], label: "Address", weight: "10.00" },
  { checkTypeCodes: ["EDUCATION"], label: "Education", weight: "20.00" },
  { checkTypeCodes: ["EMPLOYMENT", "EMPLOYMENT_DURATION", "DESIGNATION"], label: "Employment", weight: "30.00" },
  { checkTypeCodes: ["DOCUMENT_AUTHENTICITY"], label: "Document Authenticity", weight: "10.00" },
  { checkTypeCodes: ["REFERENCES", "CUSTOM"], label: "Additional Verification", weight: "10.00" },
] as const;

export const SCORING_MULTIPLIERS: Record<string, number> = {
  VERIFIED: 1,
  PARTIALLY_VERIFIED: 0.5,
  UNABLE_TO_VERIFY: 0,
  DISCREPANCY_FOUND: 0,
  REJECTED: 0,
};

export const SCORING_EXCLUDED_STATUSES = ["WAIVED", "NOT_APPLICABLE"];

/**
 * Placeholder declaration/consent wording. NOT approved legal text — replace
 * with the organisation's approved wording before production use (decision
 * D-02). Stored as data so it can be replaced without a code change.
 */
export const CONSENT_SEED = {
  version: "2026.1-draft",
  title: "Declaration and consent for background verification (DRAFT PLACEHOLDER)",
  body: [
  
      
    "1. I confirm that the information I have provided in this application is true, complete and accurate to the best of my knowledge.",
    "2. I consent to the organisation collecting and verifying the information and documents I have submitted, and to contacting the sources listed in my employment and education history for verification purposes, subject to the organisation's policy.",
    "3. I understand that a record of my background verification will be maintained by the organisation and handled in accordance with its information-handling and retention policy.",
    "4. I understand that a verification result of 'unable to verify' or a discrepancy may result in my application not progressing, and that I may be given an opportunity to clarify the discrepancy.",
    "",
    "Replace this text with the approved wording before production launch (decision D-02).",
  ].join("\n"),
};

export const SYSTEM_CONFIG_SEED = [
  { key: "candidate_id.pattern", value: "^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$", valueType: "STRING", category: "CANDIDATE", description: "Regular expression a Candidate ID must match at signup." },
  { key: "candidate_id.example_format", value: "CIQ-{YEAR}-{SEQ:6}", valueType: "STRING", category: "CANDIDATE", description: "Example rendering only. The year is not hard-coded in validation." },
  { key: "candidate_id.format", value: "CIQ-2026-000001", valueType: "STRING", category: "CANDIDATE", description: "Worked example of the Candidate ID format." },
  { key: "upload.max_file_size_bytes", value: "10485760", valueType: "NUMBER", category: "UPLOAD", description: "Maximum accepted upload size in bytes." },
  { key: "upload.max_versions_per_document", value: "10", valueType: "NUMBER", category: "UPLOAD", description: "Maximum retained versions per document." },
  { key: "upload.allowed_mime_types", value: '["application/pdf","image/jpeg","image/png"]', valueType: "JSON", category: "UPLOAD", description: "Accepted MIME types (validated against file signature as well)." },
  { key: "upload.allowed_extensions", value: '[".pdf",".jpg",".jpeg",".png"]', valueType: "JSON", category: "UPLOAD", description: "Accepted file extensions." },
  { key: "check.criminal_record.enabled", value: "false", valueType: "BOOLEAN", category: "VERIFICATION", description: "Master switch for criminal/court-record checks. Requires organisational confirmation (decision D-04)." },
  { key: "review.allow_self_review", value: "false", valueType: "BOOLEAN", category: "VERIFICATION", description: "When false, a reviewer cannot decide a case whose checks they personally recorded." },
  { key: "disclosure.show_score_to_candidate", value: "false", valueType: "BOOLEAN", category: "DISCLOSURE", description: "When false, candidates see a coarse status only." },
  { key: "disclosure.show_findings_to_candidate", value: "false", valueType: "BOOLEAN", category: "DISCLOSURE", description: "When false, internal verification findings are withheld from candidates." },
  { key: "notification.email.enabled", value: "false", valueType: "BOOLEAN", category: "NOTIFICATION", description: "When false, email notifications are suppressed; in-app notifications still work." },
  { key: "submission.require_consent", value: "true", valueType: "BOOLEAN", category: "SUBMISSION", description: "When true, submission requires acceptance of the current consent version." },
  { key: "retention.documents.months", value: "", valueType: "STRING", category: "RETENTION", description: "Retention period for documents. Deliberately unset — policy decision D-03." },
  { key: "retention.audit.months", value: "", valueType: "STRING", category: "RETENTION", description: "Retention period for audit events. Deliberately unset — policy decision D-03." },
  { key: "support.contact_email", value: "", valueType: "STRING", category: "GENERAL", description: "Address shown to candidates when recovering a duplicate Candidate ID." },
  { key: "email_verification.enabled", value: "true", valueType: "BOOLEAN", category: "AUTHENTICATION", description: "When true, candidates must verify their email before signing in." },
  { key: "email_verification.token_ttl_minutes", value: "1440", valueType: "NUMBER", category: "AUTHENTICATION", description: "How long an email verification token is valid (minutes)." },
  { key: "email_verification.base_url", value: "https://checkiq.org", valueType: "STRING", category: "AUTHENTICATION", description: "Base URL for the verification link." },
  { key: "auth.admin_requires_verification", value: "false", valueType: "BOOLEAN", category: "AUTHENTICATION", description: "When false, admin/staff accounts skip email verification." },
] as const;

export const NOTIFICATION_TEMPLATE_SEED = [
  { event: "ACCOUNT_CREATED", channel: "IN_APP", subject: "Welcome to CheckIQ", body: "Hello {{candidateName}}, your CheckIQ account has been created for Candidate ID {{candidateId}}. Please complete your profile to continue." },
  { event: "DOCUMENTS_REQUIRED", channel: "IN_APP", subject: "Documents required for your background verification", body: "Hello {{candidateName}}, {{caseNumber}} requires {{documentCount}} document(s). Please sign in to upload them." },
  { event: "CASE_SUBMITTED", channel: "IN_APP", subject: "Background verification submitted", body: "Hello {{candidateName}}, we have received your submission for case {{caseNumber}}. You will be notified if anything further is required." },
  { event: "CLARIFICATION_REQUESTED", channel: "IN_APP", subject: "Action required: clarification needed", body: "Hello {{candidateName}}, the verifier for case {{caseNumber}} needs more information: {{issueSummary}}. Required action: {{requiredAction}}" },
  { event: "CLARIFICATION_RESUBMITTED", channel: "IN_APP", subject: "We received your response", body: "Hello {{candidateName}}, your response for case {{caseNumber}} has been recorded and is with the verifier." },
  { event: "BGV_COMPLETED", channel: "IN_APP", subject: "Background verification completed", body: "Hello {{candidateName}}, the background verification for case {{caseNumber}} has been completed." },
  { event: "BGV_OUTCOME", channel: "IN_APP", subject: "Background verification outcome", body: "Hello {{candidateName}}, the outcome for case {{caseNumber}} is now available in your dashboard." },
  { event: "CASE_SUBMITTED", channel: "EMAIL", subject: "Background verification submitted", body: "Hello {{candidateName}}, we have received your submission for case {{caseNumber}}." },
  { event: "CLARIFICATION_REQUESTED", channel: "EMAIL", subject: "Action required: clarification needed for case {{caseNumber}}", body: "Hello {{candidateName}}, the verifier needs more information for case {{caseNumber}}: {{issueSummary}}. Required action: {{requiredAction}}" },
  { event: "BGV_OUTCOME", channel: "EMAIL", subject: "Background verification outcome for case {{caseNumber}}", body: "Hello {{candidateName}}, the outcome for case {{caseNumber}} is available in your CheckIQ dashboard." },
  { event: "CASE_ASSIGNED", channel: "IN_APP", subject: "Case assigned to you", body: "Case {{caseNumber}} for candidate {{candidateName}} has been assigned to you." },
  { event: "REVIEW_REQUIRED", channel: "IN_APP", subject: "Review required for case {{caseNumber}}", body: "Case {{caseNumber}} requires reviewer attention." },
  { event: "DOCUMENT_UPLOADED", channel: "IN_APP", subject: "A document was uploaded for case {{caseNumber}}", body: "A document was uploaded for case {{caseNumber}} by {{candidateName}}." },
  { event: "VERIFICATION_IN_PROGRESS", channel: "IN_APP", subject: "Your background verification has started", body: "Hello {{candidateName}}, the background verification for case {{caseNumber}} is now under way." },
  { event: "SCORE_GENERATED", channel: "IN_APP", subject: "A score has been generated for case {{caseNumber}}", body: "Case {{caseNumber}} has a score of {{score}}. It is waiting for the review decision." },
  { event: "ADMIN_NOTICE", channel: "IN_APP", subject: "Your account was updated", body: "Hello {{candidateName}}, your account for case {{caseNumber}} was updated: {{reason}}." },
] as const;
