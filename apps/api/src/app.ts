import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { getConfig } from "./config.js";
import { getDatabase } from "./db/client.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { authenticate } from "./middleware/authenticate.js";
import { globalRateLimit } from "./middleware/rate-limit.js";
import { requestContext, requestLogger } from "./middleware/request-context.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { candidateRouter } from "./modules/candidates/candidate.routes.js";
import { casesRouter } from "./modules/cases/cases.routes.js";
import { documentsRouter } from "./modules/documents/documents.routes.js";
import { notificationsRouter } from "./modules/notifications/notifications.routes.js";
import { reportRouter } from "./modules/reports/report.routes.js";
import { reviewRouter } from "./modules/reviews/review.routes.js";
import { scoringRouter } from "./modules/scoring/scoring.routes.js";
import { verificationRouter } from "./modules/verification/verification.routes.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Express application assembly.
 *
 * The order of middleware matters: security headers, CORS, body parsing and
 * request context are established before any route handler runs, and the error
 * handler is registered last.
 */
export function createApp(): Express {
  const config = getConfig();
  const app = express();

  if (config.TRUST_PROXY) app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    helmet({
      // The API serves JSON only; the SPA is served separately.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          fontSrc: ["'self'", "https:", "data:"],
          connectSrc: ["'self'"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: "same-site" },
      referrerPolicy: { policy: "no-referrer" },
      ...(config.NODE_ENV === "production" && {
        strictTransportSecurity: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        },
      }),
    }),
  );

  app.use(
    cors({
      origin: config.CORS_ORIGINS.length > 0 ? config.CORS_ORIGINS : false,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
      exposedHeaders: ["X-Request-Id"],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use(cookieParser());

  app.use(requestContext);
  app.use(requestLogger);
  app.use(globalRateLimit);

  app.get("/api/health", async (_req, res) => {
    try {
      await getDatabase().db.execute("SELECT 1");
      res.status(200).json({ data: { status: "ok", database: "reachable" } });
    } catch {
      res.status(503).json({ data: { status: "degraded", database: "unreachable" } });
    }
  });

  app.use("/api/auth", authRouter);
  app.use("/api", authenticate, candidateRouter);
  app.use("/api", authenticate, documentsRouter);
  app.use("/api", authenticate, casesRouter);
  app.use("/api", authenticate, verificationRouter);
  app.use("/api", authenticate, scoringRouter);
  app.use("/api", authenticate, reviewRouter);
  app.use("/api", authenticate, reportRouter);
  app.use("/api", authenticate, notificationsRouter);
  app.use("/api", authenticate, adminRouter);

  // Serve the frontend SPA in production. The frontend dist is built into
  // apps/web/dist; when the API is built (dist/), it sits one level up.
  const frontendDist = resolve(__dirname, "../../web/dist");
  if (existsSync(frontendDist)) {
    app.use(express.static(frontendDist, { index: false }));
    // All non-API routes serve the SPA entry point.
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(resolve(frontendDist, "index.html"));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
