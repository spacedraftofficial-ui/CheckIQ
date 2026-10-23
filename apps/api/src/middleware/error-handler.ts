import type { ErrorCode } from "@checkiq/contracts";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { isAppError } from "../lib/errors.js";
import { getLogger } from "../lib/logger.js";

/**
 * Terminal error handler.
 *
 * Converts any thrown value into the shared error envelope. Unexpected errors
 * are logged with their stack but reported to the client as a generic
 * `INTERNAL_ERROR`, so internal messages, SQL fragments and stack traces never
 * reach a client.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  const logger = getLogger();

  if (error instanceof ZodError) {
    res.status(422).json({
      error: {
        code: "VALIDATION_ERROR" satisfies ErrorCode,
        message: "The request payload failed validation.",
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
        requestId: req.requestId,
      },
    });
    return;
  }

  if (isAppError(error)) {
    if (error.status >= 500) {
      logger.error({ err: error, requestId: req.requestId }, "request failed");
    } else {
      logger.warn(
        { code: error.code, status: error.status, requestId: req.requestId },
        error.message,
      );
    }
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.expose ? error.message : "An unexpected error occurred",
        ...(error.details !== undefined ? { details: error.details } : {}),
        requestId: req.requestId,
      },
    });
    return;
  }

  // Body parser failures (malformed JSON, payload too large) carry their own
  // status and type. They are client errors, not internal failures.
  const bodyParserError = error as { type?: string; status?: number; message?: string };
  if (bodyParserError?.type === "entity.parse.failed") {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR" satisfies ErrorCode,
        message: "The request body is not valid JSON.",
        requestId: req.requestId,
      },
    });
    return;
  }
  if (bodyParserError?.type === "entity.too.large") {
    res.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE" satisfies ErrorCode,
        message: "The request body is larger than this endpoint accepts.",
        requestId: req.requestId,
      },
    });
    return;
  }

  logger.error({ err: error, requestId: req.requestId }, "unhandled error");
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR" satisfies ErrorCode,
      message: "An unexpected error occurred",
      requestId: req.requestId,
    },
  });
}

/** 404 handler for unmatched routes. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: "NOT_FOUND" satisfies ErrorCode,
      message: "The requested resource does not exist",
      requestId: req.requestId,
    },
  });
}
