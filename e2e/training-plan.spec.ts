import { expect, test, type Page } from "@playwright/test";

async function installWebMcpHarness(
  page: Page,
  reviewMode: "primary" | "fallback" = "fallback",
) {
  await page.addInitScript((mode) => {
    const registrations: Array<{
      tool: {
        name: string;
        title: string;
        description: string;
        inputSchema: Record<string, unknown>;
        annotations: Record<string, unknown>;
        execute: (
          input: Record<string, unknown>,
          options: { signal: AbortSignal },
        ) => Promise<unknown>;
      };
      signal?: AbortSignal;
    }> = [];
    Object.defineProperty(window, "__webMcpHarness", {
      configurable: true,
      value: { registrations, reviewMode: mode },
    });
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        async registerTool(
          tool: (typeof registrations)[number]["tool"],
          options?: { signal?: AbortSignal },
        ) {
          registrations.push({ tool, signal: options?.signal });
        },
      },
    });
  }, reviewMode);
}

function acceptedReviewProposal() {
  const prescription = (distanceKm: number) => ({
    blocks: [{ kind: "easy", distanceKm }],
  });
  return {
    reviewId: "review:playwright",
    sourceWorkoutId: "planned-2026-08-26-threshold",
    expectedPlanVersion: 1,
    evidenceRefs: [
      "planned-workout:planned-2026-08-26-threshold",
      "workout-result:result-2026-08-26-threshold",
      "observation:training-load",
      "observation:recovery",
    ],
    rationale: {
      summary:
        "Your incomplete session is more consistent with accumulated fatigue than a sudden loss of fitness.",
      counterEvidence:
        "Your sleep, HRV, resting heart rate, and stress remain close to your normal range.",
      confidence: "moderate",
      limitations: [
        "One difficult workout cannot establish the cause.",
        "This does not diagnose injury or overtraining.",
      ],
    },
    recommended: {
      optionId: "recovery-first",
      label: "Recovery first",
      summary: "Make the clearest reduction in accumulated load.",
      tradeoff: "Loses weekly volume and long-run stimulus.",
      workoutChanges: [
        { kind: "delete", workoutId: "planned-2026-08-27-recovery" },
        {
          kind: "update",
          workoutId: "planned-2026-08-29-strides",
          changes: {
            title: "6 km easy",
            purpose: "Keep the run relaxed and leave the strides out.",
            distanceKm: 6,
            prescription: prescription(6),
          },
        },
        {
          kind: "update",
          workoutId: "planned-2026-08-30-long",
          changes: {
            title: "14 km easy long run",
            purpose: "Keep the long run easy and finish fresher.",
            distanceKm: 14,
            prescription: prescription(14),
          },
        },
      ],
    },
    alternative: {
      optionId: "keep-the-rhythm",
      label: "Keep the rhythm",
      summary: "Preserve running frequency and more aerobic volume.",
      tradeoff: "Provides less recovery if fatigue has accumulated.",
      workoutChanges: [
        {
          kind: "update",
          workoutId: "planned-2026-08-27-recovery",
          changes: {
            title: "5 km very easy",
            purpose: "Keep the run very easy.",
            distanceKm: 5,
            prescription: prescription(5),
          },
        },
        {
          kind: "update",
          workoutId: "planned-2026-08-29-strides",
          changes: {
            title: "6 km easy",
            purpose: "Keep the run relaxed and leave the strides out.",
            distanceKm: 6,
            prescription: prescription(6),
          },
        },
        {
          kind: "update",
          workoutId: "planned-2026-08-30-long",
          changes: {
            title: "16 km easy long run",
            purpose: "Keep the long run easy while preserving more volume.",
            distanceKm: 16,
            prescription: prescription(16),
          },
        },
      ],
    },
  };
}

test("reviews both ranked Workout Adaptations and leaves every exit non-mutating", async ({
  page,
}) => {
  await installWebMcpHarness(page, "primary");
  await page.goto("/");
  const beforeEnvelope = await page.evaluate(() =>
    localStorage.getItem("your-last-coach.workspace.v1"),
  );
  const openReview = () =>
    page.evaluate((proposal) => {
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
        ({ tool }) => tool.name === "review_workout_adaptation",
      )?.tool;
      if (!tool) throw new Error("Primary review tool was not registered");
      void tool.execute(proposal, { signal: new AbortController().signal });
    }, acceptedReviewProposal());

  await openReview();
  const dialog = page.getByRole("dialog", {
    name: "Review Workout Adaptations",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Moderate confidence")).toBeVisible();
  await expect(
    dialog.getByText(/sleep, HRV, resting heart rate/),
  ).toBeVisible();
  await expect(
    dialog.getByText("One difficult workout cannot establish the cause."),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", {
      name: /Coach's recommendation — Recovery first/,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: /Alternative — Keep the rhythm/ }),
  ).toBeVisible();

  await dialog
    .getByRole("button", { name: /Coach's recommendation — Recovery first/ })
    .click();
  await expect(dialog.getByText("6 km recovery → Rest")).toBeVisible();
  await expect(
    dialog.getByText("8 km easy with strides → 6 km easy"),
  ).toBeVisible();
  await expect(
    dialog.getByText("18 km long run → 14 km easy long run"),
  ).toBeVisible();

  await dialog
    .getByRole("button", { name: /Alternative — Keep the rhythm/ })
    .click();
  await expect(
    dialog.getByText("6 km recovery → 5 km very easy"),
  ).toBeVisible();
  await expect(
    dialog.getByText("18 km long run → 16 km easy long run"),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "None — discuss further" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("Plan version 1")).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /18 km long run, 2026-08-30, 18 kilometres/,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("your-last-coach.workspace.v1"),
    ),
  ).toBe(beforeEnvelope);

  await openReview();
  await page.getByRole("button", { name: "Close adaptation review" }).click();
  await expect(dialog).toBeHidden();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("your-last-coach.workspace.v1"),
    ),
  ).toBe(beforeEnvelope);

  await openReview();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("your-last-coach.workspace.v1"),
    ),
  ).toBe(beforeEnvelope);
});

test("applies Recovery first atomically through Adapt my plan", async ({
  page,
}) => {
  await installWebMcpHarness(page, "primary");
  await page.goto("/");
  await page.evaluate((proposal) => {
    const harness = window as unknown as {
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
      __reviewResult?: unknown;
    };
    const tool = harness.__webMcpHarness.registrations.find(
      ({ tool }) => tool.name === "review_workout_adaptation",
    )?.tool;
    if (!tool) throw new Error("Primary review tool was not registered");
    void tool
      .execute(proposal, { signal: new AbortController().signal })
      .then((result) => (harness.__reviewResult = result));
  }, acceptedReviewProposal());

  const dialog = page.getByRole("dialog", {
    name: "Review Workout Adaptations",
  });
  await dialog
    .getByRole("button", { name: /Coach's recommendation — Recovery first/ })
    .click();
  await dialog.getByRole("button", { name: "Adapt my plan" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("Plan version 2")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /6 km easy, 2026-08-29, 6 kilometres/ }),
  ).toContainText("Adapted");
  await expect(
    page.getByRole("button", {
      name: /14 km easy long run, 2026-08-30, 14 kilometres/,
    }),
  ).toContainText("Adapted");
  await expect(
    page.getByRole("button", { name: /6 km recovery, 2026-08-27/ }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __reviewResult?: unknown }).__reviewResult,
      ),
    )
    .toMatchObject({
      status: "approved",
      selectedOption: { optionId: "recovery-first" },
      planVersionBefore: 1,
      planVersionAfter: 2,
      durability: "persistent",
    });

  await page.reload();
  await expect(page.getByText("Plan version 2")).toBeVisible();
  await expect(page.getByText("Adapted", { exact: true })).toHaveCount(2);
});

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
  await expect(
    page.getByRole("button", { name: /5 × 1 km threshold, 2026-08-26/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /18 km long run, 2026-08-30/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Month" }).click();
  await expect(
    page.getByRole("heading", { name: "August 2026" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /5 × 1 km threshold, 2026-08-26/ }),
  ).toBeVisible();
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
  await expect(page.getByText("App-owned plan")).toBeVisible();
  await expect(page.getByText("Workout Result")).toBeVisible();
  await expect(
    page.getByText("Synthetic observation", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("of 5 work repetitions")).toBeVisible();
  await expect(page.getByText("4:36/km · 165 bpm")).toBeVisible();
  await expect(page.getByText("4:48/km · 176 bpm")).toBeVisible();
});

test("shows recent training and the complete mixed recovery evidence", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "How you’re arriving" }),
  ).toBeVisible();
  await expect(page.getByText("52 bpm", { exact: true })).toBeVisible();
  await expect(page.getByText("Unremarkable", { exact: true })).toBeVisible();
  await expect(page.getByText("7h 22", { exact: true })).toBeVisible();
  await expect(page.getByText("55 ms", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recent training" }),
  ).toBeVisible();
  await expect(page.getByText("56 km from 18–23 August")).toBeVisible();
  await expect(page.getByText("13 Aug", { exact: true })).toBeVisible();
  await expect(page.getByText("26 Aug", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Seeded synthetic observations", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: /5 × 1 km threshold/ }).click();
  await expect(
    page.getByRole("heading", { name: "5 × 1 km threshold" }),
  ).toBeVisible();
  await expect(page.getByText("Planned prescription")).toBeVisible();
  await expect(page.getByText("Workout Result")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(720);
});

test("registers selector-backed WebMCP tools once and tears them down", async ({
  page,
}) => {
  await installWebMcpHarness(page);
  await page.goto("/");

  await expect(
    page.getByRole("button", { name: "Coach Agent connection: connected" }),
  ).toBeVisible();
  const result = await page.evaluate(async () => {
    const harness = (
      window as unknown as {
        __webMcpHarness: {
          registrations: Array<{
            tool: {
              name: string;
              title: string;
              description: string;
              inputSchema: Record<string, unknown>;
              annotations: Record<string, unknown>;
              execute: (
                input: Record<string, unknown>,
                options: { signal: AbortSignal },
              ) => Promise<unknown>;
            };
            signal?: AbortSignal;
          }>;
        };
      }
    ).__webMcpHarness;
    const execution = { signal: new AbortController().signal };
    const tools = Object.fromEntries(
      harness.registrations.map(({ tool }) => [tool.name, tool]),
    );
    return {
      registrations: harness.registrations.map(({ tool }) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      })),
      athlete: await tools.get_athlete_context.execute({}, execution),
      plan: await tools.get_training_plan.execute(
        { from: "2026-08-24", to: "2026-08-30" },
        execution,
      ),
      workout: await tools.get_workout_context.execute(
        { workoutId: "planned-2026-08-26-threshold" },
        execution,
      ),
    };
  });

  expect(result.registrations.map(({ name }) => name)).toEqual([
    "get_athlete_context",
    "get_training_plan",
    "get_workout_context",
    "record_athlete_feedback",
  ]);
  expect(
    result.registrations.map(({ annotations }) => annotations.readOnlyHint),
  ).toEqual([true, true, true, false]);
  expect(result.athlete).toMatchObject({
    status: "ok",
    data: { athlete: { displayName: "Sam" } },
  });
  expect(result.plan).toMatchObject({
    status: "ok",
    data: { planVersion: 1 },
  });
  expect(result.workout).toMatchObject({
    status: "ok",
    data: {
      plannedWorkout: { id: "planned-2026-08-26-threshold" },
      workoutResult: { status: "partial" },
    },
  });

  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  const signalsAborted = await page.evaluate(() =>
    (
      window as unknown as {
        __webMcpHarness: {
          registrations: Array<{ signal?: AbortSignal }>;
        };
      }
    ).__webMcpHarness.registrations.every(({ signal }) => signal?.aborted),
  );
  expect(signalsAborted).toBe(true);
});

test("records, persists, and resets Athlete Feedback through the injected host", async ({
  page,
}) => {
  await installWebMcpHarness(page);
  await page.goto("/");
  const rawText =
    "That was rough. My legs felt heavy from the warm-up and the reps felt like a 9 out of 10. I stopped after three because I couldn’t hold the pace. No pain. Can we make the rest of this week easier?";
  const recordFeedback = () =>
    page.evaluate(
      async ({ rawText }) => {
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
          ({ tool }) => tool.name === "record_athlete_feedback",
        )?.tool;
        if (!tool) throw new Error("Feedback tool was not registered");
        return tool.execute(
          {
            requestId: "hero-feedback-request",
            relatedWorkoutId: "planned-2026-08-26-threshold",
            rawText,
            reported: {
              sessionRpe: 9,
              legFeel: "heavy from the warm-up",
              painReported: false,
              stoppedReason: "couldn’t hold the pace",
            },
          },
          { signal: new AbortController().signal },
        );
      },
      { rawText },
    );

  await expect(recordFeedback()).resolves.toMatchObject({ status: "ok" });
  await expect(
    page.getByRole("heading", { name: "Athlete Feedback" }),
  ).toBeVisible();
  await expect(page.getByText(rawText)).toBeVisible();
  await expect(page.getByText("9/10 effort")).toBeVisible();
  await expect(page.getByText("No pain reported")).toBeVisible();

  await expect(recordFeedback()).resolves.toMatchObject({ status: "ok" });
  await expect(page.getByText(rawText)).toHaveCount(1);

  await page.reload();
  await expect(page.getByText(rawText)).toBeVisible();

  await page.getByRole("button", { name: "Reset demo" }).click();
  await page
    .getByRole("dialog", { name: "Reset the demo?" })
    .getByRole("button", { name: "Reset demo" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Athlete Feedback" }),
  ).toBeHidden();
  await expect(page.getByText(rawText)).toBeHidden();
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
