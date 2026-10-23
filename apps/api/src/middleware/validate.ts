import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodType } from "zod";
import { validationError } from "../lib/errors.js";

/**
 * Request validation.
 *
 * `validate({ body, query, params })` parses each section with the supplied
 * Zod schema. The **parsed** value replaces the raw value, so downstream
 * handlers work with coerced, typed data rather than untrusted input.
 */

export interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      if (schemas.query) {
        // Express 5 exposes `query` as a getter-only property on the request.
        Object.defineProperty(req, "query", {
          value: schemas.query.parse(req.query),
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (error) {
      next(validationError("The request payload failed validation.", error));
    }
  };
}
