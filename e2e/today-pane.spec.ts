import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("your-last-coach.demo-guide.v1", "seen");
  });
});

function pendingProposal() {
  const prescription = (distanceKm: number) => ({
    blocks: [{ kind: "easy", distanceKm }],
  });
  return {
    reviewId: "review:today-pane",
    sourceWorkoutId: "planned-2026-08-26-threshold",
    expectedPlanVersion: 1,
    evidenceRefs: [
      "planned-workout:planned-2026-08-26-threshold",
      "workout-result:result-2026-08-26-threshold",
      "observation:training-load",
      "observation:recovery",
    ],
    rationale: {
      summary: "Your incomplete session points to accumulated fatigue.",
      counterEvidence: "Sleep and recovery remain close to your usual range.",
      confidence: "moderate" as const,
      limitations: ["One session cannot establish the cause."],
    },
    recommended: {
      optionId: "recovery-first",
      label: "Recovery first",
      summary: "Reduce the next recovery session.",
      tradeoff: "Loses a little weekly volume.",
      workoutChanges: [
        {
          kind: "update" as const,
          workoutId: "planned-2026-08-27-recovery",
          changes: {
            title: "5 km easy",
            purpose: "Keep the run relaxed.",
            distanceKm: 5,
            prescription: prescription(5),
          },
        },
      ],
    },
    alternative: {
      optionId: "keep-the-rhythm",
      label: "Keep the rhythm",
      summary: "Keep the current recovery session.",
      tradeoff: "Provides less recovery.",
      workoutChanges: [
        {
          kind: "update" as const,
          workoutId: "planned-2026-08-27-recovery",
          changes: {
            title: "6 km recovery",
            purpose: "Recover from threshold work.",
            distanceKm: 6,
            prescription: prescription(6),
          },
        },
      ],
    },
  };
}

async function installFallbackHarness(page: Page) {
  await page.addInitScript(() => {
    const registrations: Array<{
      tool: {
        name: string;
        execute: (
          input: Record<string, unknown>,
          options: { signal: AbortSignal },
        ) => Promise<unknown>;
      };
    }> = [];
    Object.defineProperty(window, "__webMcpHarness", {
      configurable: true,
      value: { registrations },
    });
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        async registerTool(tool: (typeof registrations)[number]["tool"]) {
          registrations.push({ tool });
        },
      },
    });
  });
}

async function runFallbackTool(
  page: Page,
  proposal: ReturnType<typeof pendingProposal>,
) {
  return page.evaluate(async (reviewProposal) => {
    const registrations = (
      window as unknown as {
        __webMcpHarness: {
          registrations: Array<{
            tool: {
              name: string;
              execute: (
                input: Record<string, unknown>,
                options: { signal: AbortSignal },
              ) => Promise<unknown>;
            };
          }>;
        };
      }
    ).__webMcpHarness.registrations;
    const tool = registrations.find(
      ({ tool: registered }) =>
        registered.name === "open_workout_adaptation_review",
    )?.tool;
    if (!tool) throw new Error("Fallback review tool was not registered");
    return tool.execute(reviewProposal, {
      signal: new AbortController().signal,
    });
  }, proposal);
}

test("renders the normal Today pane on mobile with seven honest day tiles", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#today");

  const today = page.getByRole("region", { name: "Overview" });
  await expect(today.locator(".today-pane")).toBeVisible();
  await expect(
    today.getByRole("heading", { name: "Brighton Marathon" }),
  ).toBeVisible();
  await expect(today.locator(".today-countdown__number")).toHaveText("221");
  await expect(today.getByRole("progressbar")).toHaveAttribute(
    "aria-valuetext",
    "Day 26 of 247; Aerobic development",
  );
  await expect(
    today.getByText("AEROBIC DEVELOPMENT · DAY 26 OF 247"),
  ).toBeVisible();

  const resultCard = today.locator(".today-workout-card");
  await expect(resultCard.getByText("PARTIAL", { exact: true })).toHaveCount(0);
  await expect(resultCard.getByText("41:28", { exact: true })).toBeVisible();
  await expect(resultCard.getByText("5:55/km", { exact: true })).toBeVisible();
  await expect(resultCard.getByText("152 bpm", { exact: true })).toBeVisible();
  await expect(
    resultCard.getByText("Training Load", { exact: true }),
  ).toHaveCount(0);

  const tiles = today.locator(".today-week-day");
  await expect(tiles).toHaveCount(7);
  await expect(today.locator(".today-week-day--completed")).toHaveCount(1);
  await expect(today.locator(".today-week-day--partial")).toHaveCount(1);
  await expect(today.locator(".today-week-day--upcoming")).toHaveCount(3);
  await expect(today.locator(".today-week-day--rest")).toHaveCount(2);
  await expect(today.locator(".today-week-day--rest button")).toHaveCount(0);
  await expect(today.getByText("Monday 24 August")).toBeVisible();
  await expect(today.getByText("Sunday 30 August")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect(
    await today.locator(".today-week-grid").evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    })),
  ).toEqual(expect.objectContaining({ scrollWidth: expect.any(Number) }));
  const weekWidth = await today
    .locator(".today-week-grid")
    .evaluate((element) => element.scrollWidth <= element.clientWidth);
  expect(weekWidth).toBe(true);
  await today.screenshot({ path: "/tmp/issue-62-today-mobile.png" });
});

test("switches the Overview calendar from week to month and opens a historical workout @contract", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/#today");

  await page.getByRole("button", { name: "Show month calendar" }).click();

  const calendar = page.getByRole("region", { name: "August 2026" });
  await expect(calendar).toBeVisible();
  await expect(calendar.locator(".today-month-day")).toHaveCount(31);
  await expect(calendar.getByText("MISSED", { exact: true })).toHaveCount(0);
  await expect(
    calendar.locator('.today-month-day[aria-current="date"]'),
  ).toContainText("26");
  await expect(
    page.getByRole("button", { name: "Show month calendar" }),
  ).toHaveAttribute("aria-pressed", "true");
  await calendar
    .getByRole("button", { name: /Sunday 23 August, 20 km long run/ })
    .click();
  await expect
    .poll(() => page.evaluate(() => location.hash))
    .toBe("#workout/planned-2026-08-23-long");
  await expect(
    page.getByRole("main", { name: "Workout Result" }),
  ).toBeVisible();
});

test("contains the Today 5+2 layout at 360px without nested horizontal scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/#today");

  const today = page.getByRole("region", { name: "Overview" });
  await expect(today.locator(".today-pane")).toBeVisible();
  await expect(today.locator(".today-week-grid")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
  expect(
    await today
      .locator(".today-week-grid")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  expect(
    await today
      .locator(".today-week-day:nth-child(6)")
      .evaluate((element) => getComputedStyle(element).gridColumn),
  ).toContain("span 2");
});

test("reopens the pending proposal from the Overview signal @contract", async ({
  page,
}) => {
  await installFallbackHarness(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#today");

  await runFallbackTool(page, pendingProposal());
  await page
    .getByRole("main", { name: "Workout Adaptation review" })
    .getByRole("button", { name: "Back to Overview" })
    .click();
  const signal = page.locator("#today-pending-proposal");
  await expect(signal).toBeVisible();
  await expect(signal).toContainText("1 proposal awaiting your review");

  await signal.click();
  await expect(page).toHaveURL(
    /#adaptation%2Freview%3Atoday-pane|#adaptation\/review%3Atoday-pane/,
  );
  await expect(
    page.getByRole("main", { name: "Workout Adaptation review" }),
  ).toBeVisible();
});

test("pushes a planned Workout tile and restores its focus on Back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#today");

  const tile = page.locator('[data-workout-id="planned-2026-08-27-recovery"]');
  await tile.click();
  await expect
    .poll(() => page.evaluate(() => location.hash))
    .toBe("#workout/planned-2026-08-27-recovery");
  const screen = page.getByRole("main", { name: "Planned Workout" });
  await expect(
    screen.getByRole("heading", { name: "6 km recovery" }),
  ).toBeFocused();
  await screen.getByRole("button", { name: "Back to Overview" }).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#today");
  await expect(tile).toBeFocused();
});

test("pushes a result-bearing tile and restores its focus on Back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#today");

  const today = page.getByRole("region", { name: "Overview" });
  const details = today.getByRole("button", { name: "View workout details" });
  await details.click();
  await expect
    .poll(() => page.evaluate(() => location.hash))
    .toBe("#workout/planned-2026-08-26-threshold");
  const screen = page.getByRole("main", { name: "Workout Result" });
  await expect(
    screen.getByRole("heading", { name: "5 × 1 km threshold" }),
  ).toBeFocused();
  await expect(screen.getByText("PARTIAL", { exact: true })).toHaveCount(0);
  await expect(screen.getByText("41:28", { exact: true })).toBeVisible();
  await expect(screen.getByText("5:55/km", { exact: true })).toBeVisible();
  await expect(screen.getByText("152 bpm", { exact: true })).toBeVisible();
  await expect(screen.getByText("Training Load", { exact: true })).toHaveCount(
    0,
  );
  await screen.getByRole("button", { name: "Back to Overview" }).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#today");
  await expect(details).toBeFocused();
});

test("keeps the desktop Today composition bounded and captures it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#today");

  const today = page.getByRole("region", { name: "Overview" });
  await expect(today.locator(".today-pane")).toBeVisible();
  await expect(today.getByText("Current plan week")).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(1280);
  await today.screenshot({ path: "/tmp/issue-62-today-desktop.png" });
});

test("keeps the normal Today surface static under reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#today");

  const progress = page.locator("[role=progressbar]");
  await expect(progress).toBeVisible();
  expect(
    await progress.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        animationName: style.animationName,
        transitionDurationSeconds: parseFloat(style.transitionDuration),
      };
    }),
  ).toEqual({ animationName: "none", transitionDurationSeconds: 0 });
});
