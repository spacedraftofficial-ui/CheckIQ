import rateLimit, { ipKeyGenerator, type RateLimitRequestHandler } from "express-rate-limit";
import { getConfig } from "../config.js";
import { getLogger } from "../lib/logger.js";

/**
 * Rate limiting.
 *
 * Authentication and signup endpoints get their own, stricter limits because
 * they are the primary credential-stuffing and account-enumeration targets.
 */

function build(options: { 
  windowMinutes: number;
  max: number;
  message: string;
  keyGenerator?: (req: Parameters<RateLimitRequestHandler>[0]) => string;
}): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMinutes * 60 * 1000,
    limit: options.max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: options.keyGenerator,
    handler: (req, res) => {
      getLogger().warn(
        { requestId: req.requestId, ip: req.ipAddress },
        "rate limit exceeded",
      );
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: options.message,
          requestId: req.requestId,
        },
      });
    },
  });
}

/** Broad limit applied to the whole API surface. */
export const globalRateLimit = build({
  windowMinutes: getConfig().RATE_LIMIT_WINDOW_MINUTES,
  max: getConfig().RATE_LIMIT_MAX_REQUESTS,
  message: "Too many requests. Please slow down and try again shortly.",
});

/** Login attempts, limited per identifier and IP together. */
export const authRateLimit = build({
  windowMinutes: getConfig().RATE_LIMIT_WINDOW_MINUTES,
  max: getConfig().AUTH_RATE_LIMIT_MAX_ATTEMPTS,
  message: "Too many sign-in attempts. Please wait before trying again.",
  keyGenerator: (req) => {
    const body = req.body as { identifier?: string } | undefined;
    const identifier = body?.identifier?.toLowerCase().trim().slice(0, 120) ?? "unknown";
    return `${ipKeyGenerator(req.ip ?? "")}:${identifier}`;
  },
});

/** Signup attempts, limited per IP. */
export const signupRateLimit = build({
  windowMinutes: 60,
  max: getConfig().SIGNUP_RATE_LIMIT_MAX_ATTEMPTS,
  message: "Too many signup attempts from this address. Please try again later.",
});

/** Uploads are limited per user to bound storage consumption. */
export const uploadRateLimit = build({
  windowMinutes: 60,
  max: 120,
  message: "Too many uploads. Please try again later.",
  keyGenerator: (req) => req.principal?.userId ?? ipKeyGenerator(req.ip ?? ""),
});
