import { describe, expect, it } from "vitest";
import { DEFAULT_SEED_ADMIN_PASSWORD, seedAdminPasswordAllowed, trustProxyEnabled } from "../src/config.js";

describe("seed administrator password", () => {
  it("refuses the committed default password in production", () => {
    expect(seedAdminPasswordAllowed("production", DEFAULT_SEED_ADMIN_PASSWORD)).toBe(false);
  });

  it("refuses a short password in production", () => {
    expect(seedAdminPasswordAllowed("production", "Short!1")).toBe(false);
  });

  it("accepts a private password of 12+ characters in production", () => {
    expect(seedAdminPasswordAllowed("production", "a-Private!Passw0rd")).toBe(true);
  });

  it("keeps the default usable in development and test", () => {
    expect(seedAdminPasswordAllowed("development", DEFAULT_SEED_ADMIN_PASSWORD)).toBe(true);
    expect(seedAdminPasswordAllowed("test", DEFAULT_SEED_ADMIN_PASSWORD)).toBe(true);
  });
});

describe("reverse proxy trust", () => {
  it("trusts the proxy on Hostinger when TRUST_PROXY is unset", () => {
    expect(trustProxyEnabled(undefined, "/home/u123/domains/example.com/public_html")).toBe(true);
  });

  it("does not trust a proxy elsewhere when TRUST_PROXY is unset", () => {
    expect(trustProxyEnabled(undefined, undefined)).toBe(false);
  });

  it("lets an explicit TRUST_PROXY override the automatic choice", () => {
    expect(trustProxyEnabled(false, "/home/u123/domains/example.com/public_html")).toBe(false);
    expect(trustProxyEnabled(true, undefined)).toBe(true);
  });
});
