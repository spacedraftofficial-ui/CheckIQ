import type { CandidateProfile, UpdateProfileRequest } from "@checkiq/contracts";
import { eq } from "drizzle-orm";
import { getDatabase, schema } from "../../db/client.js";
import { decryptSensitive, encryptSensitive, maskSensitive } from "../../lib/crypto.js";
import { notFound, validationError } from "../../lib/errors.js";
import { newId } from "../../lib/ids.js";
import { recordAudit } from "../../services/audit.service.js";

/**
 * Candidate profile service.
 *
 * Sensitive identity values (PAN, passport, driving licence, employer contact
 * details) are stored encrypted at rest. They are returned unmasked only to
 * the candidate who owns the profile and to staff holding `profile:read:any`.
 */

export interface ProfileViewer {
  /** True when the viewer is the owner of the profile. */
  isOwner: boolean;
  canReadSensitive: boolean;
}

export async function getCandidateProfile(
  profileId: string,
  viewer: ProfileViewer,
): Promise<CandidateProfile> {
  const { db } = getDatabase();
  const [profile] = await db
    .select()
    .from(schema.candidateProfiles)
    .where(eq(schema.candidateProfiles.id, profileId))
    .limit(1);
  if (!profile) throw notFound("Profile not found");

  const [addresses, education, employments, customFields] = await Promise.all([
    db.select().from(schema.candidateAddresses).where(eq(schema.candidateAddresses.profileId, profileId)),
    db.select().from(schema.candidateEducation).where(eq(schema.candidateEducation.profileId, profileId)),
    db.select().from(schema.candidateEmployments).where(eq(schema.candidateEmployments.profileId, profileId)),
    db.select().from(schema.candidateProfileValues).where(eq(schema.candidateProfileValues.profileId, profileId)),
  ]);

  const canSeeSensitive = viewer.isOwner || viewer.canReadSensitive;
  const dec = (value: string | null) =>
    value ? (canSeeSensitive ? decryptSensitive(value) : maskSensitive(decryptSensitive(value))) : null;

  return {
    candidateId: profile.candidateId,
    fullName: profile.fullName,
    dateOfBirth: profile.dateOfBirth,
    gender: profile.gender as CandidateProfile["gender"],
    email: profile.email,
    mobile: profile.mobile,
    pan: dec(profile.panEncrypted),
    passportNumber: dec(profile.passportNumberEncrypted),
    passportExpiry: profile.passportExpiry,
    drivingLicenceNumber: dec(profile.drivingLicenceNumberEncrypted),
    addresses: addresses.map((address) => ({
      id: address.id,
      type: address.type as "CURRENT" | "PERMANENT" | "OTHER",
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      country: address.country,
      postalCode: address.postalCode,
    })),
    education: education.map((row) => ({
      id: row.id,
      qualification: row.qualification,
      institution: row.institution,
      universityOrBoard: row.universityOrBoard,
      registrationNumber: row.registrationNumber,
      yearOfPassing: row.yearOfPassing,
      scoreOrPercentage: row.scoreOrPercentage,
    })),
    employments: employments.map((row) => ({
      id: row.id,
      employer: row.employer,
      designation: row.designation,
      employeeId: row.employeeId,
      fromDate: row.fromDate,
      toDate: row.toDate,
      isCurrent: row.isCurrent,
      contactName: row.contactName,
      contactEmail: row.contactEmailEncrypted
        ? canSeeSensitive
          ? decryptSensitive(row.contactEmailEncrypted)
          : maskSensitive(decryptSensitive(row.contactEmailEncrypted))
        : null,
      contactMobile: row.contactMobileEncrypted
        ? canSeeSensitive
          ? decryptSensitive(row.contactMobileEncrypted)
          : maskSensitive(decryptSensitive(row.contactMobileEncrypted))
        : null,
    })),
    customFields: customFields.map((row) => ({ fieldKey: row.fieldKey, value: row.valueText })),
    profileCompleted: profile.profileCompleted,
    updatedAt: profile.updatedAt.toISOString(),
  };
}

/**
 * Updates a candidate profile.
 *
 * Repeating groups (addresses, education, employment) are replaced as a set.
 * The previous values are recorded in the audit trail.
 */
export async function updateCandidateProfile(
  profileId: string,
  input: UpdateProfileRequest,
  actor: { userId: string; fullName: string; role: string },
): Promise<CandidateProfile> {
  const { db } = getDatabase();
  const [existing] = await db
    .select()
    .from(schema.candidateProfiles)
    .where(eq(schema.candidateProfiles.id, profileId))
    .limit(1);
  if (!existing) throw notFound("Profile not found");

  if (input.fullName !== undefined && input.fullName.trim().length < 2) {
    throw validationError("Full name must be at least 2 characters");
  }

  const previous = {
    fullName: existing.fullName,
    dateOfBirth: existing.dateOfBirth,
    gender: existing.gender,
    email: existing.email,
    mobile: existing.mobile,
  };

  await db.transaction(async (tx) => {
    const patch: Partial<typeof schema.candidateProfiles.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.fullName !== undefined) patch.fullName = input.fullName.trim();
    if (input.dateOfBirth !== undefined) patch.dateOfBirth = input.dateOfBirth ?? null;
    if (input.gender !== undefined) patch.gender = input.gender ?? null;
    if (input.email !== undefined) patch.email = input.email.trim();
    if (input.mobile !== undefined) patch.mobile = input.mobile.trim();
    if (input.pan !== undefined) patch.panEncrypted = input.pan ? encryptSensitive(input.pan) : null;
    if (input.passportNumber !== undefined) {
      patch.passportNumberEncrypted = input.passportNumber ? encryptSensitive(input.passportNumber) : null;
    }
    if (input.passportExpiry !== undefined) patch.passportExpiry = input.passportExpiry ?? null;
    if (input.drivingLicenceNumber !== undefined) {
      patch.drivingLicenceNumberEncrypted = input.drivingLicenceNumber
        ? encryptSensitive(input.drivingLicenceNumber)
        : null;
    }

    await tx.update(schema.candidateProfiles).set(patch).where(eq(schema.candidateProfiles.id, profileId));

    if (input.addresses) {
      await tx.delete(schema.candidateAddresses).where(eq(schema.candidateAddresses.profileId, profileId));
      if (input.addresses.length > 0) {
        await tx.insert(schema.candidateAddresses).values(
          input.addresses.map((address) => ({
            id: address.id ?? newId(),
            profileId,
            type: address.type,
            line1: address.line1,
            line2: address.line2 ?? null,
            city: address.city,
            state: address.state,
            country: address.country,
            postalCode: address.postalCode ?? null,
          })),
        );
      }
    }

    if (input.education) {
      await tx.delete(schema.candidateEducation).where(eq(schema.candidateEducation.profileId, profileId));
      if (input.education.length > 0) {
        await tx.insert(schema.candidateEducation).values(
          input.education.map((record) => ({
            id: record.id ?? newId(),
            profileId,
            qualification: record.qualification,
            institution: record.institution,
            universityOrBoard: record.universityOrBoard ?? null,
            registrationNumber: record.registrationNumber ?? null,
            yearOfPassing: record.yearOfPassing,
            scoreOrPercentage: record.scoreOrPercentage ?? null,
          })),
        );
      }
    }

    if (input.employments) {
      await tx.delete(schema.candidateEmployments).where(eq(schema.candidateEmployments.profileId, profileId));
      if (input.employments.length > 0) {
        await tx.insert(schema.candidateEmployments).values(
          input.employments.map((record) => ({
            id: record.id ?? newId(),
            profileId,
            employer: record.employer,
            designation: record.designation,
            employeeId: record.employeeId ?? null,
            fromDate: record.fromDate,
            toDate: record.toDate ?? null,
            isCurrent: record.isCurrent,
            contactName: record.contactName ?? null,
            contactEmailEncrypted: record.contactEmail ? encryptSensitive(record.contactEmail) : null,
            contactMobileEncrypted: record.contactMobile ? encryptSensitive(record.contactMobile) : null,
          })),
        );
      }
    }

    if (input.customFields) {
      for (const field of input.customFields) {
        await tx
          .insert(schema.candidateProfileValues)
          .values({
            id: newId(),
            profileId,
            fieldKey: field.fieldKey,
            valueText: field.value ?? null,
          })
          .onDuplicateKeyUpdate({ set: { valueText: field.value ?? null } });
      }
    }

    await recordAudit(
      {
        action: "PROFILE_UPDATED",
        actorId: actor.userId,
        actorName: actor.fullName,
        actorRole: actor.role,
        entityType: "candidate_profile",
        entityId: profileId,
        candidateId: existing.candidateId,
        previousValue: previous,
        newValue: {
          fullName: patch.fullName ?? previous.fullName,
          dateOfBirth: patch.dateOfBirth ?? previous.dateOfBirth,
          gender: patch.gender ?? previous.gender,
          email: patch.email ?? previous.email,
          mobile: patch.mobile ?? previous.mobile,
          addressesUpdated: Boolean(input.addresses),
          educationUpdated: Boolean(input.education),
          employmentsUpdated: Boolean(input.employments),
        },
      },
      tx,
    );
  });

  return getCandidateProfile(profileId, { isOwner: actor.role === "CANDIDATE", canReadSensitive: true });
}

/**
 * Evaluates which of a package's required profile fields are satisfied.
 * Returns the field keys that are still missing.
 */
export async function collectMissingProfileFields(
  profileId: string,
  packageId: string,
): Promise<string[]> {
  const { db } = getDatabase();
  const [profile] = await db
    .select()
    .from(schema.candidateProfiles)
    .where(eq(schema.candidateProfiles.id, profileId))
    .limit(1);
  if (!profile) return [];

  const requiredFields = await db
    .select({ fieldKey: schema.bgvPackageProfileFields.fieldKey })
    .from(schema.bgvPackageProfileFields)
    .where(eq(schema.bgvPackageProfileFields.packageId, packageId));
  const required = new Set(requiredFields.map((row) => row.fieldKey));

  const [addresses, education, employments] = await Promise.all([
    db.select().from(schema.candidateAddresses).where(eq(schema.candidateAddresses.profileId, profileId)),
    db.select().from(schema.candidateEducation).where(eq(schema.candidateEducation.profileId, profileId)),
    db.select().from(schema.candidateEmployments).where(eq(schema.candidateEmployments.profileId, profileId)),
  ]);

  const satisfied = new Set<string>();
  if (profile.fullName) satisfied.add("fullName");
  if (profile.dateOfBirth) satisfied.add("dateOfBirth");
  if (profile.gender) satisfied.add("gender");
  if (profile.email) satisfied.add("email");
  if (profile.mobile) satisfied.add("mobile");
  if (addresses.some((address) => address.type === "CURRENT")) satisfied.add("currentAddress");
  if (addresses.some((address) => address.type === "PERMANENT")) satisfied.add("permanentAddress");
  if (education.length > 0) satisfied.add("education");
  if (employments.length > 0) satisfied.add("employment");
  if (profile.panEncrypted) satisfied.add("pan");
  if (profile.passportNumberEncrypted) satisfied.add("passportNumber");
  if (profile.drivingLicenceNumberEncrypted) satisfied.add("drivingLicenceNumber");

  return [...required].filter((field) => !satisfied.has(field));
}

/**
 * Recomputes whether the profile satisfies the required fields of the
 * candidate's package.
 */
export async function recomputeProfileCompletion(profileId: string, packageId: string): Promise<boolean> {
  const missing = await collectMissingProfileFields(profileId, packageId);
  const completed = missing.length === 0;
  const { db } = getDatabase();
  await db
    .update(schema.candidateProfiles)
    .set({ profileCompleted: completed })
    .where(eq(schema.candidateProfiles.id, profileId));
  return completed;
}
