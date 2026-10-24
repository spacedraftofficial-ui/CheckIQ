import { z } from "zod";

export const GENDER_VALUES = ["MALE", "FEMALE", "NON_BINARY", "PREFER_NOT_TO_SAY"] as const;
export const genderSchema = z.enum(GENDER_VALUES);

export const addressTypeSchema = z.enum(["CURRENT", "PERMANENT", "OTHER"]);

function optionalString(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((val) => (val === "" ? null : val))
    .nullish()
    .optional()
    .nullable();
}

function optionalDate() {
  return z
    .iso
    .date()
    .transform((val) => (val === "" ? null : val))
    .nullish()
    .optional()
    .nullable();
}

export const addressSchema = z.object({
  id: z.string().uuid().optional(),
  type: addressTypeSchema,
  line1: z.string().trim().min(1).max(200),
  line2: optionalString(200),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(120),
  country: z.string().trim().min(1).max(120),
  postalCode: optionalString(20),
});
export type Address = z.infer<typeof addressSchema>;

export const educationSchema = z.object({
  id: z.string().uuid().optional(),
  qualification: z.string().trim().min(1).max(200),
  institution: z.string().trim().min(1).max(200),
  universityOrBoard: optionalString(200),
  registrationNumber: optionalString(100),
  yearOfPassing: z.coerce.number().int().min(1900).max(new Date().getFullYear() + 1),
  scoreOrPercentage: optionalString(50),
});
export type Education = z.infer<typeof educationSchema>;

export const employmentSchema = z.object({
  id: z.string().uuid().optional(),
  employer: z.string().trim().min(1).max(200),
  designation: z.string().trim().min(1).max(200),
  employeeId: optionalString(100),
  fromDate: z.iso.date(),
  toDate: optionalDate(),
  isCurrent: z.boolean(),
  contactName: optionalString(160),
  contactEmail: z
    .string()
    .email()
    .max(254)
    .transform((val) => (val === "" ? null : val))
    .nullish()
    .optional()
    .nullable(),
  contactMobile: optionalString(32),
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
  dateOfBirth: optionalDate(),
  gender: z
    .union([genderSchema, z.literal("")])
    .transform((val) => (val === "" ? null : val))
    .nullish()
    .optional()
    .nullable(),
  email: z.email().max(254).optional(),
  mobile: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9\s-]{6,19}$/, { error: "Enter a valid mobile number" })
    .optional(),
  pan: optionalString(20),
  passportNumber: optionalString(40),
  passportExpiry: optionalDate(),
  drivingLicenceNumber: optionalString(40),
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
