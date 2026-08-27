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
  test("a task comment reaches the creator's digest, not the commenter's own", async ({ page }) => {
    // Yasir visits Updates first so his last-seen is set to now.
    await login(page, "yasir-e2e@example.com");
    await page.getByRole("link", { name: "Updates" }).click();
    await page.waitForURL("/activity");

    await page.getByRole("link", { name: "+ New task" }).click();
    await page.getByLabel("Title").fill("E2E digest task");
    await page.getByLabel("Description").fill("d");
    await page.locator("select[name=appAreaId]").selectOption("infrastructure");
    await page.getByRole("button", { name: "Create task" }).click();
    await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);
    const taskUrl = page.url();
    await page.locator("select").filter({ hasText: "Unassigned" }).selectOption({ label: "Techaliance" });
    await expect(page.getByText("Reassigned.")).toBeVisible();

    // Techaliance comments. Their digest shows Yasir's assignment (a real
    // heads-up for them) but never their own comment.
    await page.context().clearCookies();
    await login(page, "tech-e2e@example.com");
    await page.goto(taskUrl);
    await page.getByPlaceholder("Add a comment…").fill("Looking into it.");
    await page.getByRole("button", { name: "Comment" }).click();
    await page.goto("/activity");
    const techDigest = page.locator("text=New since your last visit").locator("..");
    await expect(techDigest.getByText("assigned #")).toBeVisible();
    await expect(techDigest.getByText("commented on #")).toHaveCount(0);

    // Yasir (the creator) sees Techaliance's comment on his next visit.
    await page.context().clearCookies();
    await login(page, "yasir-e2e@example.com");
    await page.goto("/activity");
    const yasirDigest = page.locator("text=New since your last visit").locator("..");
    await expect(yasirDigest).toBeVisible();
    await expect(yasirDigest.getByText("commented on #")).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
    await expect(page.getByText("created #").first()).toBeVisible();
  });
});
