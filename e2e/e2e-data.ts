// Shared test-fixture data for the E2E suite. Kept separate from
// seed-e2e.ts's executable seeding logic so that importing these constants
// (e.g. E2E_PASSWORD in spec files) never has the side effect of re-running
// the seed against the database -- that side effect previously caused
// duplicate-seed races (P2002 unique constraint errors) any time Node
// imported seed-e2e.ts for its exports rather than executing it directly.
export const E2E_PASSWORD = "e2e-test-password-123";

export const E2E_USERS = [
  { name: "Yasir", email: "yasir-e2e@example.com", role: "ADMIN", isActive: true },
  { name: "Roland", email: "roland-e2e@example.com", role: "APPROVER", isActive: true },
  { name: "Danielle", email: "danielle-e2e@example.com", role: "APPROVER", isActive: true },
  { name: "Techaliance", email: "tech-e2e@example.com", role: "CONTRACTOR", isActive: true },
  { name: "Disabled User", email: "disabled-e2e@example.com", role: "CONTRACTOR", isActive: false },
] as const;
