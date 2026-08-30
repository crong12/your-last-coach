import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("your-last-coach.demo-guide.v1", "seen");
  });
});

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

test("renders the selector-backed planned composition and suspends the app", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#workout/planned-2026-08-26-threshold");

  const screen = page.getByRole("main", { name: "Planned Workout" });
  await expect(screen.getByText("26 August 2026")).toBeVisible();
  await expect(screen.getByText("Threshold", { exact: true })).toBeVisible();
  await expect(screen.getByText("PLANNED", { exact: true })).toBeVisible();
  await expect(
    screen.getByRole("heading", { name: "Coach’s intent" }),
  ).toBeVisible();
  await expect(
    screen.getByText("Develop threshold pace under control"),
  ).toBeVisible();
  await expect(screen.getByText("Warm-up", { exact: true })).toBeVisible();
  await expect(screen.getByText("Main set", { exact: true })).toBeVisible();
  await expect(screen.getByText("Cool-down", { exact: true })).toBeVisible();
  await expect(
    screen.getByRole("cell", { name: "4:35–4:40/km" }),
  ).toBeVisible();
  await expect(screen.getByRole("cell", { name: "13 km" })).toBeVisible();
  await expect(
    screen.getByRole("cell", {
      name: "90 seconds easy jog between repetitions",
    }),
  ).toBeVisible();
  await expect(
    screen.getByRole("cell", { name: "No separate guidance recorded" }),
  ).toBeVisible();
  await expect(
    screen.getByRole("cell", { name: "No duration recorded" }),
  ).toBeVisible();

  const underlay = page.locator(".app-underlay");
  await expect(underlay).toHaveAttribute("inert", "");
  await expect(underlay).toHaveAttribute("aria-hidden", "true");
  await expect(
    screen.getByRole("heading", { name: "5 × 1 km threshold" }),
  ).toBeFocused();

  await page.reload();
  await expect(
    page.getByRole("main", { name: "Planned Workout" }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => location.hash))
    .toBe("#workout/planned-2026-08-26-threshold");
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
    .getByRole("button", { name: /5 × 1 km threshold, 2026-08-26/ })
    .click();

  const animations = await page
    .getByRole("main", { name: "Planned Workout" })
    .evaluate((element) => element.getAnimations().length);
  expect(animations).toBe(0);
});
