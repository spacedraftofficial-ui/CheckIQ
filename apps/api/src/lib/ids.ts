import { randomUUID } from "node:crypto";

/** Generates a v4 UUID used for all primary keys. */
export const newId = (): string => randomUUID();

/** Generates a short, URL-safe random token. */
export const newToken = (bytes = 32): string => {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Buffer.from(buffer).toString("base64url");
};
