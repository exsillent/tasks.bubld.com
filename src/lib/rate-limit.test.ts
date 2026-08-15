import { describe, it, expect, beforeEach } from "vitest";
import { isRateLimited, recordLoginAttempt } from "./rate-limit";
import { resetDb } from "@/test-helpers/db";

describe("login rate limiting", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("is not rate limited with zero attempts", async () => {
    expect(await isRateLimited("nobody@example.com")).toBe(false);
  });

  it("is not rate limited under the failure threshold", async () => {
    const email = "under-threshold@example.com";
    for (let i = 0; i < 4; i++) {
      await recordLoginAttempt(email, false);
    }
    expect(await isRateLimited(email)).toBe(false);
  });

  it("becomes rate limited at 5 failures within the window", async () => {
    const email = "over-threshold@example.com";
    for (let i = 0; i < 5; i++) {
      await recordLoginAttempt(email, false);
    }
    expect(await isRateLimited(email)).toBe(true);
  });

  it("successful attempts don't count toward the failure limit", async () => {
    const email = "mixed@example.com";
    for (let i = 0; i < 10; i++) {
      await recordLoginAttempt(email, true);
    }
    expect(await isRateLimited(email)).toBe(false);
  });

  it("is case-insensitive on email", async () => {
    const lower = "case-test@example.com";
    for (let i = 0; i < 5; i++) {
      await recordLoginAttempt(lower.toUpperCase(), false);
    }
    expect(await isRateLimited(lower)).toBe(true);
  });

  it("rate limiting for one email doesn't affect another", async () => {
    for (let i = 0; i < 5; i++) {
      await recordLoginAttempt("attacker@example.com", false);
    }
    expect(await isRateLimited("innocent@example.com")).toBe(false);
  });
});
