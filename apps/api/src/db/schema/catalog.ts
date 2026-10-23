import {
  boolean,
  timestamp,
  index,
  int,
  json,
  mysqlTable,
  primaryKey,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Administrator-managed catalogue: BGV packages, document categories and
 * types, document requirements, verification check definitions and configurable
 * profile fields.
 */

export const bgvPackages = mysqlTable(
  "bgv_packages",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    code: varchar("code", { length: 48 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    /** When true, the final approver must differ from the verifier (four-eyes). */
    requiresMakerChecker: boolean("requires_maker_checker").notNull().default(true),
    /** Weight used when this package's checks map onto a scoring component. */
    scoringConfigId: varchar("scoring_config_id", { length: 36 }),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
  },
  (t) => [uniqueIndex("uq_bgv_packages_code").on(t.code)],
);

/** Which configurable profile fields apply to a package. */
export const bgvPackageProfileFields = mysqlTable(
  "bgv_package_profile_fields",
  {
    packageId: varchar("package_id", { length: 36 })
      .notNull()
      .references(() => bgvPackages.id, { onDelete: "cascade" }),
    fieldKey: varchar("field_key", { length: 80 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.packageId, t.fieldKey] })],
);

export const profileFieldDefinitions = mysqlTable(
  "profile_field_definitions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    fieldKey: varchar("field_key", { length: 80 }).notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    section: varchar("section", { length: 48 }).notNull(),
    dataType: varchar("data_type", { length: 24 }).notNull(),
    isRequired: boolean("is_required").notNull().default(false),
    options: json("options").$type<string[] | null>(),
    /** Optional validation metadata: { minLength, maxLength, pattern, min, max }. */
    validation: json("validation").$type<Record<string, unknown> | null>(),
    displayOrder: int("display_order").notNull().default(0),
    appliesTo: json("applies_to").$type<string[]>(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
  },
  (t) => [uniqueIndex("uq_profile_field_definitions_key").on(t.fieldKey)],
);

export const documentCategories = mysqlTable(
  "document_categories",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    code: varchar("code", { length: 48 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    description: varchar("description", { length: 500 }),
    isActive: boolean("is_active").notNull().default(true),
    displayOrder: int("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_document_categories_code").on(t.code)],
);

export const documentTypes = mysqlTable(
  "document_types",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    categoryId: varchar("category_id", { length: 36 })
      .notNull()
      .references(() => documentCategories.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 48 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    description: varchar("description", { length: 500 }),
    isActive: boolean("is_active").notNull().default(true),
    displayOrder: int("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_document_types_code").on(t.code),
    index("ix_document_types_category").on(t.categoryId),
  ],
);

export const documentRequirements = mysqlTable(
  "document_requirements",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    packageId: varchar("package_id", { length: 36 })
      .notNull()
      .references(() => bgvPackages.id, { onDelete: "cascade" }),
    categoryId: varchar("category_id", { length: 36 })
      .notNull()
      .references(() => documentCategories.id, { onDelete: "restrict" }),
    documentTypeId: varchar("document_type_id", { length: 36 })
      .notNull()
      .references(() => documentTypes.id, { onDelete: "restrict" }),
    label: varchar("label", { length: 160 }).notNull(),
    description: varchar("description", { length: 1000 }),
    isMandatory: boolean("is_mandatory").notNull().default(true),
    maxVersions: int("max_versions").notNull().default(10),
    displayOrder: int("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    index("ix_document_requirements_package").on(t.packageId),
    index("ix_document_requirements_type").on(t.documentTypeId),
  ],
);

export const checkDefinitions = mysqlTable(
  "check_definitions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    code: varchar("code", { length: 48 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    description: varchar("description", { length: 1000 }),
    isMandatoryDefault: boolean("is_mandatory_default").notNull().default(true),
    requiresReviewOnDiscrepancy: boolean("requires_review_on_discrepancy").notNull().default(true),
    /** When false the check cannot be attached to a package (e.g. criminal record). */
    isAvailable: boolean("is_available").notNull().default(true),
    displayOrder: int("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
  },
  (t) => [uniqueIndex("uq_check_definitions_code").on(t.code)],
);

/** Which check definitions a package runs. */
export const bgvPackageChecks = mysqlTable(
  "bgv_package_checks",
  {
    packageId: varchar("package_id", { length: 36 })
      .notNull()
      .references(() => bgvPackages.id, { onDelete: "cascade" }),
    checkDefinitionId: varchar("check_definition_id", { length: 36 })
      .notNull()
      .references(() => checkDefinitions.id, { onDelete: "cascade" }),
    isMandatory: boolean("is_mandatory").notNull().default(true),
    weight: int("weight").notNull().default(0),
    displayOrder: int("display_order").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.packageId, t.checkDefinitionId] })],
);
