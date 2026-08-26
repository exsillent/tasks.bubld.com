import { test, expect } from "@playwright/test";
import { E2E_PASSWORD } from "./e2e-data";

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

test.describe("activity tracking", () => {
  test("assignment and comments surface in the assignee's and creator's digest, but not the actor's own", async ({
    page,
  }) => {
    // Yasir's first view of the dashboard marks his digest as seen from now.
    await login(page, "yasir-e2e@example.com");

    await page.getByRole("link", { name: "+ New Task" }).click();
    await page.getByLabel("Title").fill("E2E: activity tracking task");
    await page.getByLabel("Description").fill("Used to verify the activity digest.");
    await page.getByRole("button", { name: "Create Task" }).click();
    await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);
    const taskUrl = page.url();

    // Assigning to Techaliance is Yasir's own action -- must not appear in
    // his own digest later.
    const assigneeSelect = page.locator("select").filter({ hasText: "Unassigned" });
    await assigneeSelect.selectOption({ label: "Techaliance" });
    await page.waitForLoadState("networkidle");

    // Techaliance logs in for the first time -- their digest has no prior
    // lastSeenAt, so it should show the assignment.
    await page.context().clearCookies();
    await login(page, "tech-e2e@example.com");
    const techDigest = page.getByTestId("activity-digest");
    await expect(techDigest).toBeVisible();
    await expect(techDigest.getByText("assigned #")).toBeVisible();

    // Techaliance comments -- their own action, must not show in their own
    // digest, but should show in Yasir's (task creator) next login.
    await page.goto(taskUrl);
    await page.getByPlaceholder("Add a comment...").fill("Started looking into this.");
    await page.getByRole("button", { name: "Comment" }).click();
    await page.waitForLoadState("networkidle");

    await page.goto("/");
    await expect(page.getByTestId("activity-digest")).toHaveCount(0);

    // Yasir logs back in -- should see Techaliance's comment (on a task he
    // created) but not his own earlier assignment action.
    await page.context().clearCookies();
    await login(page, "yasir-e2e@example.com");
    const digest = page.getByTestId("activity-digest");
    await expect(digest).toBeVisible();
    await expect(digest.getByText("commented on #")).toBeVisible();
    await expect(digest.getByText("assigned #")).toHaveCount(0);
  });

  test("/activity page lists all team-wide activity, grouped by day, with nothing hidden", async ({
    page,
  }) => {
    await login(page, "yasir-e2e@example.com");
    await page.getByRole("link", { name: "+ New Task" }).click();
    await page.getByLabel("Title").fill("E2E: activity feed task");
    await page.getByLabel("Description").fill("Used to verify the /activity page.");
    await page.getByRole("button", { name: "Create Task" }).click();
    await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);

    await page.getByRole("link", { name: "Activity", exact: true }).click();
    await page.waitForURL("/activity");
    // Title is unique to this test -- other tests in this file create
    // differently-titled tasks against the same shared DB, so this doesn't
    // depend on exact task numbering/order.
    await expect(page.getByText(/created #\d+: E2E: activity feed task/)).toBeVisible();
    // Grouped under a "Today" heading -- no date picker, nothing gets hidden
    // by navigating away from it.
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(page.locator("#activity-date")).toHaveCount(0);
  });

  test("a deleted task's activity entries still show, without a broken link", async ({ page }) => {
    await login(page, "yasir-e2e@example.com");
    await page.getByRole("link", { name: "+ New Task" }).click();
    await page.getByLabel("Title").fill("E2E: task to delete");
    await page.getByLabel("Description").fill("Should still show as deleted in the feed.");
    await page.getByRole("button", { name: "Create Task" }).click();
    await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);

    // Registered before the click -- handleDelete's window.confirm() fires
    // synchronously inside the click handler.
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete" }).click();
    await page.waitForURL("/");

    await page.getByRole("link", { name: "Activity", exact: true }).click();
    await page.waitForURL("/activity");
    await expect(page.getByText(/deleted #\d+: E2E: task to delete/)).toBeVisible();
    // The deleted entry must render as plain text, not a link to a 404.
    await expect(page.getByRole("link", { name: /deleted #/ })).toHaveCount(0);
  });

  test("multiple same-day actions on one task collapse to a single, most-recent row", async ({
    page,
  }) => {
    await login(page, "yasir-e2e@example.com");
    await page.getByRole("link", { name: "+ New Task" }).click();
    await page.getByLabel("Title").fill("E2E: dedup task");
    await page.getByLabel("Description").fill("Created, then commented on twice -- same day.");
    await page.getByRole("button", { name: "Create Task" }).click();
    await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);

    await page.getByPlaceholder("Add a comment...").fill("First comment.");
    await page.getByRole("button", { name: "Comment" }).click();
    await page.waitForLoadState("networkidle");

    await page.getByPlaceholder("Add a comment...").fill("Second comment.");
    await page.getByRole("button", { name: "Comment" }).click();
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: "Activity", exact: true }).click();
    await page.waitForURL("/activity");

    // Only the latest action for this task shows -- not "created" and not
    // the first comment, both of which happened earlier today on the same task.
    await expect(page.getByText(/commented on #\d+: E2E: dedup task/)).toHaveCount(1);
    await expect(page.getByText(/created #\d+: E2E: dedup task/)).toHaveCount(0);
  });

  test("recent-logins list is visible to Yasir (ADMIN) only", async ({ page }) => {
    await login(page, "roland-e2e@example.com");
    await page.getByRole("link", { name: "Activity", exact: true }).click();
    await page.waitForURL("/activity");
    await expect(page.getByRole("heading", { name: "Recent logins" })).toHaveCount(0);

    await page.context().clearCookies();
    await login(page, "yasir-e2e@example.com");
    await page.goto("/activity");
    await expect(page.getByRole("heading", { name: "Recent logins" })).toBeVisible();
    // Both logins that happened during this test should be listed.
    const loginTable = page.locator("table").filter({ hasText: "IP address" });
    await expect(loginTable.getByRole("cell", { name: "Roland" }).first()).toBeVisible();
    await expect(loginTable.getByRole("cell", { name: "Yasir" }).first()).toBeVisible();
  });
});
