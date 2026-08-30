import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("your-last-coach.demo-guide.v1", "seen");
  });
});

async function captureWorkoutScreen(page: Page, path: string) {
  await page.evaluate(() => {
    const underlay = document.querySelector<HTMLElement>(".app-underlay");
    const screen = document.querySelector<HTMLElement>(".workout-screen");
    if (!underlay || !screen) throw new Error("Workout screen is not mounted");
    underlay.style.display = "none";
    Object.assign(screen.style, {
      position: "relative",
      inset: "auto",
      width: "100%",
      height: "auto",
      maxHeight: "none",
      overflow: "visible",
    });
    document.body.style.overflow = "visible";
    screen.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path, fullPage: true });
}

test("pushes a mobile Workout screen and restores its exact origin", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#today");
  await page.getByRole("button", { name: "Month" }).click();
  const workout = page.getByRole("button", {
    name: /18 km long run, 2026-08-30/,
  });
  await workout.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    history.replaceState({ preserved: "keep-me" }, "", location.href);
  });
  const origin = await page.evaluate(() => ({
    historyLength: history.length,
    scrollY: window.scrollY,
    paneScrollLeft:
      document.querySelector<HTMLElement>(".workspace-panes")!.scrollLeft,
  }));

  await workout.click();

  await expect
    .poll(() => page.evaluate(() => location.hash))
    .toBe("#workout/planned-2026-08-30-long");
  expect(await page.evaluate(() => history.length)).toBe(
    origin.historyLength + 1,
  );
  const screen = page.getByRole("main", { name: "Planned Workout" });
  await expect(screen).toBeVisible();
  await expect(screen).toHaveCSS("position", "fixed");
  expect(await screen.boundingBox()).toEqual({
    x: 0,
    y: 0,
    width: 390,
    height: 844,
  });
  expect(await page.evaluate(() => history.scrollRestoration)).toBe("manual");
  expect(await page.evaluate(() => history.state.preserved)).toBe("keep-me");
  expect(
    await page.evaluate(() => history.state.yourLastCoachNavigation?.version),
  ).toBe(1);

  await page.goBack();

  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#today");
  await expect
    .poll(() =>
      page.evaluate(() => ({
        scrollY: window.scrollY,
        paneScrollLeft:
          document.querySelector<HTMLElement>(".workspace-panes")!.scrollLeft,
      })),
    )
    .toEqual({
      scrollY: origin.scrollY,
      paneScrollLeft: origin.paneScrollLeft,
    });
  await expect(workout).toBeFocused();
});

test("restores a direct Workout link through reload and returns safely to Today", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#workout/planned-2026-08-30-long");

  const screen = page.getByRole("main", { name: "Planned Workout" });
  await expect(screen).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "18 km long run" }),
  ).toBeFocused();

  await page.reload();

  await expect(screen).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => location.hash))
    .toBe("#workout/planned-2026-08-30-long");
  await page.getByRole("button", { name: "Back to Today" }).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#today");
  await expect(screen).not.toBeAttached();
});

test("renders the selector-backed partial result composition and suspends the app", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#workout/planned-2026-08-26-threshold");

  const screen = page.getByRole("main", { name: "Workout Result" });
  await expect(screen.getByText("26 August 2026")).toBeVisible();
  await expect(screen.getByText("Threshold", { exact: true })).toBeVisible();
  await expect(screen.getByText("PARTIAL", { exact: true })).toBeVisible();
  await expect(screen.getByText("7.5 km", { exact: true })).toBeVisible();
  await expect(
    screen.getByText("No duration recorded", { exact: true }),
  ).toBeVisible();
  await expect(
    screen.getByText("No average pace recorded", { exact: true }),
  ).toBeVisible();
  await expect(
    screen.getByText("No average HR recorded", { exact: true }),
  ).toBeVisible();
  await expect(
    screen.getByText("No Training Load recorded", { exact: true }),
  ).toBeVisible();
  await expect(
    screen.getByRole("heading", { name: "Plan versus actual" }),
  ).toBeVisible();
  await expect(
    screen.getByText("3 of 5 completed", { exact: true }),
  ).toBeVisible();
  await expect(screen.locator("svg[data-result-detail-chart]")).toBeVisible();
  await expect(screen.locator("[data-result-lap-bar]")).toHaveCount(3);
  await expect(screen.locator("[data-result-chart-readout]")).toContainText(
    "Lap 1",
  );
  await expect(screen.locator("summary", { hasText: "Splits" })).toBeVisible();
  await expect(screen.locator("details")).not.toHaveAttribute("open", "");
  await expect(
    screen.getByText("Source: seeded synthetic COROS-shaped Workout Result"),
  ).not.toBeAttached();

  const underlay = page.locator(".app-underlay");
  await expect(underlay).toHaveAttribute("inert", "");
  await expect(underlay).toHaveAttribute("aria-hidden", "true");
  await expect(
    screen.getByRole("heading", { name: "5 × 1 km threshold" }),
  ).toBeFocused();

  await page.reload();
  await expect(
    page.getByRole("main", { name: "Workout Result" }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => location.hash))
    .toBe("#workout/planned-2026-08-26-threshold");
});

test("renders the provenance-labelled completed result with recorded chart and exact Splits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#workout/planned-2026-08-06-threshold");

  const screen = page.getByRole("main", { name: "Workout Result" });
  await expect(
    screen.getByText("6 August 2026", { exact: true }),
  ).toBeVisible();
  await expect(screen.getByText("COMPLETED", { exact: true })).toBeVisible();
  await expect(
    screen.getByText("Source: seeded synthetic COROS-shaped Workout Result"),
  ).toBeVisible();
  await expect(screen.getByText("11 km", { exact: true })).toBeVisible();
  await expect(screen.getByText("1:00:00", { exact: true })).toBeVisible();
  await expect(screen.getByText("5:27/km", { exact: true })).toBeVisible();
  await expect(screen.getByText("Derived", { exact: true })).toBeVisible();
  await expect(
    screen.getByText("No average HR recorded", { exact: true }),
  ).toBeVisible();
  await expect(
    screen.getByText("No Training Load recorded", { exact: true }),
  ).toBeVisible();
  await expect(screen.locator("svg[data-result-detail-chart]")).toBeVisible();
  await expect(screen.locator("[data-result-lap-bar]")).toHaveCount(5);
  await expect(screen.getByText("5 of 5 laps with pace")).toBeVisible();
  await expect(screen.getByText("5 of 5 laps with average HR")).toBeVisible();
  const firstLapTarget = screen.locator("[data-result-lap-target]").first();
  const firstLapBox = await firstLapTarget.boundingBox();
  expect(firstLapBox?.width).toBeGreaterThanOrEqual(44);
  expect(firstLapBox?.height).toBeGreaterThanOrEqual(44);
  await firstLapTarget.press("Enter");
  await expect(screen.locator("[data-result-chart-readout]")).toContainText(
    "Lap 1",
  );
  await screen.locator("[data-result-lap-target]").last().click();
  await expect(screen.locator("[data-result-chart-readout]")).toContainText(
    "Lap 5",
  );

  const splits = screen.locator("details");
  await expect(splits).not.toHaveAttribute("open", "");
  await splits.locator("summary").click();
  await expect(splits.getByRole("columnheader", { name: "Lap" })).toBeVisible();
  await expect(splits.getByRole("cell", { name: "6:00/km" })).toBeVisible();
  await expect(splits.getByRole("cell", { name: "2 km" }).last()).toBeVisible();
  await expect(
    splits.getByRole("cell", { name: "Not recorded" }).last(),
  ).toBeVisible();
  await captureWorkoutScreen(page, "/tmp/issue-67-completed-mobile.png");
});

test("captures the completed Workout Result at the desktop review size", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#workout/planned-2026-08-06-threshold");

  const screen = page.getByRole("main", { name: "Workout Result" });
  await expect(screen).toBeVisible();
  await expect(screen.locator("[data-result-lap-bar]")).toHaveCount(5);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(1280);
  await captureWorkoutScreen(page, "/tmp/issue-67-completed-desktop.png");
});

test("renders a completed empty-lap result without fabricating chart or table", async ({
  page,
}) => {
  await page.goto("/#workout/planned-2026-08-13-easy");

  const screen = page.getByRole("main", { name: "Workout Result" });
  await expect(screen.getByText("COMPLETED", { exact: true })).toBeVisible();
  await expect(
    screen.getByText("No lap data recorded", { exact: true }),
  ).toBeVisible();
  await expect(screen.locator("svg[data-result-detail-chart]")).toHaveCount(0);
  await expect(screen.locator("details")).toHaveCount(0);
});

test("pushes a previous same-type attempt and restores the comparison row focus on Back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#workout/planned-2026-08-06-threshold");

  const screen = page.getByRole("main", { name: "Workout Result" });
  const previousRow = screen.getByRole("button", {
    name: /previous attempt 26 August 2026.*7\.5 km/i,
  });
  await expect(previousRow).toBeVisible();
  await previousRow.click();
  await expect
    .poll(() => page.evaluate(() => location.hash))
    .toBe("#workout/planned-2026-08-26-threshold");
  await expect(page.getByText("PARTIAL", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Back to Threshold intervals" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to Threshold intervals" })
    .click();
  await expect
    .poll(() => page.evaluate(() => location.hash))
    .toBe("#workout/planned-2026-08-06-threshold");
  await expect(
    page.getByRole("button", {
      name: /previous attempt 26 August 2026.*7\.5 km/i,
    }),
  ).toBeFocused();
});

test("records workout feedback through the shared application state and Coaching timeline", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#workout/planned-2026-08-06-threshold");
  const screen = page.getByRole("main", { name: "Workout Result" });

  await screen.getByRole("button", { name: "Add feedback" }).click();
  const form = screen.getByRole("form", { name: "Add Athlete Feedback" });
  await form
    .getByRole("textbox", { name: "Athlete Feedback" })
    .fill("The completed session felt controlled.");
  await form.getByRole("button", { name: "Save feedback" }).click();

  await expect(
    screen.getByText("The completed session felt controlled."),
  ).toBeVisible();
  await screen.getByRole("button", { name: "Back to Today" }).click();
  await page.getByRole("button", { name: "Show Coaching pane" }).click();
  const timeline = page.getByRole("region", { name: "Coaching timeline" });
  await expect(
    timeline.getByText("The completed session felt controlled."),
  ).toBeVisible();
});

test("renders honest unavailable targets for a simple Planned Workout", async ({
  page,
}) => {
  await page.goto("/#workout/planned-2026-08-30-long");
  const screen = page.getByRole("main", { name: "Planned Workout" });

  await expect(
    screen.getByRole("cell", { name: "No separate pace target recorded" }),
  ).toBeVisible();
  await expect(
    screen.getByRole("cell", {
      name: "No separate recovery protocol recorded",
    }),
  ).toBeVisible();
  await expect(screen.getByText("Main set", { exact: true })).toBeVisible();
});

test("canonicalizes malformed and unknown Workout routes to Today", async ({
  page,
}) => {
  for (const route of [
    "#workout/",
    "#workout/one/two",
    "#workout/%E0%A4%A",
    "#workout/not-a-planned-workout",
  ]) {
    await page.goto(`/${route}`);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("#today");
    await expect(
      page.getByRole("main", { name: "Planned Workout" }),
    ).not.toBeAttached();
    await expect(page.getByRole("region", { name: "Today" })).toBeVisible();
  }
});

test("restores a desktop origin through visible back and browser forward", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#today");
  await page.getByRole("button", { name: "Month" }).click();
  const workout = page.getByRole("button", {
    name: /18 km long run, 2026-08-30/,
  });
  await workout.scrollIntoViewIfNeeded();
  const origin = await page.evaluate(
    () =>
      new Promise<{ hash: string; scrollY: number }>((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            resolve({ hash: location.hash, scrollY: window.scrollY }),
          ),
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
  await expect
    .poll(() => page.evaluate(() => location.hash))
    .toBe("#workout/planned-2026-08-30-long");
  expect(
    await page.locator(".workout-screen__back").getAttribute("aria-label"),
  ).toBe(`Back to ${originLabel}`);
  await page.getByRole("button", { name: `Back to ${originLabel}` }).click();

  await expect.poll(() => page.evaluate(() => location.hash)).toBe(origin.hash);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(origin.scrollY);
  await expect(workout).toBeFocused();

  await page.goForward();
  await expect
    .poll(() => page.evaluate(() => location.hash))
    .toBe("#workout/planned-2026-08-30-long");
  await expect(
    page.getByRole("main", { name: "Planned Workout" }),
  ).toBeVisible();
});

test("keeps hidden app controls out of the Workout screen tab order", async ({
  page,
}) => {
  await page.goto("/#workout/planned-2026-08-30-long");

  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() =>
        document.activeElement?.closest(".app-underlay")
          ? "underlay"
          : "screen",
      ),
    ).toBe("screen");
  }
});

test("uses cuts for the pushed screen when reduced motion is requested", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#today");
  await page
    .getByRole("button", { name: /18 km long run, 2026-08-30/ })
    .click();

  const animations = await page
    .getByRole("main", { name: "Planned Workout" })
    .evaluate((element) => element.getAnimations().length);
  expect(animations).toBe(0);
});
