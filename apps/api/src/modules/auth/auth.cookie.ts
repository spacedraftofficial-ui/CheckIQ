import type { CookieOptions, Response } from "express";
import { getConfig } from "../../config.js";
import { REFRESH_COOKIE_NAME } from "./auth.service.js";

/**
 * Refresh token cookie handling.
 *
 * The refresh token is delivered as an `httpOnly` cookie so that it is not
 * reachable from JavaScript, and is never written to browser storage. The
 * access token is returned in the response body and kept in memory by the
 * client.
 */
export function refreshCookieOptions(): CookieOptions {
  const config = getConfig();
  return {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: "lax",
    path: "/api/auth",
    domain: config.COOKIE_DOMAIN,
    maxAge: config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions());
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, { ...refreshCookieOptions(), maxAge: undefined });
}
