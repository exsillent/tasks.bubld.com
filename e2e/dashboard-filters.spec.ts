import { test, expect } from "@playwright/test";
import { E2E_PASSWORD } from "./e2e-data";

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

test.describe("dashboard filters", () => {
  test("My tasks and the Assignee dropdown don't stack into an impossible AND", async ({ page }) => {
    await login(page, "yasir-e2e@example.com");

    await page.getByRole("link", { name: "+ New Task" }).click();
    await page.getByLabel("Title").fill("E2E: filter conflict task");
    await page.getByLabel("Description").fill("Assigned to Yasir.");
    await page.getByRole("button", { name: "Create Task" }).click();
    await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);
    const assigneeSelectOnDetail = page.locator("select").filter({ hasText: "Unassigned" });
    await assigneeSelectOnDetail.selectOption({ label: "Yasir" });
    await page.waitForLoadState("networkidle");

    await page.goto("/");

    // Checking "My tasks" (Yasir is the assignee) should show it.
    await page.getByLabel("My tasks").check();
    await expect(page.getByText("E2E: filter conflict task")).toBeVisible();

    // Picking a *different* assignee from the dropdown must take over from
    // "My tasks" rather than stack with it -- stacking would silently
    // produce zero results (a task can't be assigned to both "me" and
    // someone else), which is exactly the bug this guards against.
    const assigneeFilter = page.locator("select").filter({ hasText: "All assignees" });
    await assigneeFilter.selectOption({ label: "Roland" });
    await expect(page.getByLabel("My tasks")).not.toBeChecked();
    await expect(page.getByText("E2E: filter conflict task")).toHaveCount(0);

    // Reset to "All assignees" -- task reappears (My tasks stayed off).
    await assigneeFilter.selectOption({ label: "All assignees" });
    await expect(page.getByText("E2E: filter conflict task")).toBeVisible();

    // Re-checking "My tasks" must clear any assignee selection so the two
    // controls can't conflict the other way either.
    await assigneeFilter.selectOption({ label: "Roland" });
    await page.getByLabel("My tasks").check();
    await expect(assigneeFilter).toHaveValue("");
    await expect(page.getByText("E2E: filter conflict task")).toBeVisible();
  });

  test("a status badge combined with + Complete shows both, not just one", async ({ page }) => {
    await login(page, "yasir-e2e@example.com");

    // One Open task, one Complete task.
    await page.getByRole("link", { name: "+ New Task" }).click();
    await page.getByLabel("Title").fill("E2E: combo open task");
    await page.getByLabel("Description").fill("Stays open.");
    await page.getByRole("button", { name: "Create Task" }).click();
    await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);

    await page.getByRole("link", { name: "+ New Task" }).click();
    await page.getByLabel("Title").fill("E2E: combo complete task");
    await page.getByLabel("Description").fill("Gets closed.");
    await page.getByRole("button", { name: "Create Task" }).click();
    await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Close" }).click();
    await page.waitForLoadState("networkidle");

    await page.goto("/");

    // Open badge alone: only the Open task.
    await page.getByRole("button", { name: /^\d+\s+Open$/ }).click();
    await expect(page.getByText("E2E: combo open task")).toBeVisible();
    await expect(page.getByText("E2E: combo complete task")).toHaveCount(0);

    // + Open badge + "+ Complete": both tasks together.
    await page.getByLabel("+ Complete").check();
    await expect(page.getByText("E2E: combo open task")).toBeVisible();
    await expect(page.getByText("E2E: combo complete task")).toBeVisible();

    // Unchecking drops back to just Open.
    await page.getByLabel("+ Complete").uncheck();
    await expect(page.getByText("E2E: combo complete task")).toHaveCount(0);
  });
});
