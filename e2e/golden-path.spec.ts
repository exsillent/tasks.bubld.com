import { test, expect, type Page } from "@playwright/test";
import { E2E_PASSWORD } from "./e2e-data";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

async function createTask(page: Page, title: string, area = "customer_app") {
  await page.getByRole("link", { name: "+ New task" }).click();
  await page.waitForURL("/tasks/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Description").fill("Details for " + title);
  await page.locator("select[name=appAreaId]").selectOption(area);
  await page.locator("select[name=type]").selectOption("ERROR");
  await page.getByRole("button", { name: "Create task" }).click();
  await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);
}

test.describe("golden path", () => {
  test("unauthenticated user is redirected to /login", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("/login");
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  });

  test("wrong password is rejected, not crashed", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("yasir-e2e@example.com");
    await page.getByLabel("Password").fill("nope");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Invalid email or password.")).toBeVisible();
  });

  test("disabled account cannot log in", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("disabled-e2e@example.com");
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("This account is currently disabled.")).toBeVisible();
  });

  test("a new task lands in the To do column and opens as a slide-over", async ({ page }) => {
    await login(page, "yasir-e2e@example.com");
    await createTask(page, "E2E checkout button broken");
    await expect(page.getByRole("heading", { name: "E2E checkout button broken" })).toBeVisible();

    await page.goto("/");
    const todo = page.locator("section", { has: page.getByRole("heading", { name: "To do" }) });
    await expect(todo.getByText("E2E checkout button broken")).toBeVisible();

    // Clicking the card opens the detail as a dialog, board still behind it.
    await page.getByText("E2E checkout button broken").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("link", { name: "+ New task" })).toBeVisible();
    await page.getByRole("button", { name: "Close task detail" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("full pipeline: start, review, approve, deploy", async ({ page }) => {
    // Yasir creates a continuous-area task and assigns Techaliance.
    await login(page, "yasir-e2e@example.com");
    await createTask(page, "E2E infra fix", "infrastructure");
    await page.locator("select").filter({ hasText: "Unassigned" }).selectOption({ label: "Techaliance" });
    await page.waitForLoadState("networkidle");

    // Techaliance starts it and sends it for review.
    await page.context().clearCookies();
    await login(page, "tech-e2e@example.com");
    await page.getByText("E2E infra fix").click();
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByRole("button", { name: "Send for review" })).toBeVisible();
    await page.getByRole("button", { name: "Send for review" }).click();
    await expect(page.getByText("Waiting for Roland").first()).toBeVisible();

    // Roland approves it -> back on Yasir's plate, ready to deploy.
    await page.context().clearCookies();
    await login(page, "roland-e2e@example.com");
    await page.getByText("E2E infra fix").click();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await page.getByRole("button", { name: /Approve .* hand to Yasir/ }).click();
    await page.waitForLoadState("networkidle");

    // Yasir marks it deployed.
    await page.context().clearCookies();
    await login(page, "yasir-e2e@example.com");
    const toDeploy = page.locator("section", { has: page.getByRole("heading", { name: "To deploy" }) });
    await expect(toDeploy.getByText("E2E infra fix")).toBeVisible();
    await toDeploy.getByText("E2E infra fix").click();
    await page.getByRole("button", { name: "Mark deployed to production" }).click();
    await page.waitForLoadState("networkidle");
    const deployed = page.locator("section", { has: page.getByRole("heading", { name: "Deployed" }) });
    await expect(deployed.getByText("E2E infra fix")).toBeVisible();
  });

  test("send back requires a comment and flags the task", async ({ page }) => {
    await login(page, "yasir-e2e@example.com");
    await createTask(page, "E2E needs rework", "infrastructure");
    await page.getByRole("button", { name: "Start" }).first().isVisible().catch(() => {});
    // move it straight to review via the stepper
    await page.getByRole("button", { name: "For review" }).click();
    await page.waitForLoadState("networkidle");

    await page.context().clearCookies();
    await login(page, "roland-e2e@example.com");
    await page.getByText("E2E needs rework").click();
    await page.getByRole("button", { name: "Send back" }).click();
    await page.getByPlaceholder("What needs changing?").fill("The spacing is off by 4px.");
    await page.getByRole("button", { name: /Send back to/ }).click();
    await page.waitForLoadState("networkidle");

    await page.goto("/");
    const beingFixed = page.locator("section", { has: page.getByRole("heading", { name: "Being fixed" }) });
    await expect(beingFixed.getByText("E2E needs rework")).toBeVisible();
    await expect(beingFixed.getByText("changes requested").first()).toBeVisible();
  });
});
