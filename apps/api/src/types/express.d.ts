import type { Permission, UserRole } from "@checkiq/contracts";

/**
 * The authenticated principal attached to every request that passes the
 * authentication middleware.
 */
export interface Principal {
  userId: string;
  email: string;
  fullName: string;
  roles: UserRole[];
  permissions: Set<Permission>;
  /** Candidate profile id, present only for candidate accounts. */
  candidateProfileId: string | null;
  candidateId: string | null;
  sessionId: string | null;
  sessionEpoch: number;
}

declare global {
  namespace Express {
    interface Request {
      principal?: Principal;
      requestId: string;
      ipAddress?: string;
      userAgent?: string;
    }
  }
}

export {};
