import type { Request } from "express";
import { badRequest } from "./errors.js";

/**
 * Typed accessors for request data.
 *
 * Express 5 types `req.params` values as `string | string[] | undefined`.
 * These helpers narrow the value at the point of use and fail loudly when a
 * parameter is missing, rather than letting `undefined` flow into a query.
 */

export function param(req: Request, name: string): string {
  const value = (req.params as Record<string, unknown>)[name];
  if (typeof value !== "string" || value.length === 0) {
    throw badRequest(`Missing route parameter: ${name}`);
  }
  return value;
}

export function body<T>(req: Request): T {
  return req.body as T;
}

export function query<T>(req: Request): T {
  return req.query as unknown as T;
}
