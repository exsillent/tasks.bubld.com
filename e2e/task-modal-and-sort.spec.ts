import { test, expect } from "@playwright/test";
import { E2E_PASSWORD } from "./e2e-data";

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

test.describe("task modal + filter persistence + sort", () => {
  test("opening a task from a filtered list preserves the filter on close, no back button needed", async ({
    page,
  }) => {
    await login(page, "yasir-e2e@example.com");

    await page.getByRole("link", { name: "+ New Task" }).click();
    await page.getByLabel("Title").fill("E2E: modal persistence task");
    await page.getByLabel("Description").fill("Checked via the Error type filter.");
    await page.locator("select[name=type]").selectOption("ERROR");
    await page.getByRole("button", { name: "Create Task" }).click();
    await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);

    await page.goto("/");
    const typeFilter = page.locator("select").filter({ hasText: "All types" });
    await typeFilter.selectOption({ label: "Error" });
    await expect(page).toHaveURL(/type=ERROR/);
    await expect(page.getByText("E2E: modal persistence task")).toBeVisible();

    // Click the task -- should render as a slide-over (dialog role), not a
    // full page navigation. The intercepted route's own URL is just
    // /tasks/[id] (no query) -- that's the masked target URL Next shows
    // while the overlay is open; "/" and its filter live one entry back in
    // history, which is what actually needs to survive the close below.
    await page.getByText("E2E: modal persistence task").click();
    await expect(page).toHaveURL(/\/tasks\/[a-z0-9]+$/);
    await expect(page.getByRole("dialog")).toBeVisible();
    // The list underneath is still in the DOM (proof it's an overlay, not a
    // real navigation away from "/").
    await expect(page.getByRole("link", { name: "+ New Task" })).toBeVisible();

    // Close via the X button -- filter must still be applied, no manual
    // re-filtering needed.
    await page.getByRole("button", { name: "Close task detail" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page).toHaveURL(/type=ERROR/);
    await expect(typeFilter).toHaveValue("ERROR");
    await expect(page.getByText("E2E: modal persistence task")).toBeVisible();
  });

  test("Escape key closes the modal and browser back also closes it (not navigate away)", async ({ page }) => {
    await login(page, "yasir-e2e@example.com");

    await page.getByRole("link", { name: "+ New Task" }).click();
    await page.getByLabel("Title").fill("E2E: escape and back task");
    await page.getByLabel("Description").fill("For Escape/back testing.");
    await page.getByRole("button", { name: "Create Task" }).click();
    await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);

    await page.goto("/");
    await page.getByText("E2E: escape and back task").click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page).toHaveURL("/");

    // Re-open, then use the actual browser back button.
    await page.getByText("E2E: escape and back task").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page).toHaveURL("/");
  });

  test("direct navigation to a task URL renders the full page, not the modal", async ({ page }) => {
    await login(page, "yasir-e2e@example.com");

    await page.getByRole("link", { name: "+ New Task" }).click();
    await page.getByLabel("Title").fill("E2E: direct link task");
    await page.getByLabel("Description").fill("Loaded via a hard navigation.");
    await page.getByRole("button", { name: "Create Task" }).click();
    await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);
    const url = page.url();

    // A hard navigation (page.goto, same as a refresh or a pasted link)
    // must bypass the interception entirely -- full page, no dialog.
    await page.goto(url);
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.locator("header")).toBeVisible();
    await expect(page.getByRole("heading", { name: "E2E: direct link task" })).toBeVisible();
  });

  test("Status strip counts and options are scoped to the selected Stage", async ({ page }) => {
    await login(page, "yasir-e2e@example.com");

    // One task in Development (default stage for a new task), moved to
    // Staging so there's a real cross-stage split to scope against.
    await page.getByRole("link", { name: "+ New Task" }).click();
    await page.getByLabel("Title").fill("E2E: dev stage task");
    await page.getByLabel("Description").fill("Stays in Development.");
    await page.getByRole("button", { name: "Create Task" }).click();
    await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);

    await page.getByRole("link", { name: "+ New Task" }).click();
    await page.getByLabel("Title").fill("E2E: staging stage task");
    await page.getByLabel("Description").fill("Moved to Staging.");
    await page.getByRole("button", { name: "Create Task" }).click();
    await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);
    await page.locator("select").filter({ hasText: "Development" }).selectOption({ label: "Staging" });
    await page.waitForLoadState("networkidle");

    await page.goto("/");
    // Before picking a Stage, Status totals include both tasks.
    const openStatusButton = page.getByRole("button", { name: /^\d+\s+Open$/ });
    const openCountBefore = await openStatusButton.textContent();
    expect(openCountBefore).toBeTruthy();

    // Selecting the Staging stage should shrink the Status "Open" count to
    // just the one task actually in that stage.
    await page.getByRole("button", { name: /^\d+\s+Staging$/ }).click();
    await expect(page).toHaveURL(/stage=STAGING/);
    await expect(page.getByText("E2E: staging stage task")).toBeVisible();
    await expect(page.getByText("E2E: dev stage task")).toHaveCount(0);
  });

  test("sort dropdown reorders the list and persists in the URL", async ({ page }) => {
    await login(page, "yasir-e2e@example.com");

    await page.getByRole("link", { name: "+ New Task" }).click();
    await page.getByLabel("Title").fill("E2E: sort low priority");
    await page.getByLabel("Description").fill("Low priority.");
    await page.locator("select[name=priority]").selectOption("LOW");
    await page.getByRole("button", { name: "Create Task" }).click();
    await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);

    await page.getByRole("link", { name: "+ New Task" }).click();
    await page.getByLabel("Title").fill("E2E: sort critical priority");
    await page.getByLabel("Description").fill("Critical priority.");
    await page.locator("select[name=priority]").selectOption("CRITICAL");
    await page.getByRole("button", { name: "Create Task" }).click();
    await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);

    await page.goto("/");
    const sortSelect = page.getByLabel("Sort by");
    await sortSelect.selectOption({ label: "Sort: Priority (high first)" });
    await expect(page).toHaveURL(/sort=priority/);

    const rows = page.locator("a").filter({ hasText: "E2E: sort" });
    await expect(rows.first()).toContainText("E2E: sort critical priority");
  });
});
