import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("your-last-coach.demo-guide.v1", "seen");
  });
});

test("offers a fixed four-week Trends range control", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/#trends");

  const control = page.getByRole("group", { name: "Trends range" });
  await expect(control).toBeVisible();
  await expect(control.getByRole("button")).toHaveText(["4w"]);
  await expect(control.getByRole("button", { name: "4w" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const rangeHeights = await control
    .getByRole("button")
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height),
    );
  expect(rangeHeights.every((height) => height >= 44)).toBe(true);
  await page.screenshot({
    path: "/tmp/issue-64-trends-mobile.png",
    fullPage: true,
  });
});

test("links every Trends chart and card to the four-week range on mobile @contract", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/#trends");

  const pane = page.locator(".trends-pane");
  await expect(pane).toHaveAttribute("data-trends-range", "4w");
  await expect(page.locator("[data-trends-group]")).toHaveCount(2);
  await expect(
    page.locator('[data-chart-card="hrv"] [data-chart-point]'),
  ).toHaveCount(28);
  await expect(
    page.locator('[data-chart-card="resting-heart-rate"] [data-chart-point]'),
  ).toHaveCount(28);
  await expect(
    page.locator('[data-chart-card="sleep"] [data-sleep-night]'),
  ).toHaveCount(28);
  await expect(
    page.locator('[data-chart-card="volume-load"] [data-volume-week]'),
  ).toHaveCount(4);

  await expect(
    page.locator(
      '[data-chart-card="pace-heart-rate"] [data-pace-heart-rate-point]',
    ),
  ).toHaveCount(15);
  const cardWidths = await page
    .locator(".trends-pane .chart-card")
    .evaluateAll((cards) =>
      cards.map((card) => ({
        scrollWidth: card.scrollWidth,
        clientWidth: card.clientWidth,
      })),
    );
  expect(
    cardWidths.every(
      ({ scrollWidth, clientWidth }) => scrollWidth <= clientWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".workspace-panes")
      .evaluate((element) => getComputedStyle(element).scrollSnapType),
  ).toContain("x");
});

test("inspects missing evidence and restores the Workout Result push on mobile @contract", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/#trends");

  const hrv = page.locator('[data-chart-card="hrv"]');
  await hrv
    .getByRole("button", { name: "Inspect HRV for 25 August, no recording" })
    .click();
  await expect(hrv.locator('[data-chart-readout="hrv"]')).toHaveText(
    "25 Aug · No recording",
  );

  const sleep = page.locator('[data-chart-card="sleep"]');
  const missingNight = sleep.locator(
    '[data-sleep-night][data-chart-date="2026-08-24"]',
  );
  await missingNight.focus();
  await missingNight.press("Enter");
  await expect(sleep.locator('[data-chart-readout="sleep"]')).toContainText(
    "24 Aug · No recording",
  );

  const pace = page.locator('[data-chart-card="pace-heart-rate"]');
  const paceAction = pace.locator("[data-pace-view-workout]");
  await expect(paceAction).toBeVisible();
  const paceActionId = await paceAction.getAttribute("id");
  await paceAction.click();
  await expect(
    page.getByRole("main", { name: "Workout Result" }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => location.hash))
    .toBe("#workout/planned-2026-08-26-threshold");
  await page.getByRole("button", { name: "Back to Trends" }).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#trends");
  await expect(page.locator(`#${paceActionId}`)).toBeFocused();
});

test("keeps a valid empty Workout Result range as an honest zero series", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/#today");
  await page.waitForSelector(".app-shell");
  await page.evaluate(() => {
    const key = "your-last-coach.workspace.v1";
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error("Workspace envelope was not persisted");
    const envelope = JSON.parse(raw) as {
      state: {
        workoutResults: unknown[];
        athleteFeedback: unknown[];
        coachingTopics: unknown[];
      };
    };
    envelope.state.workoutResults = [];
    envelope.state.athleteFeedback = [];
    envelope.state.coachingTopics = [];
    localStorage.setItem(key, JSON.stringify(envelope));
  });
  await page.reload();
  await page.goto("/#trends");

  const volume = page.locator('[data-chart-card="volume-load"]');
  await expect(volume.locator('[data-chart-readout="volume-load"]')).toHaveText(
    "No Workout Results in this range",
  );
  await expect(volume.locator("[data-volume-bar]")).toHaveCount(4);
  await expect(volume.locator("[data-load-bar]")).toHaveCount(4);
  await expect(volume.locator("[data-volume-current]")).toHaveText("0.0 km");
  await expect(volume.locator("[data-load-current]")).toHaveText("0");
  const zeroBarHeights = await volume
    .locator("[data-volume-bar], [data-load-bar]")
    .evaluateAll((bars) =>
      bars.map((bar) => Number(bar.getAttribute("height"))),
    );
  expect(zeroBarHeights.every((height) => height === 0)).toBe(true);
});

test("keeps distance visible while an unavailable Workout Result load is marked degraded @contract", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#today");
  await page.waitForSelector(".app-shell");
  await page.evaluate(() => {
    const key = "your-last-coach.workspace.v1";
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error("Workspace envelope was not persisted");
    const envelope = JSON.parse(raw) as {
      state: {
        workoutResults: Array<{ summary: Record<string, unknown> }>;
      };
    };
    const recovery = envelope.state.workoutResults.find(
      (result: { id?: string }) => result.id === "result-2026-08-24",
    );
    if (!recovery) throw new Error("Workout Result was not found");
    delete recovery.summary.trainingLoad;
    localStorage.setItem(key, JSON.stringify(envelope));
  });
  await page.reload();
  await page.goto("/#trends");

  const volume = page.locator('[data-chart-card="volume-load"]');
  await expect(volume.locator("[data-missing-load]")).toHaveCount(2);
  await expect(volume.locator("[data-volume-current]")).toHaveText("13.0 km");
  await expect(volume.locator("[data-load-current]")).toHaveText("—");
  await expect(volume).toContainText(
    "13 of 16 Workout Results with available load",
  );
});

async function seedAdaptationReceipt(page: Page) {
  await page.goto("/#today");
  await page.waitForSelector(".app-shell");
  await page.evaluate(() => {
    const key = "your-last-coach.workspace.v1";
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error("Workspace envelope was not persisted");
    const envelope = JSON.parse(raw) as {
      state: {
        clock: { now: string };
        trainingPlan: {
          planVersion: number;
          plannedWorkouts: Array<Record<string, unknown>>;
        };
        appliedReviewIds: string[];
        adaptationReceipts: unknown[];
        mutationHistory: unknown[];
      };
    };
    const workout = envelope.state.trainingPlan.plannedWorkouts.find(
      (candidate) => candidate.id === "planned-2026-08-26-threshold",
    );
    if (!workout) throw new Error("Threshold Workout was not found");
    const receipt = {
      reviewId: "review-trends",
      selectedOption: { optionId: "reduce-load", label: "Reduce load" },
      affectedWorkouts: [
        {
          workoutId: workout.id,
          before: structuredClone(workout),
          after: structuredClone(workout),
        },
      ],
      appliedAt: "2026-08-20T10:00:00+01:00",
      planVersionBefore: 1,
      planVersionAfter: 2,
      evidenceRefs: ["workout-result:result-2026-08-23"],
    };
    envelope.state.trainingPlan.planVersion = 2;
    envelope.state.appliedReviewIds = ["review-trends"];
    envelope.state.adaptationReceipts = [receipt];
    envelope.state.mutationHistory = [
      {
        id: "plan-adaptation:review-trends",
        kind: "plan_adaptation",
        occurredAt: envelope.state.clock.now,
      },
    ];
    localStorage.setItem(key, JSON.stringify(envelope));
  });
  await page.reload();
  await page.goto("/#trends");
  await expect(page.locator('[data-chart-card="hrv"]')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("your-last-coach.workspace.v1");
        return raw
          ? (JSON.parse(raw).state.adaptationReceipts as unknown[]).length
          : 0;
      }),
    )
    .toBe(1);
}

test("keeps passive phase markers non-focusable while adaptations are interactive @contract", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedAdaptationReceipt(page);

  const hrv = page.locator('[data-chart-card="hrv"]');
  const adaptation = hrv.locator('[data-chart-annotation-kind="adaptation"]');
  await expect(adaptation).toHaveAttribute("role", "button");
  await expect(adaptation).toHaveAttribute("tabindex", "0");
  await expect(hrv.locator('[data-chart-annotation-kind="phase"]')).toHaveCount(
    2,
  );
  await expect(hrv.locator('[data-chart-annotation-kind="race"]')).toHaveCount(
    0,
  );
  await expect(page.locator('[data-chart-card="hrv"] svg').first()).toHaveCount(
    1,
  );
  expect(
    await page
      .locator('[data-chart-card="hrv"] svg')
      .first()
      .evaluate((svg) => svg.getAnimations().length),
  ).toBe(0);

  await adaptation.focus();
  await adaptation.press("Enter");
  await expect(hrv.locator('[data-chart-readout="hrv"]')).toContainText(
    "Approved adaptation: Reduce load",
  );
  await hrv.getByRole("button", { name: "View adaptation" }).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#coaching");
  await expect(
    page.locator("#coaching-entry-approved-adaptation-review-trends"),
  ).toBeFocused();

  await page.goto("/#trends");
  const phase = hrv.locator('[data-chart-annotation-kind="phase"]').first();
  await expect(phase).toHaveCount(1);
  expect(await phase.getAttribute("tabindex")).toBeNull();
  expect(await phase.getAttribute("role")).toBeNull();
  const latestPoint = hrv.getByRole("button", {
    name: "Inspect HRV for 26 August, 55 ms",
  });
  await latestPoint.focus();
  await latestPoint.press("Enter");
  await expect(hrv.locator('[data-chart-readout="hrv"]')).toContainText(
    "26 Aug · 55 ms",
  );
  await page.screenshot({
    path: "/tmp/issue-64-trends-desktop.png",
    fullPage: true,
  });
});

test("keeps the desktop Trends evidence bounded and restores Workout Result focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#trends");
  const navigation = page.getByRole("navigation", {
    name: "Workspace sections",
  });
  await navigation.getByRole("button", { name: "Show Trends pane" }).click();
  await expect
    .poll(() =>
      page
        .getByRole("region", { name: "Trends" })
        .evaluate((element) => element.getBoundingClientRect().top),
    )
    .toBeLessThanOrEqual(150);

  await expect(page.locator(".trends-pane")).toHaveAttribute(
    "data-trends-range",
    "4w",
  );

  const evidenceDates = await page
    .locator(
      '[data-chart-card="hrv"] [data-chart-point], [data-chart-card="resting-heart-rate"] [data-chart-point], [data-chart-card="sleep"] [data-sleep-night], [data-chart-card="volume-load"] [data-volume-week], [data-chart-card="volume-load"] [data-missing-load]',
    )
    .evaluateAll((elements) =>
      elements
        .map(
          (element) =>
            element.getAttribute("data-chart-date") ??
            element.getAttribute("data-chart-week"),
        )
        .filter((date): date is string => date !== null),
    );
  expect(evidenceDates.every((date) => date <= "2026-08-26")).toBe(true);

  const hrv = page.locator('[data-chart-card="hrv"]');
  for (const chartId of [
    "hrv",
    "resting-heart-rate",
    "sleep",
    "volume-load",
    "pace-heart-rate",
  ]) {
    const description = page.locator(`[data-chart-card="${chartId}"] desc`);
    await expect(description).toContainText("Current:");
    await expect(description).toContainText("Direction:");
    await expect(description).toContainText("Coverage:");
  }
  await expect(hrv.locator("desc")).toContainText("Base building");
  await expect(
    page.locator('[data-chart-card="volume-load"] desc'),
  ).toContainText("Base building");

  await expect(
    navigation.getByRole("button", { name: "Show Trends pane" }),
  ).toHaveAttribute("aria-current", "page");

  const paceAction = page.locator(
    '[data-chart-card="pace-heart-rate"] [data-pace-view-workout]',
  );
  const paceActionId = await paceAction.getAttribute("id");
  await paceAction.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await paceAction.click();
  await expect(
    page.getByRole("main", { name: "Workout Result" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to Trends" }).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#trends");
  await expect(page.locator(`#${paceActionId}`)).toBeFocused();
});

test("lays Trends out on a grid at the judging width without overlapping controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 880, height: 900 });
  await page.goto("/#trends");

  // Two columns: HRV and Resting heart rate share a row, Sleep takes its own.
  const [hrv, restingHeartRate, sleep] = await Promise.all([
    page.locator('[data-chart-card="hrv"]').boundingBox(),
    page.locator('[data-chart-card="resting-heart-rate"]').boundingBox(),
    page.locator('[data-chart-card="sleep"]').boundingBox(),
  ]);
  expect(hrv!.y).toBeCloseTo(restingHeartRate!.y, 0);
  expect(hrv!.x + hrv!.width).toBeLessThanOrEqual(restingHeartRate!.x + 1);
  expect(sleep!.y).toBeGreaterThan(hrv!.y + hrv!.height - 1);
  expect(sleep!.width).toBeGreaterThan(hrv!.width * 1.8);

  // The arrival strip leads the pane, ahead of the first evidence card.
  const arriving = await page
    .getByRole("heading", { name: "Your health metrics" })
    .boundingBox();
  expect(arriving!.y).toBeLessThan(hrv!.y);

  // It is rendered once, not duplicated by the promotion.
  await expect(
    page.getByRole("heading", { name: "Your health metrics" }),
  ).toHaveCount(1);

  // The chart card header stops overlapping once the card is paired: the
  // metric name and the current value occupy separate boxes.
  const [metric, current] = await Promise.all([
    page.locator('[data-chart-card="hrv"] .chart-card__metric').boundingBox(),
    page
      .locator('[data-chart-card="hrv"] [data-chart-current-value]')
      .boundingBox(),
  ]);
  expect(metric!.x + metric!.width).toBeLessThanOrEqual(current!.x + 1);
});

test("keeps the scroll-snap layout and card order on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#trends");

  await expect(
    page.getByRole("navigation", { name: "Workspace sections" }),
  ).toBeVisible();
  await expect(page.locator(".pane-nav .pane-nav__dot").first()).toBeVisible();
  await expect(page.locator("header.topbar .pane-nav")).toHaveCount(0);

  // All three panes stay in the scroll-snap track rather than being switched.
  await expect(page.getByRole("region", { name: "Today" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Trends" })).toBeVisible();

  // Single column, original order: the charts precede the arrival strip.
  const [hrv, restingHeartRate, arriving] = await Promise.all([
    page.locator('[data-chart-card="hrv"]').boundingBox(),
    page.locator('[data-chart-card="resting-heart-rate"]').boundingBox(),
    page.getByRole("heading", { name: "Your health metrics" }).boundingBox(),
  ]);
  expect(restingHeartRate!.y).toBeGreaterThan(hrv!.y + hrv!.height - 1);
  expect(arriving!.y).toBeGreaterThan(hrv!.y);

  // The toggle stays inside the pane body so it can remain pinned on scroll.
  await expect(
    page.locator(".trends-pane .trends-range-control"),
  ).toBeVisible();
});
