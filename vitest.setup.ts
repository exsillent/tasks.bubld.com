import { vi } from "vitest";

// "server-only" throws when imported outside Next's own bundler (it relies
// on webpack/turbopack module-resolution tricks to tell server vs client
// bundles apart). Outside that context -- i.e. in these tests -- it's a
// pure no-op guard, so it's safe to stub out.
vi.mock("server-only", () => ({}));

// A tiny in-memory cookie jar so createSession/getSession/destroySession
// (which call next/headers's cookies()) work the same way inside a test as
// they do inside a real request -- set in one call, read back in the next.
const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieStore.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

export function __clearTestCookies() {
  cookieStore.clear();
}
