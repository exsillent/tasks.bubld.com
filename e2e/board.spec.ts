import { test, expect, type Page } from "@playwright/test";
import { E2E_PASSWORD } from "./e2e-data";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

async function createTask(page: Page, title: string): Promise<string> {
  await page.getByRole("link", { name: "+ New task" }).click();
  await page.waitForURL("/tasks/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Description").fill("d");
  await page.locator("select[name=appAreaId]").selectOption("infrastructure");
  await page.locator("select[name=type]").selectOption("FEATURE");
  await page.getByRole("button", { name: "Create task" }).click();
  await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);
  return page.url();
}

test.describe("board", () => {
  test("board and table views both render the same tasks", async ({ page }) => {
    await login(page, "yasir-e2e@example.com");
    await createTask(page, "E2E view toggle task");
    await page.goto("/");

    await expect(page.getByText("E2E view toggle task")).toBeVisible();
    await page.getByRole("button", { name: "Table", exact: true }).click();
    await expect(page).toHaveURL(/view=table/);
    await expect(page.getByRole("cell", { name: "E2E view toggle task" })).toBeVisible();
    await page.getByRole("button", { name: "Board", exact: true }).click();
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
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page).toHaveURL(/q=filter/);
    await expect(page.getByPlaceholder("Search or #number…")).toHaveValue("filter persist");
  });

  test("the Needs you strip shows a reviewer their review queue", async ({ page }) => {
    await login(page, "yasir-e2e@example.com");
    await createTask(page, "E2E review queue task");
    await page.getByRole("button", { name: "For review", exact: true }).click();
    await expect(page.getByText(/Moved to For review\./)).toBeVisible();

    await page.context().clearCookies();
    await login(page, "roland-e2e@example.com");
    const chip = page.getByRole("button", { name: /\d+ to review/ });
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(page).toHaveURL(/focus=review/);
    await expect(page.getByText("E2E review queue task")).toBeVisible();
  });

  test("archived tasks are hidden until the Archived toggle is on", async ({ page }) => {
    await login(page, "yasir-e2e@example.com");
    await createTask(page, "E2E archive toggle task");
    await page.getByRole("button", { name: "Archive", exact: true }).first().click();
    await expect(page.getByText("Archived.")).toBeVisible();
    await page.goto("/");

    await expect(page.getByText("E2E archive toggle task")).toHaveCount(0);
    await page.getByRole("button", { name: /Archived \(/ }).click();
    await expect(page).toHaveURL(/archived=1/);
    await expect(page.getByText("E2E archive toggle task")).toBeVisible();
  });
});
