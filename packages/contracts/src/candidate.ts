import { z } from "zod";

export const GENDER_VALUES = ["MALE", "FEMALE", "NON_BINARY", "PREFER_NOT_TO_SAY"] as const;
export const genderSchema = z.enum(GENDER_VALUES);

export const addressTypeSchema = z.enum(["CURRENT", "PERMANENT", "OTHER"]);

export const addressSchema = z.object({
  id: z.string().uuid().optional(),
  type: addressTypeSchema,
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(120),
  country: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().max(20).optional().nullable(),
});
export type Address = z.infer<typeof addressSchema>;

export const educationSchema = z.object({
  id: z.string().uuid().optional(),
  qualification: z.string().trim().min(1).max(200),
  institution: z.string().trim().min(1).max(200),
  universityOrBoard: z.string().trim().max(200).optional().nullable(),
  registrationNumber: z.string().trim().max(100).optional().nullable(),
  yearOfPassing: z.coerce.number().int().min(1900).max(new Date().getFullYear() + 1),
  scoreOrPercentage: z.string().trim().max(50).optional().nullable(),
});
export type Education = z.infer<typeof educationSchema>;

export const employmentSchema = z.object({
  id: z.string().uuid().optional(),
  employer: z.string().trim().min(1).max(200),
  designation: z.string().trim().min(1).max(200),
  employeeId: z.string().trim().max(100).optional().nullable(),
  fromDate: z.iso.date(),
  toDate: z.iso.date().optional().nullable(),
  isCurrent: z.boolean(),
  contactName: z.string().trim().max(160).optional().nullable(),
  contactEmail: z.email().max(254).optional().nullable(),
  contactMobile: z.string().trim().max(32).optional().nullable(),
});
export type Employment = z.infer<typeof employmentSchema>;

export const customProfileFieldValueSchema = z.object({
  fieldKey: z.string().trim().min(1).max(80),
  value: z.string().max(4000).optional().nullable(),
});
export type CustomProfileFieldValue = z.infer<typeof customProfileFieldValueSchema>;

export const candidateProfileSchema = z.object({
  candidateId: z.string(),
  fullName: z.string(),
  dateOfBirth: z.iso.date().optional().nullable(),
  gender: genderSchema.optional().nullable(),
  email: z.email(),
  mobile: z.string(),
  pan: z.string().optional().nullable(),
  passportNumber: z.string().optional().nullable(),
  passportExpiry: z.iso.date().optional().nullable(),
  drivingLicenceNumber: z.string().optional().nullable(),
  addresses: z.array(addressSchema),
  education: z.array(educationSchema),
  employments: z.array(employmentSchema),
  customFields: z.array(customProfileFieldValueSchema),
  profileCompleted: z.boolean(),
  updatedAt: z.string(),
});
export type CandidateProfile = z.infer<typeof candidateProfileSchema>;

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(160).optional(),
  dateOfBirth: z.iso.date().optional().nullable(),
  gender: genderSchema.optional().nullable(),
  email: z.email().max(254).optional(),
  mobile: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9\s-]{6,19}$/, { error: "Enter a valid mobile number" })
    .optional(),
  pan: z.string().trim().max(20).optional().nullable(),
  passportNumber: z.string().trim().max(40).optional().nullable(),
  passportExpiry: z.iso.date().optional().nullable(),
  drivingLicenceNumber: z.string().trim().max(40).optional().nullable(),
  addresses: z.array(addressSchema).optional(),
  education: z.array(educationSchema).optional(),
  employments: z.array(employmentSchema).optional(),
  customFields: z.array(customProfileFieldValueSchema).optional(),
});
export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;

/** Shape of a configurable profile field definition (admin managed). */
export const profileFieldDefinitionSchema = z.object({
  key: z.string(),
  label: z.string(),
  section: z.string(),
  dataType: z.enum(["TEXT", "TEXTAREA", "EMAIL", "PHONE", "DATE", "NUMBER", "SELECT", "BOOLEAN"]),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
  displayOrder: z.number().int(),
  appliesTo: z.array(z.string()),
});
export type ProfileFieldDefinition = z.infer<typeof profileFieldDefinitionSchema>;
