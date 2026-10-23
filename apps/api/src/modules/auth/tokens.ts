import { SignJWT, jwtVerify } from "jose";
import { getConfig } from "../../config.js";
import { unauthenticated } from "../../lib/errors.js";

/**
 * Access token issuance and verification.
 *
 * Access tokens are short-lived signed JWTs. They are never written to
 * browser storage — the client keeps them in memory only. Refresh tokens are
 * opaque, rotated and stored server-side as a hash.
 */

const ISSUER = () => getConfig().JWT_ISSUER;
const AUDIENCE = () => getConfig().JWT_AUDIENCE;

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getConfig().JWT_ACCESS_SECRET);
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  fullName: string;
  sessionId: string;
  sessionEpoch: number;
  roles: string[];
}

export async function issueAccessToken(payload: AccessTokenPayload): Promise<string> {
  const config = getConfig();
  return new SignJWT({
    email: payload.email,
    fullName: payload.fullName,
    sid: payload.sessionId,
    epoch: payload.sessionEpoch,
    roles: payload.roles,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.sub)
    .setIssuer(ISSUER())
    .setAudience(AUDIENCE())
    .setIssuedAt()
    .setExpirationTime(`${config.ACCESS_TOKEN_TTL_MINUTES}m`)
    .sign(secretKey());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER(),
      audience: AUDIENCE(),
      algorithms: ["HS256"],
    });
    if (!payload.sub || typeof payload.sid !== "string") throw new Error("Malformed token");
    return {
      sub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : "",
      fullName: typeof payload.fullName === "string" ? payload.fullName : "",
      sessionId: payload.sid,
      sessionEpoch: typeof payload.epoch === "number" ? payload.epoch : 0,
      roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : [],
    };
  } catch {
    throw unauthenticated("Your session is invalid or has expired");
  }
}
