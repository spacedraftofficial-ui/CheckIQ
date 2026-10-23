import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { getLogger } from "../lib/logger.js";

/**
 * Attaches a request id and the client address to every request, so that
 * logs, audit events and error responses can be correlated.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("x-request-id");
  req.requestId = incoming && incoming.length <= 64 ? incoming : randomUUID();
  req.ipAddress = req.ip;
  req.userAgent = req.header("user-agent")?.slice(0, 300);
  res.setHeader("x-request-id", req.requestId);
  next();
}

/**
 * Logs the completion of each request. Sensitive values are never logged —
 * only the method, path, status and duration.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const logger = getLogger();
  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.info(
      {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl.split("?")[0],
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        userId: req.principal?.userId,
      },
      "request completed",
    );
  });
  next();
}
