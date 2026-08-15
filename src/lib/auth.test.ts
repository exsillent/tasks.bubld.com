import { describe, it, expect, beforeEach } from "vitest";
import { createSession, getSession, destroySession, requireSession, requireRole } from "./auth";
import { __clearTestCookies } from "../../vitest.setup";

const testUser = {
  sub: "user-1",
  name: "Yasir",
  email: "yasir@example.com",
  role: "ADMIN" as const,
};

describe("session cookie lifecycle", () => {
  beforeEach(() => {
    __clearTestCookies();
  });

  it("has no session before login", async () => {
    expect(await getSession()).toBeNull();
  });

  it("returns the session after createSession", async () => {
    await createSession(testUser);
    expect(await getSession()).toEqual(testUser);
  });

  it("clears the session after destroySession", async () => {
    await createSession(testUser);
    await destroySession();
    expect(await getSession()).toBeNull();
  });

  it("requireSession throws when not logged in", async () => {
    await expect(requireSession()).rejects.toThrow("Not authenticated");
  });

  it("requireSession returns the session when logged in", async () => {
    await createSession(testUser);
    expect(await requireSession()).toEqual(testUser);
  });

  it("requireRole allows a matching role", async () => {
    await createSession(testUser);
    expect(await requireRole("ADMIN")).toEqual(testUser);
  });

  it("requireRole rejects a non-matching role", async () => {
    await createSession({ ...testUser, role: "CONTRACTOR" });
    await expect(requireRole("ADMIN", "APPROVER")).rejects.toThrow("Not authorized");
  });
});
