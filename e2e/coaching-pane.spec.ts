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
    entries.nth(1).getByRole("link", { name: /in response to/i }),
  ).toHaveAttribute(
    "href",
    "#coaching-entry-athlete-feedback-seed-shin-discomfort",
  );
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

  const review = page.getByRole("dialog", {
    name: "Review Workout Adaptations",
  });
  await review
    .getByRole("button", { name: /Coach's recommendation — Recovery first/ })
    .click();
  await review.getByRole("button", { name: "Adapt my plan" }).click();
  await expect(review).toBeHidden();

  const timeline = page.getByRole("region", { name: "Coaching timeline" });
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
