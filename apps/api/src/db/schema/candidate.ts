import {
  boolean,
  date,
  timestamp,
  index,
  int,
  mysqlTable,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { users } from "./identity.js";

/**
 * Candidate identity and profile data.
 *
 * `candidate_profiles.candidate_id` is the organisation's Candidate ID. It is
 * globally unique: a duplicate signup is rejected rather than merged.
 */

export const candidateProfiles = mysqlTable(
  "candidate_profiles",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The Candidate ID entered by the candidate at signup. */
    candidateId: varchar("candidate_id", { length: 64 }).notNull(),
    fullName: varchar("full_name", { length: 160 }).notNull(),
    dateOfBirth: date("date_of_birth", { mode: "string" }),
    gender: varchar("gender", { length: 32 }),
    email: varchar("email", { length: 254 }).notNull(),
    mobile: varchar("mobile", { length: 32 }).notNull(),
    /** Encrypted at rest (AES-256-GCM). Never returned unmasked without permission. */
    panEncrypted: varchar("pan_encrypted", { length: 512 }),
    passportNumberEncrypted: varchar("passport_number_encrypted", { length: 512 }),
    passportExpiry: date("passport_expiry", { mode: "string" }),
    drivingLicenceNumberEncrypted: varchar("driving_licence_number_encrypted", { length: 512 }),
    profileCompleted: boolean("profile_completed").notNull().default(false),
    lastProfileChangeAt: timestamp("last_profile_change_at", { mode: "date", fsp: 3 }),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    uniqueIndex("uq_candidate_profiles_user").on(t.userId),
    uniqueIndex("uq_candidate_profiles_candidate_id").on(t.candidateId),
    index("ix_candidate_profiles_name").on(t.fullName),
  ],
);

export const candidateAddresses = mysqlTable(
  "candidate_addresses",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    profileId: varchar("profile_id", { length: 36 })
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 16 }).notNull(),
    line1: varchar("line1", { length: 200 }).notNull(),
    line2: varchar("line2", { length: 200 }),
    city: varchar("city", { length: 120 }).notNull(),
    state: varchar("state", { length: 120 }).notNull(),
    country: varchar("country", { length: 120 }).notNull(),
    postalCode: varchar("postal_code", { length: 20 }),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("ix_candidate_addresses_profile").on(t.profileId)],
);

export const candidateEducation = mysqlTable(
  "candidate_education",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    profileId: varchar("profile_id", { length: 36 })
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    qualification: varchar("qualification", { length: 200 }).notNull(),
    institution: varchar("institution", { length: 200 }).notNull(),
    universityOrBoard: varchar("university_or_board", { length: 200 }),
    registrationNumber: varchar("registration_number", { length: 100 }),
    yearOfPassing: int("year_of_passing").notNull(),
    scoreOrPercentage: varchar("score_or_percentage", { length: 50 }),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("ix_candidate_education_profile").on(t.profileId)],
);

export const candidateEmployments = mysqlTable(
  "candidate_employments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    profileId: varchar("profile_id", { length: 36 })
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    employer: varchar("employer", { length: 200 }).notNull(),
    designation: varchar("designation", { length: 200 }).notNull(),
    employeeId: varchar("employee_id", { length: 100 }),
    fromDate: date("from_date", { mode: "string" }).notNull(),
    toDate: date("to_date", { mode: "string" }),
    isCurrent: boolean("is_current").notNull().default(false),
    contactName: varchar("contact_name", { length: 160 }),
    contactEmailEncrypted: varchar("contact_email_encrypted", { length: 512 }),
    contactMobileEncrypted: varchar("contact_mobile_encrypted", { length: 512 }),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("ix_candidate_employments_profile").on(t.profileId)],
);

/** Values for administrator-defined profile fields that have no dedicated column. */
export const candidateProfileValues = mysqlTable(
  "candidate_profile_values",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    profileId: varchar("profile_id", { length: 36 })
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    fieldKey: varchar("field_key", { length: 80 }).notNull(),
    valueText: varchar("value_text", { length: 4000 }),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    uniqueIndex("uq_candidate_profile_values_key").on(t.profileId, t.fieldKey),
    index("ix_candidate_profile_values_profile").on(t.profileId),
  ],
);
