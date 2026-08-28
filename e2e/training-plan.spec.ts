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

test("renders context from a valid modified saved workspace", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const storageKey = "your-last-coach.workspace.v1";
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) throw new Error("Expected the demo workspace to be saved");

    const envelope = JSON.parse(saved);
    envelope.state.targetRace.name = "South Downs Marathon";
    envelope.state.targetRace.date = "2027-05-09";
    envelope.state.targetRace.objectiveSeconds = 14_400;
    envelope.state.observations.recovery.percent = 61;
    envelope.state.observations.trainingLoad = {
      shortTerm: 72,
      longTerm: 60,
      ratio: 1.2,
    };
    envelope.state.observations.sleep = {
      durationMinutes: 390,
      score: 77,
    };
    envelope.state.observations.sleepHrvMs = {
      value: 58,
      syntheticNormalRange: [50, 66],
    };

    const thursday = envelope.state.trainingPlan.plannedWorkouts.find(
      (workout: { id: string }) => workout.id === "planned-2026-08-27-recovery",
    );
    thursday.distanceKm = 5;
    thursday.prescription.blocks[0].distanceKm = 5;

    const sunday = envelope.state.trainingPlan.plannedWorkouts.find(
      (workout: { id: string }) => workout.id === "planned-2026-08-30-long",
    );
    sunday.distanceKm = 16;
    sunday.prescription.blocks[0].distanceKm = 16;

    window.localStorage.setItem(storageKey, JSON.stringify(envelope));
  });

  await page.reload();

  await expect(
    page.getByText(/arrive ready for South Downs Marathon/),
  ).toBeVisible();
  await expect(page.getByText("9 May 2027")).toBeVisible();
  await expect(page.getByText("4:00", { exact: true })).toBeVisible();
  await expect(
    page.getByText("29 km remain after Wednesday’s partial session."),
  ).toBeVisible();
  await expect(page.getByText("61%", { exact: true })).toBeVisible();
  await expect(page.getByText("1.20", { exact: true })).toBeVisible();
  await expect(page.getByText("72 short / 60 long")).toBeVisible();
  await expect(page.getByText("6h 30", { exact: true })).toBeVisible();
  await expect(page.getByText("Score 77")).toBeVisible();
  await expect(page.getByText("58 ms", { exact: true })).toBeVisible();
  await expect(page.getByText("Usual 50–66 ms")).toBeVisible();
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
