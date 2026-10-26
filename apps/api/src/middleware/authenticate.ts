import { and, eq, inArray, isNull } from "drizzle-orm";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { getDatabase, schema } from "../db/client.js";
import { forbidden, unauthenticated } from "../lib/errors.js";
import { verifyAccessToken } from "../modules/auth/tokens.js";

/**
 * Authentication middleware.
 *
 * Populates `req.principal` from the bearer token. The user record is re-read
 * on every request so that deactivating an account or changing its roles takes
 * effect immediately — including for access tokens that have not yet expired.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      throw unauthenticated();
    }
    const token = header.slice("Bearer ".length).trim();
    const payload = await verifyAccessToken(token);

    const { db } = getDatabase();
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, payload.sub))
      .limit(1);

    if (!user || !user.isActive || user.deletedAt) {
      throw unauthenticated("Your account is not active");
    }
    if (user.sessionEpoch !== payload.sessionEpoch) {
      throw unauthenticated("Your session has been revoked");
    }

    const roleRows = await db
      .select({ code: schema.userRoles.roleCode })
      .from(schema.userRoles)
      .where(
        and(
          eq(schema.userRoles.userId, user.id),
          isNull(schema.userRoles.revokedAt),
        ),
      );

    const roles = roleRows.map((row) => row.code);

    const permissions = new Set<string>();
    if (roles.length > 0) {
      const allPermissions = await db
        .select({ code: schema.rolePermissions.permissionCode })
        .from(schema.rolePermissions)
        .where(inArray(schema.rolePermissions.roleCode, roles));
      for (const row of allPermissions) permissions.add(row.code);
    }

    const [profile] = await db
      .select({
        id: schema.candidateProfiles.id,
        candidateId: schema.candidateProfiles.candidateId,
      })
      .from(schema.candidateProfiles)
      .where(eq(schema.candidateProfiles.userId, user.id))
      .limit(1);

    req.principal = {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      roles: roles as never[],
      permissions: permissions as never,
      candidateProfileId: profile?.id ?? null,
      candidateId: profile?.candidateId ?? null,
      sessionId: payload.sessionId,
      sessionEpoch: payload.sessionEpoch,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Requires the principal to hold at least one of the listed permissions.
 * An administrator-style bypass is never applied here — authorisation is
 * decided purely by the permissions granted to the principal.
 */
export function requirePermission(...required: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const principal = req.principal;
    if (!principal) {
      next(unauthenticated());
      return;
    }
    const granted = required.some((permission) => principal.permissions.has(permission as never));
    if (!granted) {
      next(forbidden());
      return;
    }
    next();
  };
}

/** Requires the principal to hold at least one of the listed roles. */
export function requireRole(...roles: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const principal = req.principal;
    if (!principal) {
      next(unauthenticated());
      return;
    }
    if (!roles.some((role) => principal.roles.includes(role as never))) {
      next(forbidden());
      return;
    }
    next();
  };
}

/** Requires an authenticated principal. */
export const requirePrincipal: RequestHandler = (req, _res, next) => {
  if (!req.principal) {
    next(unauthenticated());
    return;
  }
  next();
};
