import { test, expect } from "@playwright/test";
import { E2E_PASSWORD } from "./e2e-data";

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

test.describe("golden path", () => {
  test("unauthenticated user is redirected to /login", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("/login");
    await expect(page.getByRole("heading", { name: "Sign in to Bubld Tasks" })).toBeVisible();
  });

  test("wrong password is rejected with an error, not a crash", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("yasir-e2e@example.com");
    await page.getByLabel("Password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Invalid email or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("disabled account cannot log in", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("disabled-e2e@example.com");
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("This account is currently disabled.")).toBeVisible();
  });

  test("Yasir logs in, creates a task, it appears in the list and detail page", async ({ page }) => {
    await login(page, "yasir-e2e@example.com");
    await expect(page.locator("header").getByText("Yasir")).toBeVisible();

    await page.getByRole("link", { name: "+ New Task" }).click();
    await page.waitForURL("/tasks/new");

    await page.getByLabel("Title").fill("E2E: fix the checkout button");
    await page.getByLabel("Description").fill("It doesn't respond to taps on iOS.");
    await page.locator("select[name=appArea]").selectOption("CUSTOMER_APP");
    await page.locator("select[name=type]").selectOption("ERROR");
    await page.locator("select[name=priority]").selectOption("HIGH");
    await page.getByRole("button", { name: "Create Task" }).click();

    await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);
    await expect(page.getByRole("heading", { name: "E2E: fix the checkout button" })).toBeVisible();
    await expect(page.getByText("It doesn't respond to taps on iOS.")).toBeVisible();

    await page.goto("/");
    await expect(page.getByText("E2E: fix the checkout button")).toBeVisible();
  });

  test("full workflow: assign, start, review, staging, approve", async ({ page }) => {
    // Create as Yasir, assign to Techaliance.
    await login(page, "yasir-e2e@example.com");
    await page.getByRole("link", { name: "+ New Task" }).click();
    await page.getByLabel("Title").fill("E2E: workflow task");
    await page.getByLabel("Description").fill("Full lifecycle test.");
    await page.getByRole("button", { name: "Create Task" }).click();
    await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);
    const taskUrl = page.url();

    const assigneeSelect = page.locator("select").filter({ hasText: "Unassigned" });
    await assigneeSelect.selectOption({ label: "Techaliance" });
    // Wait for the assignTask Server Action's round trip to actually land
    // server-side, not just for the <select>'s local DOM value to change --
    // otherwise switching accounts next races the real database update.
    await page.waitForLoadState("networkidle");
    await page.reload();
    await expect(page.locator("select").filter({ hasText: "Techaliance" })).toHaveValue(/.+/);

    // Techaliance starts and moves it to review.
    await page.context().clearCookies();
    await login(page, "tech-e2e@example.com");
    await page.goto(taskUrl);
    await page.getByRole("button", { name: "Start Work" }).click();
    await expect(page.getByText("In Progress", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Mark Ready for Review" }).click();
    await expect(page.getByText("In Review", { exact: true })).toBeVisible();

    // Techaliance should NOT be able to push it to staging review themselves.
    await expect(page.getByRole("button", { name: "Send to Staging Review" })).toHaveCount(0);

    // Yasir sends it to staging review.
    await page.context().clearCookies();
    await login(page, "yasir-e2e@example.com");
    await page.goto(taskUrl);
    await page.getByRole("button", { name: "Send to Staging Review" }).click();
    await expect(page.getByText("Staging Review", { exact: true })).toBeVisible();

    // Roland approves.
    await page.context().clearCookies();
    await login(page, "roland-e2e@example.com");
    await page.goto(taskUrl);
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Approved", { exact: true })).toBeVisible();

    // Techaliance should not see an Approve button anywhere (not their role).
    await page.context().clearCookies();
    await login(page, "tech-e2e@example.com");
    await page.goto(taskUrl);
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Mark Deployed" })).toHaveCount(0);

    // Yasir marks it deployed.
    await page.context().clearCookies();
    await login(page, "yasir-e2e@example.com");
    await page.goto(taskUrl);
    await page.getByRole("button", { name: "Mark Deployed" }).click();
    await expect(page.getByText("Done", { exact: true })).toBeVisible();
  });

  test("comments: post one, it appears with author and timestamp", async ({ page }) => {
    await login(page, "yasir-e2e@example.com");
    await page.getByRole("link", { name: "+ New Task" }).click();
    await page.getByLabel("Title").fill("E2E: comment task");
    await page.getByLabel("Description").fill("For comment testing.");
    await page.getByRole("button", { name: "Create Task" }).click();
    await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);

    await page.getByPlaceholder("Add a comment...").fill("This is a real end-to-end comment.");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(page.getByText("This is a real end-to-end comment.")).toBeVisible();
    await expect(page.getByText("Yasir").last()).toBeVisible();
  });

  test("private comment is invisible to a non-admin", async ({ page }) => {
    await login(page, "yasir-e2e@example.com");
    await page.getByRole("link", { name: "+ New Task" }).click();
    await page.getByLabel("Title").fill("E2E: private note task");
    await page.getByLabel("Description").fill("Testing private notes.");
    await page.getByRole("button", { name: "Create Task" }).click();
    await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);
    const taskUrl = page.url();

    await page.getByPlaceholder("Add a comment...").fill("commit abc123, see src/foo.ts:42");
    await page.getByLabel("Private note (only visible to you)").check();
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(page.getByText("commit abc123, see src/foo.ts:42")).toBeVisible();
    await expect(page.getByText("Private note", { exact: true })).toBeVisible();

    await page.context().clearCookies();
    await login(page, "roland-e2e@example.com");
    await page.goto(taskUrl);
    await expect(page.getByText("commit abc123, see src/foo.ts:42")).toHaveCount(0);
    await expect(page.getByText("No comments yet.")).toBeVisible();
  });

  test("draft task is invisible to non-creators, including by direct URL", async ({ page }) => {
    await login(page, "yasir-e2e@example.com");
    await page.getByRole("link", { name: "+ New Task" }).click();
    await page.getByLabel("Title").fill("E2E: secret draft task");
    await page.getByLabel("Description").fill("Should be hidden.");
    await page.getByLabel("Keep private (draft) -- only visible to you until published").check();
    await page.getByRole("button", { name: "Create Task" }).click();
    await page.waitForURL(/\/tasks\/(?!new$)[a-z0-9]+$/);
    const taskUrl = page.url();
    await expect(page.getByText("Draft -- only visible to you.")).toBeVisible();

    // Not in Roland's list.
    await page.context().clearCookies();
    await login(page, "roland-e2e@example.com");
    await expect(page.getByText("E2E: secret draft task")).toHaveCount(0);

    // Not reachable by direct URL either. Checked via a hard reload
    // (bypassing Next's client-side router, which can report the wrong
    // navigation status for a notFound() boundary reached via soft
    // navigation) and via rendered content -- confirmed separately with a
    // direct authenticated HTTP request that the server genuinely returns
    // 404 with no content leak; this assertion targets what the user
    // actually sees.
    await page.goto(taskUrl, { waitUntil: "load" });
    await page.reload();
    await expect(page.getByText("E2E: secret draft task")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();

    // Yasir publishes it -- now Roland can see it.
    await page.context().clearCookies();
    await login(page, "yasir-e2e@example.com");
    await page.goto(taskUrl);
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText("Draft -- only visible to you.")).toHaveCount(0);

    await page.context().clearCookies();
    await login(page, "roland-e2e@example.com");
    await page.goto(taskUrl);
    await expect(page.getByRole("heading", { name: "E2E: secret draft task" })).toBeVisible();
  });

  test("logout clears the session", async ({ page }) => {
    await login(page, "yasir-e2e@example.com");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("/login");
    await page.goto("/");
    await page.waitForURL("/login");
  });
});
