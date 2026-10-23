import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { getConfig } from "../config.js";
import { getDatabase, schema } from "./client.js";
import { newId } from "../lib/ids.js";
import { getLogger } from "../lib/logger.js";
import { createCaseForProfile } from "../services/case.service.js";
import type { Db } from "./types.js";

/**
 * Creates one local account per role so that every permission set can be
 * exercised during development.
 *
 * This is a **development convenience only**. It creates accounts with a known
 * password, which is exactly what must never happen in a deployed
 * environment. Do not run it against a production database.
 *
 * Usage: `npm run db:seed:local-accounts -w @checkiq/api`
 */

const LOCAL_PASSWORD = "CheckIQ!Local2026";

interface LocalAccount {
  email: string;
  fullName: string;
  roles: string[];
  /** Creates a candidate profile and case as well as the account. */
  candidate?: { candidateId: string; company?: string; department?: string; position?: string };
}

const ACCOUNTS: LocalAccount[] = [
  {
    email: "superadmin@checkiq.local",
    fullName: "Super Administrator",
    roles: ["SUPER_ADMINISTRATOR"],
  },
  {
    email: "verifier@checkiq.local",
    fullName: "BGV Executive",
    roles: ["BGV_EXECUTIVE"],
  },
  {
    email: "reviewer@checkiq.local",
    fullName: "BGV Reviewer",
    roles: ["BGV_REVIEWER"],
  },
  {
    email: "hr@checkiq.local",
    fullName: "HR Recruitment",
    roles: ["HR_RECRUITMENT"],
  },
  {
    email: "candidate@checkiq.local",
    fullName: "Demo Candidate",
    roles: ["CANDIDATE"],
    candidate: {
      candidateId: "CIQ-DEMO-000001",
      company: "Acme Corp",
      department: "Engineering",
      position: "Senior Engineer",
    },
  },
];

async function createAccount(db: Db, account: LocalAccount, passwordHash: string): Promise<string> {
  const emailNormalized = account.email.toLowerCase();

  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.emailNormalized, emailNormalized))
    .limit(1);

  if (existing) {
    await db
      .update(schema.users)
      .set({ passwordHash, isActive: true, mustChangePassword: false })
      .where(eq(schema.users.id, existing.id));

    await db.delete(schema.userRoles).where(eq(schema.userRoles.userId, existing.id));
    await db.insert(schema.userRoles).values(
      account.roles.map((role) => ({ userId: existing.id, roleCode: role, assignedBy: null })),
    );

    if (account.candidate) {
      await ensureCandidateCase(db, existing.id, account);
    }

    return existing.id;
  }

  const userId = newId();
   await db.insert(schema.users).values({
     id: userId,
     email: account.email,
     emailNormalized,
     passwordHash,
     fullName: account.fullName,
     mobile: "+919812345678",
     isEmailVerified: true,
     mustChangePassword: false,
   });

  await db.insert(schema.userRoles).values(
    account.roles.map((role) => ({ userId, roleCode: role, assignedBy: null })),
  );

  if (account.candidate) {
    await ensureCandidateCase(db, userId, account);
  }

  return userId;
}

async function ensureCandidateCase(
  db: Db,
  userId: string,
  account: LocalAccount,
): Promise<void> {
  const candidate = account.candidate!;
  const [profile] = await db
    .select({ id: schema.candidateProfiles.id })
    .from(schema.candidateProfiles)
    .where(eq(schema.candidateProfiles.userId, userId))
    .limit(1);

  if (profile) return;

  const profileId = newId();
  await db.insert(schema.candidateProfiles).values({
    id: profileId,
    userId,
    candidateId: candidate.candidateId,
    fullName: account.fullName,
    email: account.email,
    mobile: "+919812345678",
  });

  await db.transaction(async (tx) => {
    await createCaseForProfile(tx, {
      profileId,
      company: candidate.company ?? null,
      department: candidate.department ?? null,
      position: candidate.position ?? null,
    });
  });
}

async function main(): Promise<void> {
  const logger = getLogger();
  const config = getConfig();
  const { db, pool } = getDatabase();

  if (config.NODE_ENV === "production") {
    throw new Error("Refusing to create local accounts in a production environment.");
  }

  const passwordHash = await hash(LOCAL_PASSWORD);

  for (const account of ACCOUNTS) {
    await createAccount(db, account, passwordHash);
  }

  // The seeded administrator keeps the password from the environment.
  const [admin] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.emailNormalized, config.SEED_ADMIN_EMAIL.toLowerCase()))
    .limit(1);
  if (admin) {
    await db
      .update(schema.users)
      .set({ passwordHash, mustChangePassword: false })
      .where(eq(schema.users.id, admin.id));
  }

  const rows = [
    { email: config.SEED_ADMIN_EMAIL, password: config.SEED_ADMIN_PASSWORD, roles: "Administrator, Super Administrator" },
    ...ACCOUNTS.map((account) => ({
      email: account.email,
      password: LOCAL_PASSWORD,
      roles: account.roles.join(", "),
    })),
  ];

  logger.info("Local accounts ready:");
  for (const row of rows) {
    logger.info({ email: row.email, password: row.password, roles: row.roles }, "account");
  }

  await pool.end();
}

main().catch((error) => {
  getLogger().error({ err: error }, "Local account seeding failed");
  process.exitCode = 1;
});
