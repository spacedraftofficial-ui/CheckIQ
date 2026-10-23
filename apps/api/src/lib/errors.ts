import type { ErrorCode } from "@checkiq/contracts";

/**
 * Application error taxonomy.
 *
 * Every error that reaches the client is an `AppError`. Unexpected errors are
 * converted to a generic `INTERNAL_ERROR` so internal stack traces and driver
 * messages never leak.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    options: { details?: unknown; expose?: boolean; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = options.details;
    this.expose = options.expose ?? true;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, "VALIDATION_ERROR", message, { details });

export const validationError = (message: string, details?: unknown) =>
  new AppError(422, "VALIDATION_ERROR", message, { details });

export const unauthenticated = (message = "Authentication required") =>
  new AppError(401, "UNAUTHENTICATED", message);

export const forbidden = (message = "You do not have access to this resource") =>
  new AppError(403, "FORBIDDEN", message);

export const notFound = (message = "Resource not found") =>
  new AppError(404, "NOT_FOUND", message);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, "CONFLICT", message, { details });

export const candidateIdInUse = (message: string, details?: unknown) =>
  new AppError(409, "CANDIDATE_ID_ALREADY_IN_USE", message, { details });

export const invalidTransition = (message: string, details?: unknown) =>
  new AppError(409, "INVALID_STATE_TRANSITION", message, { details });

export const preconditionFailed = (message: string, details?: unknown) =>
  new AppError(422, "PRECONDITION_FAILED", message, { details });

export const uploadRejected = (message: string, details?: unknown) =>
  new AppError(422, "UPLOAD_REJECTED", message, { details });

export const rateLimited = (message = "Too many requests") =>
  new AppError(429, "RATE_LIMITED", message);

export const internalError = (message = "An unexpected error occurred") =>
  new AppError(500, "INTERNAL_ERROR", message, { expose: false });

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
