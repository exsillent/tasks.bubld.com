import type { MetadataRoute } from "next";

// This is a private internal tool, not a public site -- no crawler,
// including Google's, should touch any part of it. Every route also sits
// behind real auth (redirects to /login without a session) and carries its
// own noindex/nofollow metadata (see layout.tsx), so this is belt-and-
// suspenders: robots.txt is the more universally respected signal for bots
// that don't execute JS or read per-page meta tags.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
