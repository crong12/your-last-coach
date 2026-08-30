import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("your-last-coach.demo-guide.v1", "seen");
  });
});

test("serves the built fallback workspace without external runtime requests", async ({
  page,
}) => {
  const externalRequests = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:4174") {
      externalRequests.add(url.href);
    }
  });

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Your Training Plan" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Coach Agent connection: unavailable" }),
  ).toBeVisible();
  await expect(page.getByText("Plan version 1")).toBeVisible();
  expect([...externalRequests]).toEqual([]);
});

test("keeps the built candidate chartable through Trends and the Workout round trip", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/#trends");

  const chart = page.locator('[data-chart-card="hrv"]');
  await expect(chart).toBeVisible();
  await expect(chart.locator("[data-chart-current-value]")).toHaveAttribute(
    "aria-label",
    "55 ms",
  );
  await expect(
    chart.getByText("1 of 7 nights recorded", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/issue-63-hrv-static-mobile.png",
    fullPage: true,
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#today");
  await page.getByRole("button", { name: "Month" }).click();
  const workout = page.getByRole("button", {
    name: /18 km long run, 2026-08-30/,
  });
  await workout.scrollIntoViewIfNeeded();
  const origin = await page.evaluate(
    () =>
      new Promise<{ hash: string }>((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve({ hash: location.hash })),
        );
      }),
  );
  const originLabel =
    origin.hash === "#trends"
      ? "Trends"
      : origin.hash === "#coaching"
        ? "Coaching"
        : "Today";
  await workout.click();
  await expect(
    page.getByRole("main", { name: "Planned Workout" }),
  ).toBeVisible();
  await page.getByRole("button", { name: `Back to ${originLabel}` }).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe(origin.hash);
  await expect(workout).toBeFocused();
});

test("serves the completed Workout Result proof from the static candidate", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#workout/planned-2026-08-06-threshold");

  const screen = page.getByRole("main", { name: "Workout Result" });
  await expect(screen.getByText("COMPLETED", { exact: true })).toBeVisible();
  await expect(
    screen.getByText("Source: seeded synthetic COROS-shaped Workout Result"),
  ).toBeVisible();
  await expect(screen.locator("svg[data-result-detail-chart]")).toBeVisible();
  await expect(screen.locator("[data-result-lap-bar]")).toHaveCount(5);
  await expect(screen.getByText("Previous attempts")).not.toBeVisible();

  const splits = screen.locator("details");
  await splits.locator("summary").click();
  await expect(splits.getByRole("cell", { name: "6:00/km" })).toBeVisible();
  await expect(
    splits.getByRole("cell", { name: "2 km" }).first(),
  ).toBeVisible();
  await expect(splits.getByRole("cell", { name: "130 bpm" })).toBeVisible();
  await expect(
    splits.getByRole("cell", { name: "Not recorded" }).last(),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);

  await page.getByRole("button", { name: "Back to Today" }).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#today");
  await expect(screen).not.toBeAttached();
});
