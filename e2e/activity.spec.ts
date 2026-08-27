import { test, expect, type Page } from "@playwright/test";
import { E2E_PASSWORD } from "./e2e-data";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

test.describe("updates", () => {
  test("a comment on your task shows in your digest, your own actions don't", async ({ page }) => {
    // Yasir's first board view sets his last-seen from now.
    await login(page, "yasir-e2e@example.com");
    await page.getByRole("link", { name: "Updates" }).click();
    await page.waitForURL("/activity");

    await page.getByRole("link", { name: "+ New task" }).click();
    await page.getByLabel("Title").fill("E2E digest task");
    await page.getByLabel("Description").fill("d");
    await page.locator("select[name=appAreaId]").selectOption("infrastructure");
    await page.getByRole("button", { name: "Create task" }).click();
    await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);
    await page.locator("select").filter({ hasText: "Unassigned" }).selectOption({ label: "Techaliance" });
    await page.waitForLoadState("networkidle");
    const taskUrl = page.url();

    // Techaliance comments -- shows in Yasir's digest (creator), not their own.
    await page.context().clearCookies();
    await login(page, "tech-e2e@example.com");
    await page.goto(taskUrl);
    await page.getByPlaceholder("Add a comment…").fill("Looking into it.");
    await page.getByRole("button", { name: "Comment" }).click();
    await page.waitForLoadState("networkidle");
    await page.goto("/activity");
    await expect(page.getByText("New since your last visit")).toHaveCount(0);

    await page.context().clearCookies();
    await login(page, "yasir-e2e@example.com");
    await page.goto("/activity");
    const digest = page.locator("text=New since your last visit").locator("..");
    await expect(digest).toBeVisible();
    await expect(digest.getByText("commented on #")).toBeVisible();
  });

  test("the full feed lists team activity grouped by day", async ({ page }) => {
    await login(page, "yasir-e2e@example.com");
    await page.getByRole("link", { name: "+ New task" }).click();
    await page.getByLabel("Title").fill("E2E feed task");
    await page.getByLabel("Description").fill("d");
    await page.locator("select[name=appAreaId]").selectOption("infrastructure");
    await page.getByRole("button", { name: "Create task" }).click();
    await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);

    await page.goto("/activity");
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(page.getByText("created #").first()).toBeVisible();
  });
});
