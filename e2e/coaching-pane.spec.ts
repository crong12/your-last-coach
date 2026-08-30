import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("your-last-coach.demo-guide.v1", "seen");
  });
});

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
      value: { registrations, reviewMode: "fallback" },
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

function approvedReceiptProposal() {
  const easy = (distanceKm: number) => ({
    blocks: [{ kind: "easy", distanceKm }],
  });
  return {
    reviewId: "review:coaching-pane",
    sourceWorkoutId: "planned-2026-08-26-threshold",
    expectedPlanVersion: 1,
    evidenceRefs: [
      "planned-workout:planned-2026-08-26-threshold",
      "workout-result:result-2026-08-26-threshold",
      "observation:training-load",
      "observation:recovery",
    ],
    rationale: {
      summary: "The partial session points to accumulated fatigue.",
      counterEvidence: "Sleep and recovery remain close to the usual range.",
      confidence: "moderate",
      limitations: ["One session cannot establish the cause."],
    },
    recommended: {
      optionId: "recovery-first",
      label: "Recovery first",
      summary: "Reduce the next recovery session.",
      tradeoff: "Loses a little weekly volume.",
      workoutChanges: [
        {
          kind: "update",
          workoutId: "planned-2026-08-27-recovery",
          changes: {
            title: "5 km easy",
            purpose: "Keep the run relaxed.",
            distanceKm: 5,
            prescription: easy(5),
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
          kind: "update",
          workoutId: "planned-2026-08-27-recovery",
          changes: {
            title: "6 km recovery",
            purpose: "Recover from threshold work.",
            distanceKm: 6,
            prescription: easy(6),
          },
        },
      ],
    },
  };
}

test("shows the seeded coaching narrative before the bounded athlete profile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#coaching");

  const coaching = page.getByRole("region", { name: "Coaching" });
  const timeline = coaching.getByRole("region", {
    name: "Coaching timeline",
  });
  const entries = timeline.getByRole("listitem");

  await expect(timeline).toBeVisible();
  await expect(entries).toHaveCount(2);
  await expect(entries.nth(0)).toContainText("Athlete Feedback");
  await expect(entries.nth(0)).toContainText(
    "My right shin felt a little sore near the end of Sunday's long run.",
  );
  await expect(entries.nth(1)).toContainText("Workout Result");
  await expect(entries.nth(1)).toContainText("20 km long run");
  await expect(entries.nth(1)).toContainText("Completed");
  await expect(entries.nth(1)).toContainText(
    "Based on: 23 August 2026 · 20 km long run",
  );
  await expect(
    entries.nth(1).getByRole("link", { name: "View workout" }),
  ).toHaveAttribute("href", "#workout/planned-2026-08-23-long");
  await expect(
    entries.nth(0).getByRole("link", { name: /in response to/i }),
  ).toHaveAttribute("href", "#coaching-entry-workout-result-2026-08-23");
  await expect(
    entries.nth(1).getByRole("link", { name: /Related Athlete Feedback/i }),
  ).toHaveAttribute(
    "href",
    "#coaching-entry-athlete-feedback-seed-shin-discomfort",
  );
  await expect(
    entries.nth(1).getByRole("link", { name: /in response to/i }),
  ).toHaveCount(0);
  await entries
    .nth(0)
    .getByRole("link", { name: /in response to/i })
    .click();
  await expect(entries.nth(1)).toBeFocused();

  const profile = coaching.getByRole("region", { name: "Athlete Profile" });
  await expect(profile).toBeVisible();
  await expect(profile).toContainText("Sam");
  await expect(profile).toContainText("Brighton Marathon");
  await expect(profile).toContainText("3:40");
  await expect(profile).toContainText("Sunday");
  await expect(profile).toContainText("60 minutes");
  expect(
    await timeline.evaluate((element) =>
      Boolean(
        element.compareDocumentPosition(
          document.getElementById("profile-title")!.closest("section")!,
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ),
  ).toBeTruthy();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("shows an honest empty state when no supported coaching entries exist", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const key = "your-last-coach.workspace.v1";
    const saved = window.localStorage.getItem(key);
    if (!saved) throw new Error("Expected the demo workspace to be saved");
    const envelope = JSON.parse(saved);
    envelope.state.athleteFeedback = [];
    envelope.state.workoutResults = [];
    envelope.state.coachingTopics = [];
    envelope.state.adaptationReceipts = [];
    envelope.state.appliedReviewIds = [];
    window.localStorage.setItem(key, JSON.stringify(envelope));
  });
  await page.reload();
  await page.goto("/#coaching");

  const timeline = page.getByRole("region", { name: "Coaching timeline" });
  await expect(
    timeline.getByRole("heading", { name: "No coaching activity yet" }),
  ).toBeVisible();
  await expect(
    timeline.getByText(
      "Athlete Feedback, Coach Recommendations, and Workout Results will appear here.",
    ),
  ).toBeVisible();
  await expect(timeline.getByRole("listitem")).toHaveCount(0);
});

test("does not infer a different Workout Result for an explicit stale Feedback result ID", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const key = "your-last-coach.workspace.v1";
    const saved = window.localStorage.getItem(key);
    if (!saved) throw new Error("Expected the demo workspace to be saved");
    const envelope = JSON.parse(saved);
    const feedback = envelope.state.athleteFeedback[0];
    const result = envelope.state.workoutResults.find(
      (candidate: { id: string }) =>
        candidate.id === feedback.relatedWorkoutResultId,
    );
    envelope.state.workoutResults.push({
      ...result,
      id: "result-2026-08-23-shadow",
    });
    window.localStorage.setItem(key, JSON.stringify(envelope));
  });
  await page.addInitScript(() => {
    const nativeStructuredClone = window.structuredClone.bind(window);
    let degraded = false;
    window.structuredClone = ((value: unknown) => {
      const clone = nativeStructuredClone(value);
      if (
        !degraded &&
        typeof value === "object" &&
        value !== null &&
        "seedVersion" in value &&
        "workoutResults" in value &&
        Array.isArray((value as { workoutResults?: unknown }).workoutResults)
      ) {
        degraded = true;
        const stateClone = clone as {
          workoutResults: Array<{ id: string }>;
        };
        stateClone.workoutResults = stateClone.workoutResults.filter(
          ({ id }) => id !== "result-2026-08-23",
        );
      }
      return clone;
    }) as typeof window.structuredClone;
  });
  await page.reload();
  await page.goto("/#coaching");

  const timeline = page.getByRole("region", { name: "Coaching timeline" });
  await expect(timeline.getByRole("listitem")).toHaveCount(1);
  await expect(
    timeline.getByText("Workout Result", { exact: true }),
  ).toHaveCount(0);
  await expect(
    timeline
      .locator("#coaching-entry-athlete-feedback-seed-shin-discomfort")
      .getByRole("link"),
  ).toHaveCount(0);
});

test("opens and controls the app-bar menu without leaving direct demo controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const trigger = page.getByRole("button", { name: "Open app menu" });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.press("Enter");
  const menu = page.getByRole("menu", { name: "App menu" });
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Demo Guide" }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    menu.getByRole("menuitem", { name: "Reset demo" }),
  ).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(
    menu.getByRole("menuitem", { name: "Demo Guide" }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    menu.getByRole("menuitem", { name: "Reset demo" }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await expect(
    menu.getByRole("menuitem", { name: "Demo Guide" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Reset demo", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Coach Agent connection/ }),
  ).toHaveCount(0);
});

test("opens the existing guide and reset dialogs from the app-bar menu", async ({
  page,
}) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Open app menu" });

  await trigger.click();
  await page.getByRole("menuitem", { name: "Demo Guide" }).click();
  await expect(page.getByRole("dialog", { name: "Demo Guide" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByRole("menuitem", { name: "Reset demo" }).click();
  await expect(
    page.getByRole("dialog", { name: "Reset the demo?" }),
  ).toBeVisible();
});

test("keeps the desktop Coaching composition stacked and the app menu in the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#coaching");

  const coaching = page.getByRole("region", { name: "Coaching" });
  const timeline = coaching.getByRole("region", {
    name: "Coaching timeline",
  });
  const profile = coaching.getByRole("region", { name: "Athlete Profile" });
  const [timelineBox, profileBox] = await Promise.all([
    timeline.boundingBox(),
    profile.boundingBox(),
  ]);
  expect(timelineBox).not.toBeNull();
  expect(profileBox).not.toBeNull();
  expect(profileBox!.y).toBeGreaterThan(timelineBox!.y + timelineBox!.height);
  expect(profileBox!.width).toBe(timelineBox!.width);

  const trigger = page.getByRole("button", { name: "Open app menu" });
  await trigger.click();
  const menu = page.getByRole("menu", { name: "App menu" });
  const menuBox = await menu.boundingBox();
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(1280);
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(800);
  await page.mouse.click(16, 16);
  await expect(menu).toBeHidden();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(1280);
});

test("shows the approved adaptation receipt with its source evidence after settlement and reload", async ({
  page,
}) => {
  await installFallbackHarness(page);
  await page.goto("/#coaching");

  const opened = await page.evaluate(async (proposal) => {
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
      ({ tool }) => tool.name === "open_workout_adaptation_review",
    )?.tool;
    if (!tool) throw new Error("Fallback review tool was not registered");
    return tool.execute(proposal, { signal: new AbortController().signal });
  }, approvedReceiptProposal());
  expect(opened).toMatchObject({
    status: "review_opened",
    reviewId: "review:coaching-pane",
  });

  const review = page.getByRole("main", {
    name: "Workout Adaptation review",
  });
  await review
    .getByRole("radio", { name: /Coach's recommendation — Recovery first/ })
    .click();
  await review
    .getByRole("button", { name: "Adapt my plan: Recovery first" })
    .click();
  await expect(review).toBeHidden();

  const timeline = page.getByRole("region", { name: "Coaching timeline" });
  const entries = timeline.getByRole("listitem");
  await expect(entries.first()).toContainText("Approved Adaptation");
  await expect(entries.first()).toContainText("Recovery first");
  const thresholdResult = timeline.locator(
    "#coaching-entry-workout-result-2026-08-26-threshold",
  );
  await expect(
    thresholdResult.getByRole("link", {
      name: /Related Approved Adaptation/i,
    }),
  ).toHaveAttribute(
    "href",
    "#coaching-entry-approved-adaptation-coaching-pane",
  );
  await expect(
    thresholdResult.getByRole("link", { name: /in response to/i }),
  ).toHaveCount(0);
  await expect(
    timeline.getByText("Recovery first", { exact: true }),
  ).toBeVisible();
  await expect(
    timeline.getByText("approved by you", { exact: true }),
  ).toBeVisible();
  await expect(timeline.getByText("1 → 2", { exact: true })).toBeVisible();
  await expect(
    timeline.getByText(/Based on: .*Training Load .*Recovery/),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "Coaching timeline" })
      .getByText("Recovery first", { exact: true }),
  ).toBeVisible();
});

test("opens a full-push adaptation review with a durable back route", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFallbackHarness(page);
  await page.goto("/#coaching");

  const opened = await page.evaluate(async (proposal) => {
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
      ({ tool }) => tool.name === "open_workout_adaptation_review",
    )?.tool;
    if (!tool) throw new Error("Fallback review tool was not registered");
    return tool.execute(proposal, { signal: new AbortController().signal });
  }, approvedReceiptProposal());
  expect(opened).toMatchObject({
    status: "review_opened",
    reviewId: "review:coaching-pane",
  });

  await expect(page).toHaveURL(
    /#adaptation%2Freview%3Acoaching-pane|#adaptation\/review%3Acoaching-pane/,
  );
  const review = page.getByRole("main", {
    name: "Workout Adaptation review",
  });
  await expect(review).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    review.getByRole("heading", { name: "Workout Adaptation" }),
  ).toBeFocused();
  await expect(
    review.getByRole("heading", { name: "What would change" }).first(),
  ).toBeVisible();
  await review.locator("details > summary").click();
  await review
    .getByRole("radio", { name: /Alternative — Keep the rhythm/ })
    .click();
  await expect(
    review.getByRole("button", { name: "Adapt my plan: Keep the rhythm" }),
  ).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const saved = window.localStorage.getItem(
          "your-last-coach.workspace.v1",
        );
        return saved ? JSON.parse(saved).state.trainingPlan.planVersion : null;
      }),
    )
    .toBe(1);
  await page.screenshot({
    path: "test-results/issue-66-mobile-review.png",
    fullPage: false,
  });

  await page.goBack();
  await expect(page).toHaveURL(/#coaching$/);
  await expect(
    page.getByRole("region", { name: "Coaching", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review proposal" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/issue-66-mobile-coaching-before-decision.png",
    fullPage: false,
  });

  await page.getByRole("button", { name: "Review proposal" }).click();
  const reopened = page.getByRole("main", {
    name: "Workout Adaptation review",
  });
  await expect(reopened).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(
    new RegExp("#adaptation(?:%2F|/)review%3Acoaching-pane"),
  );
  await expect(reopened).toBeVisible();
  await expect(
    reopened.getByRole("button", { name: "Adapt my plan: Keep the rhythm" }),
  ).toBeEnabled();
  await reopened
    .getByRole("radio", { name: /Coach's recommendation — Recovery first/ })
    .click();
  await reopened
    .getByRole("button", { name: "Adapt my plan: Recovery first" })
    .click();
  await expect(page).toHaveURL(/#coaching$/);
  await expect(
    page
      .getByRole("region", { name: "Coaching timeline" })
      .getByText("Recovery first", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Plan version 2", { exact: true })).toHaveCount(
    1,
  );
  await page.screenshot({
    path: "test-results/issue-66-mobile-coaching-after-decision.png",
    fullPage: false,
  });
});

test("opens the same review from WebMCP on desktop and keeps the action bar readable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await installFallbackHarness(page);
  await page.goto("/#coaching");

  await page.evaluate(async (proposal) => {
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
      ({ tool }) => tool.name === "open_workout_adaptation_review",
    )?.tool;
    if (!tool) throw new Error("Fallback review tool was not registered");
    return tool.execute(proposal, { signal: new AbortController().signal });
  }, approvedReceiptProposal());

  const review = page.getByRole("main", {
    name: "Workout Adaptation review",
  });
  await expect(review).toBeVisible();
  await expect(
    review.getByRole("heading", { name: "Workout Adaptation" }),
  ).toBeFocused();
  const actionBar = review.locator(".adaptation-actions");
  await expect(actionBar).toBeVisible();
  const actionBarBox = await actionBar.boundingBox();
  expect(actionBarBox).not.toBeNull();
  expect(actionBarBox!.x + actionBarBox!.width).toBeLessThanOrEqual(1280);
  expect(actionBarBox!.y + actionBarBox!.height).toBeLessThanOrEqual(800);
  await review.locator("details > summary").click();
  await review
    .getByRole("radio", { name: /Alternative — Keep the rhythm/ })
    .click();
  await expect(
    review.getByRole("button", { name: "Adapt my plan: Keep the rhythm" }),
  ).toBeEnabled();
  await page.screenshot({
    path: "test-results/issue-66-desktop-review.png",
    fullPage: false,
  });
  await page.goBack();
  await expect(page).toHaveURL(/#coaching$/);
  await expect(
    page.getByRole("button", { name: "Review proposal" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review proposal" }).click();
  const cardReview = page.getByRole("main", {
    name: "Workout Adaptation review",
  });
  await expect(cardReview).toBeVisible();
  await expect(
    cardReview.getByRole("heading", { name: "Workout Adaptation" }),
  ).toBeFocused();
  await cardReview.locator("details > summary").click();
  await cardReview
    .getByRole("radio", { name: /Alternative — Keep the rhythm/ })
    .click();
  await expect(
    cardReview.getByRole("button", { name: "Adapt my plan: Keep the rhythm" }),
  ).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const saved = window.localStorage.getItem(
          "your-last-coach.workspace.v1",
        );
        return saved ? JSON.parse(saved).state.trainingPlan.planVersion : null;
      }),
    )
    .toBe(1);
  await page.goBack();
  await expect(page).toHaveURL(/#coaching$/);
  await expect(
    page.getByRole("button", { name: "Review proposal" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review proposal" }).click();
  const reopened = page.getByRole("main", {
    name: "Workout Adaptation review",
  });
  await expect(reopened).toBeVisible();
  await reopened
    .getByRole("radio", { name: /Coach's recommendation — Recovery first/ })
    .click();
  await reopened
    .getByRole("button", { name: "Adapt my plan: Recovery first" })
    .click();
  await expect(page).toHaveURL(/#coaching$/);
  await expect(
    page
      .getByRole("region", { name: "Coaching timeline" })
      .getByText("Recovery first", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Plan version 2", { exact: true })).toHaveCount(
    1,
  );
  await expect(
    page.evaluate(async () => {
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
        ({ tool }) => tool.name === "read_workout_adaptation_decision",
      )?.tool;
      if (!tool) throw new Error("Fallback decision tool was not registered");
      return tool.execute(
        { reviewId: "review:coaching-pane" },
        { signal: new AbortController().signal },
      );
    }),
  ).resolves.toMatchObject({
    status: "approved",
    reviewId: "review:coaching-pane",
  });
});

test("cuts adaptation motion when reduced motion is requested", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFallbackHarness(page);
  await page.goto("/#coaching");

  await page.evaluate(async (proposal) => {
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
      ({ tool }) => tool.name === "open_workout_adaptation_review",
    )?.tool;
    if (!tool) throw new Error("Fallback review tool was not registered");
    return tool.execute(proposal, { signal: new AbortController().signal });
  }, approvedReceiptProposal());

  const review = page.getByRole("main", {
    name: "Workout Adaptation review",
  });
  await expect(review).toBeVisible();
  const reducedMotion = await review.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      transitionSeconds: parseFloat(style.transitionDuration),
      scrollBehavior: style.scrollBehavior,
    };
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const normalTransitionSeconds = await review.evaluate((element) =>
    parseFloat(getComputedStyle(element).transitionDuration),
  );
  expect(reducedMotion.scrollBehavior).toBe("auto");
  expect(normalTransitionSeconds).toBeGreaterThan(
    reducedMotion.transitionSeconds,
  );
});

test("shows a bounded unavailable state for an unknown adaptation deep link", async ({
  page,
}) => {
  await page.goto("/#adaptation/unknown-review");

  const unavailable = page.getByRole("main", {
    name: "Workout Adaptation unavailable",
  });
  await expect(unavailable).toBeVisible();
  await expect(
    unavailable.getByRole("heading", { name: "Adaptation unavailable" }),
  ).toBeFocused();
  await expect(
    unavailable.getByRole("button", { name: "Back to Coaching" }),
  ).toHaveCount(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await unavailable.getByRole("button", { name: "Back to Coaching" }).click();
  await expect(page).toHaveURL(/#coaching$/);
});

test("keeps Planned Workout and unknown receipt evidence literal without an inferred Result", async ({
  page,
}) => {
  await installFallbackHarness(page);
  await page.goto("/#coaching");

  const proposal = approvedReceiptProposal();
  proposal.evidenceRefs = ["planned-workout:planned-2026-08-26-threshold"];
  const opened = await page.evaluate(async (input) => {
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
      ({ tool }) => tool.name === "open_workout_adaptation_review",
    )?.tool;
    if (!tool) throw new Error("Fallback review tool was not registered");
    return tool.execute(input, { signal: new AbortController().signal });
  }, proposal);
  expect(opened).toMatchObject({ status: "review_opened" });

  const review = page.getByRole("main", {
    name: "Workout Adaptation review",
  });
  await review
    .getByRole("radio", { name: /Coach's recommendation — Recovery first/ })
    .click();
  await review
    .getByRole("button", { name: "Adapt my plan: Recovery first" })
    .click();
  await expect(review).toBeHidden();

  await page.evaluate(() => {
    const key = "your-last-coach.workspace.v1";
    const saved = window.localStorage.getItem(key);
    if (!saved) throw new Error("Expected the approved workspace to be saved");
    const envelope = JSON.parse(saved);
    envelope.state.adaptationReceipts[0].evidenceRefs.push(
      "evidence:unverified-source",
    );
    delete envelope.undeliveredFallbackResult;
    window.localStorage.setItem(key, JSON.stringify(envelope));
  });
  await page.reload();

  const timeline = page.getByRole("region", { name: "Coaching timeline" });
  await expect(
    timeline.locator("#coaching-entry-workout-result-2026-08-26-threshold"),
  ).toHaveCount(0);
  await expect(
    timeline
      .locator("#coaching-entry-approved-adaptation-coaching-pane")
      .getByRole("link", { name: /Workout Result/ }),
  ).toHaveCount(0);
  await expect(
    timeline.getByText(
      "Based on: 26 August 2026 · 5 × 1 km threshold · Evidence reference evidence:unverified-source",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    timeline.getByText("Unverified source", { exact: true }),
  ).toHaveCount(0);
});
