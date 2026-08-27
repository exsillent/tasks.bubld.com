import { test, expect, type Page } from "@playwright/test";
import { E2E_PASSWORD } from "./e2e-data";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

async function createTask(page: Page, title: string) {
  await page.getByRole("link", { name: "+ New task" }).click();
  await page.waitForURL("/tasks/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Description").fill("d");
  await page.locator("select[name=appAreaId]").selectOption("infrastructure");
  await page.locator("select[name=type]").selectOption("FEATURE");
  await page.getByRole("button", { name: "Create task" }).click();
  await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);
}

test.describe("board", () => {
  test("board and table views both render the same tasks", async ({ page }) => {
    await login(page, "yasir-e2e@example.com");
    await createTask(page, "E2E view toggle task");
    await page.goto("/");

    await expect(page.getByText("E2E view toggle task")).toBeVisible();
    await page.getByRole("button", { name: "Table" }).click();
    await expect(page).toHaveURL(/view=table/);
    await expect(page.getByRole("cell", { name: "E2E view toggle task" })).toBeVisible();
    await page.getByRole("button", { name: "Board" }).click();
    await expect(page).not.toHaveURL(/view=table/);
  });

  test("filters persist across opening and closing a task", async ({ page }) => {
    await login(page, "yasir-e2e@example.com");
    await createTask(page, "E2E filter persist task");
    await page.goto("/");

    await page.getByPlaceholder("Search or #number…").fill("filter persist");
    await expect(page).toHaveURL(/q=filter/);
    await page.getByText("E2E filter persist task").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Close task detail" }).click();
    await expect(page).toHaveURL(/q=filter/);
    await expect(page.getByPlaceholder("Search or #number…")).toHaveValue("filter persist");
  });

  test("the Needs you strip shows a reviewer their review queue", async ({ page }) => {
    // Yasir creates a task and pushes it to For review.
    await login(page, "yasir-e2e@example.com");
    await createTask(page, "E2E review queue task");
    await page.getByRole("button", { name: "For review" }).click();
    await page.waitForLoadState("networkidle");

    await page.context().clearCookies();
    await login(page, "roland-e2e@example.com");
    const needs = page.locator("text=Needs you").locator("..");
    await expect(needs.getByRole("button", { name: /to review/ })).toBeVisible();
    await needs.getByRole("button", { name: /to review/ }).click();
    await expect(page).toHaveURL(/focus=review/);
    await expect(page.getByText("E2E review queue task")).toBeVisible();
  });

  test("archived tasks are hidden until the Archived toggle is on", async ({ page }) => {
    await login(page, "yasir-e2e@example.com");
    await createTask(page, "E2E archive toggle task");
    await page.getByRole("button", { name: "Archive", exact: true }).first().click();
    await page.waitForLoadState("networkidle");
    await page.goto("/");

    await expect(page.getByText("E2E archive toggle task")).toHaveCount(0);
    await page.getByLabel(/Archived/).check();
    await expect(page.getByText("E2E archive toggle task")).toBeVisible();
  });
});
