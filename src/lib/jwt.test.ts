import { describe, it, expect } from "vitest";
import { signSessionToken, verifySessionToken } from "./jwt";

const testUser = {
  sub: "user-123",
  name: "Test User",
  email: "test@example.com",
  role: "ADMIN" as const,
};

describe("jwt session tokens", () => {
  it("signs and verifies a valid token", async () => {
    const token = await signSessionToken(testUser);
    const verified = await verifySessionToken(token);
    expect(verified).toEqual(testUser);
  });

  it("rejects a tampered token", async () => {
    const token = await signSessionToken(testUser);
    const tampered = token.slice(0, -5) + "aaaaa";
    expect(await verifySessionToken(tampered)).toBeNull();
  });

  it("rejects garbage input", async () => {
    expect(await verifySessionToken("not-a-real-token")).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
  });

  it("rejects undefined (no cookie present)", async () => {
    expect(await verifySessionToken(undefined)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSessionToken(testUser);
    const originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "a-completely-different-secret-value";
    try {
      expect(await verifySessionToken(token)).toBeNull();
    } finally {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  it("rejects a payload missing required fields", async () => {
    // Directly craft a token with an incomplete payload to confirm the
    // shape-check in verifySessionToken actually runs, not just the
    // cryptographic signature check.
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const incomplete = await new SignJWT({ sub: "abc" }) // missing name/email/role
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(secret);
    expect(await verifySessionToken(incomplete)).toBeNull();
  });
});
