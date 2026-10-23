import { and, eq, or } from "drizzle-orm";
import { getDatabase, schema } from "../db/client.js";
import { notFound } from "../lib/errors.js";
import type { Principal } from "../types/express.js";

/**
 * Resource scope resolution.
 *
 * Permission answers "may this kind of user do this kind of thing?". Scope
 * answers "may this user do it to *this* record?". Both are required, and
 * scope is always resolved in SQL rather than by filtering in JavaScript.
 */

export interface ScopedCase {
  caseRow: typeof schema.bgvCases.$inferSelect;
  profile: typeof schema.candidateProfiles.$inferSelect;
  scope: "own" | "assigned" | "any";
}

/**
 * Resolves a case the principal is allowed to access.
 *
 * A case outside the principal's scope is reported as `404 Not Found` rather
 * than `403`, so the API does not confirm that the record exists.
 */
export async function resolveCase(
  principal: Principal,
  caseId: string,
  options: { requireAny?: boolean } = {},
): Promise<ScopedCase> {
  const { db } = getDatabase();

  const [caseRow] = await db
    .select()
    .from(schema.bgvCases)
    .where(eq(schema.bgvCases.id, caseId))
    .limit(1);

  if (!caseRow) throw notFound("Case not found");

  const [profile] = await db
    .select()
    .from(schema.candidateProfiles)
    .where(eq(schema.candidateProfiles.id, caseRow.profileId))
    .limit(1);

  if (!profile) throw notFound("Case not found");

  if (options.requireAny) {
    if (!principal.permissions.has("case:read:any" as never)) {
      throw notFound("Case not found");
    }
    return { caseRow, profile, scope: "any" };
  }

  if (principal.permissions.has("case:read:any" as never)) {
    return { caseRow, profile, scope: "any" };
  }

  if (
    principal.candidateProfileId &&
    caseRow.profileId === principal.candidateProfileId &&
    principal.permissions.has("case:read:own" as never)
  ) {
    return { caseRow, profile, scope: "own" };
  }

  if (
    principal.permissions.has("case:read:assigned" as never) &&
    (caseRow.assignedVerifierId === principal.userId || caseRow.assignedReviewerId === principal.userId)
  ) {
    return { caseRow, profile, scope: "assigned" };
  }

  throw notFound("Case not found");
}

/**
 * Builds the SQL predicate that limits a case listing to the principal's
 * scope. Applied directly in the query so that pagination counts and rows
 * always agree.
 */
export function caseScopePredicate(principal: Principal): ReturnType<typeof eq> | undefined {
  if (principal.permissions.has("case:read:any" as never)) return undefined;
  if (principal.candidateProfileId && principal.permissions.has("case:read:own" as never)) {
    return eq(schema.bgvCases.profileId, principal.candidateProfileId);
  }
  if (principal.permissions.has("case:read:assigned" as never)) {
    return or(
      eq(schema.bgvCases.assignedVerifierId, principal.userId),
      eq(schema.bgvCases.assignedReviewerId, principal.userId),
    );
  }
  return eq(schema.bgvCases.id, "00000000-0000-0000-0000-000000000000");
}

/** Resolves the candidate's own case, or the single open case of a profile. */
export async function findCandidateCase(
  principal: Principal,
): Promise<{ caseRow: typeof schema.bgvCases.$inferSelect; profile: typeof schema.candidateProfiles.$inferSelect } | null> {
  if (!principal.candidateProfileId) return null;
  const { db } = getDatabase();
  const [caseRow] = await db
    .select()
    .from(schema.bgvCases)
    .where(eq(schema.bgvCases.profileId, principal.candidateProfileId))
    .orderBy(schema.bgvCases.createdAt)
    .limit(1);
  if (!caseRow) return null;
  const [profile] = await db
    .select()
    .from(schema.candidateProfiles)
    .where(eq(schema.candidateProfiles.id, caseRow.profileId))
    .limit(1);
  if (!profile) return null;
  return { caseRow, profile };
}

/** True when the principal is a staff member (not a candidate). */
export function isStaff(principal: Principal): boolean {
  return principal.roles.some((role) => role !== "CANDIDATE");
}

/** Restricts a query to cases that are still open. */
export function openCaseFilter() {
  return and(
    or(
      eq(schema.bgvCases.status, "SUBMITTED"),
      eq(schema.bgvCases.status, "VERIFICATION_IN_PROGRESS"),
      eq(schema.bgvCases.status, "CLARIFICATION_REQUIRED"),
      eq(schema.bgvCases.status, "BGV_REVIEW_REQUIRED"),
      eq(schema.bgvCases.status, "BGV_SCORE_GENERATED"),
      eq(schema.bgvCases.status, "VERIFICATION_COMPLETED"),
    ),
  );
}
