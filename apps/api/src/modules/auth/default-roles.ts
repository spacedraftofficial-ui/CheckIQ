import { PERMISSIONS, USER_ROLES, type Permission, type UserRole } from "@checkiq/contracts";

/**
 * Canonical default role → permission mapping.
 *
 * This is the least-privilege baseline described in
 * `docs/03-roles-and-permissions.md`. It is applied by the seed script and is
 * the reference when an administrator reviews role changes in the UI.
 *
 * Roles never imply other roles. A super administrator is not implicitly an
 * administrator; the explicit list below is the complete set.
 */

const ALL = new Set<Permission>(PERMISSIONS);

export const ROLE_DEFINITIONS: Record<UserRole, { name: string; description: string; permissions: Permission[] }> = {
  CANDIDATE: {
    name: "Candidate",
    description: "Own profile, documents, clarifications and case status.",
    permissions: [
      "case:read:own",
      "clarification:respond:own",
      "notification:read:own",
      "profile:write:own",
      "audit:read:own",
    ],
  },
  BGV_EXECUTIVE: {
    name: "BGV Executive",
    description: "Performs assigned verification checks and raises clarifications.",
    permissions: [
      "case:read:assigned",
      "case:list:queue",
      "verification:record",
      "verification:read",
      "clarification:create",
      "clarification:close",
      "score:read",
      "report:read",
      "notification:read:own",
      "profile:read:any",
      "employment:read:any",
    ],
  },
  BGV_REVIEWER: {
    name: "BGV Reviewer / Manager",
    description: "Reviews material findings, records maker-checker decisions and approves outcomes.",
    permissions: [
      "case:read:assigned",
      "case:read:any",
      "case:assign",
      "case:list:queue",
      "verification:record",
      "verification:read",
      "clarification:create",
      "clarification:close",
      "review:read",
      "review:decide",
      "approval:decide",
      "score:read",
      "score:generate",
      "report:read",
      "report:generate",
      "notification:read:own",
      "profile:read:any",
      "employment:read:any",
    ],
  },
  HR_RECRUITMENT: {
    name: "HR / Recruitment",
    description: "Creates cases and views authorised recruitment-level outcomes.",
    permissions: [
      "case:read:any",
      "case:create",
      "case:assign",
      "case:list:queue",
      "approval:decide",
      "score:read",
      "report:read",
      "report:generate",
      "notification:read:own",
      "profile:read:any",
      "employment:read:any",
    ],
  },
  ADMINISTRATOR: {
    name: "Administrator",
    description: "Manages users, categories, packages, configuration and scoring rules.",
    permissions: [
      "case:read:assigned",
      "case:read:any",
      "case:assign",
      "case:list:queue",
      "verification:read",
      "review:read",
      "score:read",
      "score:generate",
      "score:adjust",
      "report:read",
      "report:generate",
      "notification:read:own",
      "notification:manage",
      "user:manage",
      "config:read",
      "config:manage",
      "package:manage",
      "documentcategory:manage",
      "profile:read:any",
      "employment:read:any",
      "audit:read",
    ],
  },
  SUPER_ADMINISTRATOR: {
    name: "Super Administrator",
    description: "System governance, role and permission management, privileged overrides.",
    permissions: [
      "case:read:own",
      "case:read:assigned",
      "case:read:any",
      "case:create",
      "case:assign",
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
    ],
  },
};

/** Guard against a typo silently granting or withholding a permission. */
export function validateRoleDefinitions(): string[] {
  const problems: string[] = [];
  for (const role of USER_ROLES) {
    const definition = ROLE_DEFINITIONS[role];
    if (!definition) {
      problems.push(`Missing definition for role ${role}`);
      continue;
    }
    for (const permission of definition.permissions) {
      if (!ALL.has(permission)) {
        problems.push(`Role ${role} references unknown permission ${permission}`);
      }
    }
  }
  return problems;
}
