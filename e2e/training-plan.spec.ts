import { expect, test } from "@playwright/test";

test("shows the deterministic Week first and the same workouts in Month", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Your Training Plan" }),
  ).toBeVisible();
  await expect(page.getByText("26 August 2026 · 20:15")).toBeVisible();
  await expect(page.getByRole("button", { name: "Week" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("5 × 1 km threshold")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /18 km long run, 2026-08-30/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Month" }).click();
  await expect(
    page.getByRole("heading", { name: "August 2026" }),
  ).toBeVisible();
  await expect(page.getByText("5 × 1 km threshold")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /18 km long run, 2026-08-30/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Week" }).click();
  await expect(page.getByText("24–30 August")).toBeVisible();
});

test("shows the partial Workout Result without conflating it with planned intent", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /5 × 1 km threshold/ }).click();

  await expect(
    page.getByRole("heading", { name: "5 × 1 km threshold" }),
  ).toBeVisible();
  await expect(page.getByText("Planned prescription")).toBeVisible();
  await expect(page.getByText("Workout Result")).toBeVisible();
  await expect(page.getByText("of 5 work repetitions")).toBeVisible();
  await expect(page.getByText("4:36/km · 165 bpm")).toBeVisible();
  await expect(page.getByText("4:48/km · 176 bpm")).toBeVisible();
});

test("persists the seeded envelope across reload and resets with in-page approval", async ({
  page,
}) => {
  await page.goto("/");
  const savedBeforeReload = await page.evaluate(() =>
    window.localStorage.getItem("your-last-coach.workspace.v1"),
  );
  expect(savedBeforeReload).not.toBeNull();

  await page.reload();
  await expect(page.getByText("Plan version 1")).toBeVisible();
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Reset the demo?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep current plan" }).click();
  await expect(
    page.getByRole("heading", { name: "Reset the demo?" }),
  ).toBeHidden();

  await page.getByRole("button", { name: "Reset demo" }).click();
  await page
    .getByRole("dialog", { name: "Reset the demo?" })
    .getByRole("button", { name: "Reset demo" })
    .click();
  await expect(
    page.getByText("Demo restored to its starting Training Plan."),
  ).toBeVisible();
  await expect(page.getByText("Plan version 1")).toBeVisible();
});

test("replaces invalid saved data and explains the refresh", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("your-last-coach.workspace.v1", "{broken");
  });
  await page.goto("/");

  await expect(
    page.getByText(
      "Saved demo data could not be used, so the Training Plan was refreshed.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Plan version 1")).toBeVisible();
});

test("remains usable without WebMCP and warns when storage is memory-only", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const unavailable = () => {
      throw new DOMException("Storage denied", "SecurityError");
    };
    Storage.prototype.getItem = unavailable;
    Storage.prototype.setItem = unavailable;
    Storage.prototype.removeItem = unavailable;
  });
  await page.goto("/");

  await expect(
    page.getByRole("button", { name: "Coach Agent connection: unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByText("Changes will last only until this page is reloaded."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Month" }).click();
  await expect(
    page.getByRole("heading", { name: "August 2026" }),
  ).toBeVisible();
});

test("keeps the Training Plan readable beside ChatGPT", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Your Training Plan" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(720);
  await expect(page.getByRole("button", { name: "Month" })).toBeVisible();
});
