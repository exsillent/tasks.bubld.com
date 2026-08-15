import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./passwords";

describe("passwords", () => {
  it("hashes a password to something other than the plaintext", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(hash).not.toBe("correct-horse-battery-staple");
    expect(hash.startsWith("$2")).toBe(true); // bcrypt hash prefix
  });

  it("verifies the correct password", async () => {
    const hash = await hashPassword("my-real-password");
    expect(await verifyPassword("my-real-password", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("my-real-password");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("produces a different hash each time (random salt)", async () => {
    const h1 = await hashPassword("same-input");
    const h2 = await hashPassword("same-input");
    expect(h1).not.toBe(h2);
    expect(await verifyPassword("same-input", h1)).toBe(true);
    expect(await verifyPassword("same-input", h2)).toBe(true);
  });
});
