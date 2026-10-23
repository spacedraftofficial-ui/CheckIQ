import { hash } from "@node-rs/argon2";
import { PERMISSIONS } from "@checkiq/contracts";
import { eq, sql } from "drizzle-orm";
import { getConfig } from "../config.js";
import { schema } from "./client.js";
import type { Db } from "./types.js";
import { getLogger } from "../lib/logger.js";
import { ROLE_DEFINITIONS, validateRoleDefinitions } from "../modules/auth/default-roles.js";
import {
  CHECK_DEFINITION_SEED,
  CONSENT_SEED,
  DOCUMENT_CATEGORY_SEED,
  DOCUMENT_TYPE_SEED,
  NOTIFICATION_TEMPLATE_SEED,
  PROFILE_FIELD_SEED,
  SCORING_COMPONENT_SEED,
  SCORING_EXCLUDED_STATUSES,
  SCORING_MULTIPLIERS,
  STANDARD_PACKAGE_SEED,
  SYSTEM_CONFIG_SEED,
} from "./seed-data.js";

const uuid = (): string => crypto.randomUUID();

/**
 * Idempotent seed. Running it repeatedly does not duplicate rows.
 */
export async function runSeed(db: Db): Promise<void> {
  const logger = getLogger();
  const config = getConfig();

  const problems = validateRoleDefinitions();
  if (problems.length > 0) {
    throw new Error(`Invalid role definitions:\n${problems.join("\n")}`);
  }

  // ---- permissions -------------------------------------------------------
  await db
    .insert(schema.permissions)
    .values(
      PERMISSIONS.map((code) => ({
        id: uuid(),
        code,
        description: code,
        category: code.split(":")[0] ?? "general",
      })),
    )
    .onDuplicateKeyUpdate({ set: { description: sql`${schema.permissions.code}` } });
  logger.info({ count: PERMISSIONS.length }, "Permissions seeded");

  // ---- roles and role -> permission mapping ------------------------------
  for (const [code, definition] of Object.entries(ROLE_DEFINITIONS)) {
    await db
      .insert(schema.roles)
      .values({
        code,
        name: definition.name,
        description: definition.description,
        isSystem: true,
      })
      .onDuplicateKeyUpdate({
        set: { name: definition.name, description: definition.description },
      });

    for (const permission of definition.permissions) {
      await db
        .insert(schema.rolePermissions)
        .values({ roleCode: code, permissionCode: permission })
        .onDuplicateKeyUpdate({ set: { permissionCode: permission } });
    }
  }
  logger.info({ count: Object.keys(ROLE_DEFINITIONS).length }, "Roles seeded");

  // ---- document categories and types -------------------------------------
  const categoryIds = new Map<string, string>();
  for (const category of DOCUMENT_CATEGORY_SEED) {
    const id = uuid();
    categoryIds.set(category.code, id);
    await db
      .insert(schema.documentCategories)
      .values({
        id,
        code: category.code,
        name: category.name,
        displayOrder: category.displayOrder,
      })
      .onDuplicateKeyUpdate({ set: { name: category.name, displayOrder: category.displayOrder } });
  }
  // Resolve category ids for existing rows too.
  const existingCategories = await db.select().from(schema.documentCategories);
  for (const category of existingCategories) categoryIds.set(category.code, category.id);

  const typeIds = new Map<string, string>();
  for (const type of DOCUMENT_TYPE_SEED) {
    const id = uuid();
    typeIds.set(type.code, id);
    await db
      .insert(schema.documentTypes)
      .values({
        id,
        categoryId: categoryIds.get(type.categoryCode)!,
        code: type.code,
        name: type.name,
        displayOrder: type.displayOrder,
      })
      .onDuplicateKeyUpdate({ set: { name: type.name, displayOrder: type.displayOrder } });
  }
  const existingTypes = await db.select().from(schema.documentTypes);
  for (const type of existingTypes) typeIds.set(type.code, type.id);
  logger.info({ categories: categoryIds.size, types: typeIds.size }, "Document catalogue seeded");

  // ---- check definitions -------------------------------------------------
  const checkIds = new Map<string, string>();
  for (const check of CHECK_DEFINITION_SEED) {
    const id = uuid();
    checkIds.set(check.code, id);
    await db
      .insert(schema.checkDefinitions)
      .values({
        id,
        code: check.code,
        name: check.name,
        description: check.description,
        isMandatoryDefault: check.isMandatoryDefault,
        requiresReviewOnDiscrepancy: check.requiresReviewOnDiscrepancy,
        isAvailable: check.isAvailable,
        displayOrder: check.displayOrder,
      })
      .onDuplicateKeyUpdate({
        set: {
          name: check.name,
          description: check.description,
          isMandatoryDefault: check.isMandatoryDefault,
          requiresReviewOnDiscrepancy: check.requiresReviewOnDiscrepancy,
          isAvailable: check.isAvailable,
          displayOrder: check.displayOrder,
        },
      });
  }
  const existingChecks = await db.select().from(schema.checkDefinitions);
  for (const check of existingChecks) checkIds.set(check.code, check.id);
  logger.info({ count: checkIds.size }, "Check definitions seeded");

  // ---- profile field definitions ----------------------------------------
  for (const field of PROFILE_FIELD_SEED) {
    await db
      .insert(schema.profileFieldDefinitions)
      .values({
        id: uuid(),
        fieldKey: field.fieldKey,
        label: field.label,
        section: field.section,
        dataType: field.dataType,
        isRequired: field.required,
        options: "options" in field ? [...field.options] : null,
        displayOrder: field.displayOrder,
        appliesTo: ["CANDIDATE"],
      })
      .onDuplicateKeyUpdate({
        set: {
          label: field.label,
          section: field.section,
          dataType: field.dataType,
          isRequired: field.required,
          displayOrder: field.displayOrder,
        },
      });
  }
  logger.info({ count: PROFILE_FIELD_SEED.length }, "Profile field definitions seeded");

  // ---- BGV package -------------------------------------------------------
  const packageId = uuid();
  await db
    .insert(schema.bgvPackages)
    .values({
      id: packageId,
      code: STANDARD_PACKAGE_SEED.code,
      name: STANDARD_PACKAGE_SEED.name,
      description: STANDARD_PACKAGE_SEED.description,
      requiresMakerChecker: STANDARD_PACKAGE_SEED.requiresMakerChecker,
    })
    .onDuplicateKeyUpdate({
      set: {
        name: STANDARD_PACKAGE_SEED.name,
        description: STANDARD_PACKAGE_SEED.description,
        requiresMakerChecker: STANDARD_PACKAGE_SEED.requiresMakerChecker,
      },
    });
  const [storedPackage] = await db
    .select()
    .from(schema.bgvPackages)
    .where(eq(schema.bgvPackages.code, STANDARD_PACKAGE_SEED.code))
    .limit(1);
  const resolvedPackageId = storedPackage?.id ?? packageId;

  for (const fieldKey of STANDARD_PACKAGE_SEED.profileFields) {
    await db
      .insert(schema.bgvPackageProfileFields)
      .values({ packageId: resolvedPackageId, fieldKey })
      .onDuplicateKeyUpdate({ set: { fieldKey } });
  }

  for (const requirement of STANDARD_PACKAGE_SEED.requirements) {
    const id = uuid();
    await db
      .insert(schema.documentRequirements)
      .values({
        id,
        packageId: resolvedPackageId,
        categoryId: categoryIds.get(requirement.categoryCode)!,
        documentTypeId: typeIds.get(requirement.documentTypeCode)!,
        label: requirement.label,
        isMandatory: requirement.isMandatory,
        displayOrder: requirement.displayOrder,
      })
      .onDuplicateKeyUpdate({
        set: {
          label: requirement.label,
          isMandatory: requirement.isMandatory,
          displayOrder: requirement.displayOrder,
        },
      });
  }

  for (const check of STANDARD_PACKAGE_SEED.checks) {
    await db
      .insert(schema.bgvPackageChecks)
      .values({
        packageId: resolvedPackageId,
        checkDefinitionId: checkIds.get(check.code)!,
        isMandatory: check.isMandatory,
        weight: check.weight,
      })
      .onDuplicateKeyUpdate({
        set: { isMandatory: check.isMandatory, weight: check.weight },
      });
  }
  logger.info({ code: STANDARD_PACKAGE_SEED.code }, "BGV package seeded");

  // ---- scoring configuration (DRAFT, unapproved) -------------------------
  const scoringConfigId = uuid();
  await db
    .insert(schema.scoringConfigurations)
    .values({
      id: scoringConfigId,
      version: 1,
      name: "Standard scoring (ILLUSTRATIVE — pending approval)",
      threshold: "95.00",
      allowProvisional: false,
      status: "DRAFT",
      isApproved: false,
      notes:
        "Weights are the illustrative figures from the development plan and are NOT an approved policy. See decision D-01.",
    })
    .onDuplicateKeyUpdate({ set: { name: "Standard scoring (ILLUSTRATIVE — pending approval)" } });

  const [storedScoring] = await db
    .select()
    .from(schema.scoringConfigurations)
    .where(eq(schema.scoringConfigurations.version, 1))
    .limit(1);
  const resolvedScoringId = storedScoring?.id ?? scoringConfigId;

  const existingComponents = await db
    .select()
    .from(schema.scoringConfigComponents)
    .where(eq(schema.scoringConfigComponents.scoringConfigId, resolvedScoringId));
  for (const component of SCORING_COMPONENT_SEED) {
    const already = existingComponents.find((c) => c.label === component.label);
    if (already) {
      await db
        .update(schema.scoringConfigComponents)
        .set({
          checkTypeCodes: [...component.checkTypeCodes],
          weight: component.weight,
          outcomeMultipliers: SCORING_MULTIPLIERS,
          excludedStatuses: [...SCORING_EXCLUDED_STATUSES],
        })
        .where(eq(schema.scoringConfigComponents.id, already.id));
      continue;
    }
    await db.insert(schema.scoringConfigComponents).values({
      id: uuid(),
      scoringConfigId: resolvedScoringId,
      checkTypeCodes: [...component.checkTypeCodes],
      label: component.label,
      weight: component.weight,
      outcomeMultipliers: SCORING_MULTIPLIERS,
      excludedStatuses: [...SCORING_EXCLUDED_STATUSES],
    });
  }
  logger.info("Scoring configuration seeded (DRAFT, unapproved — decision D-01)");

  // ---- consent version ---------------------------------------------------
  await db
    .insert(schema.consentVersions)
    .values({
      id: uuid(),
      version: CONSENT_SEED.version,
      title: CONSENT_SEED.title,
      body: CONSENT_SEED.body,
      isActive: true,
    })
    .onDuplicateKeyUpdate({ set: { title: CONSENT_SEED.title, body: CONSENT_SEED.body } });
  logger.info("Consent version seeded (placeholder wording — decision D-02)");

  // ---- notification templates -------------------------------------------
  for (const template of NOTIFICATION_TEMPLATE_SEED) {
    await db
      .insert(schema.notificationTemplates)
      .values({
        id: uuid(),
        event: template.event,
        channel: template.channel,
        name: `${template.event} (${template.channel})`,
        subjectTemplate: template.subject,
        bodyTemplate: template.body,
        isActive: true,
      })
      .onDuplicateKeyUpdate({
        set: {
          subjectTemplate: template.subject,
          bodyTemplate: template.body,
          isActive: true,
        },
      });
  }
  logger.info({ count: NOTIFICATION_TEMPLATE_SEED.length }, "Notification templates seeded");

  // ---- system configuration ----------------------------------------------
  for (const entry of SYSTEM_CONFIG_SEED) {
    await db
      .insert(schema.systemConfig)
      .values({
        key: entry.key,
        value: entry.value,
        valueType: entry.valueType,
        category: entry.category,
        description: entry.description,
      })
      .onDuplicateKeyUpdate({ set: { valueType: entry.valueType, category: entry.category } });
  }
  logger.info({ count: SYSTEM_CONFIG_SEED.length }, "System configuration seeded");

  // ---- development administrator -----------------------------------------
  const [existingAdmin] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.emailNormalized, config.SEED_ADMIN_EMAIL.toLowerCase()))
    .limit(1);

  if (!existingAdmin) {
    const adminId = uuid();
    const passwordHash = await hash(config.SEED_ADMIN_PASSWORD, {
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    await db.insert(schema.users).values({
      id: adminId,
      email: config.SEED_ADMIN_EMAIL,
      emailNormalized: config.SEED_ADMIN_EMAIL.toLowerCase(),
      passwordHash,
      fullName: config.SEED_ADMIN_NAME,
      mobile: "+00000000000",
      isEmailVerified: true,
      mustChangePassword: true,
    });
    await db.insert(schema.userRoles).values([
      { userId: adminId, roleCode: "ADMINISTRATOR" },
      { userId: adminId, roleCode: "SUPER_ADMINISTRATOR" },
    ]);
    logger.info(
      { email: config.SEED_ADMIN_EMAIL },
      "Development administrator created — change the password before any shared use",
    );
  } else {
    logger.info({ email: config.SEED_ADMIN_EMAIL }, "Development administrator already exists");
  }
  logger.info("Seed completed");
}
