import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { hash } from "@node-rs/argon2";
import {
  DEFAULT_SEED_ADMIN_PASSWORD,
  getConfig,
  seedAdminPasswordAllowed,
  trustProxyEnabled,
} from "../src/config.js";
import { getDatabase, schema } from "../src/db/client.js";
import { runSeed } from "../src/db/seed.js";
import { api } from "./helpers.js";

describe("seed administrator break-glass reset", () => {
  it("restores access to a locked seed administrator when the switch is on", async () => {
    const config = getConfig();
    const { db } = getDatabase();
    const email = config.SEED_ADMIN_EMAIL.toLowerCase();
    const original = { password: config.SEED_ADMIN_PASSWORD, reset: config.SEED_ADMIN_RESET_PASSWORD };

    // Simulate the lock: an unknown random password and a revoked role.
    const [admin] = await db.select().from(schema.users).where(eq(schema.users.emailNormalized, email));
    await db
      .update(schema.users)
      .set({ passwordHash: await hash("an-unknown-random-value-xyz"), isActive: false })
      .where(eq(schema.users.id, admin!.id));
    await db
      .update(schema.userRoles)
      .set({ revokedAt: new Date() })
      .where(eq(schema.userRoles.userId, admin!.id));

    try {
      config.SEED_ADMIN_PASSWORD = "Recovered!Passw0rd";
      config.SEED_ADMIN_RESET_PASSWORD = true;
      await runSeed(db);
    } finally {
      config.SEED_ADMIN_PASSWORD = original.password;
      config.SEED_ADMIN_RESET_PASSWORD = original.reset;
    }

    const login = await api({
      method: "post",
      path: "/api/auth/login",
      body: { identifier: email, password: "Recovered!Passw0rd" },
    });
    expect(login.status).toBe(200);
    expect(login.body.data.user.roles).toContain("SUPER_ADMINISTRATOR");
    expect(login.body.data.user.mustChangePassword).toBe(true);
  });
});

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
