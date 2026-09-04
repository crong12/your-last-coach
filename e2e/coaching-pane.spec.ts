import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("your-last-coach.demo-guide.v1", "seen");
  });
});

async function installWebMcpHarness(page: Page) {
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

async function openReviewFromAgent(
  page: Page,
  proposal = approvedReceiptProposal(),
) {
  return page.evaluate(async (input) => {
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
    if (!tool) throw new Error("Adaptation review tool was not registered");
    return tool.execute(input, { signal: new AbortController().signal });
  }, proposal);
}

async function approveRecommendation(page: Page) {
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
}

test("renders the weekly Coaching notebook in semantic mobile order @contract", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#coaching");

  const coaching = page.getByRole("region", { name: "Coaching", exact: true });
  const latest = coaching.getByRole("region", {
    name: "Latest Weekly Progress Review",
  });
  const topics = coaching.getByRole("region", { name: "Coaching Topics" });
  const archive = coaching.getByRole("region", {
    name: "Weekly Progress Review archive",
  });
  const adaptations = coaching.getByRole("region", {
    name: "Adaptation History",
  });

  await expect(latest).toContainText("17–23 August 2026");
  await expect(latest).toContainText("Recorded 24 August 2026");
  await expect(latest).toContainText(
    "Strong long-run consistency, with one signal to watch",
  );
  await expect(latest).toContainText("Progress");
  await expect(latest).toContainText("Watch");
  await expect(latest).toContainText("Next focus");
  const evidenceLink = latest.getByRole("link", {
    name: "23 August 2026 · 20 km long run",
  });
  await expect(evidenceLink).toHaveAttribute(
    "href",
    "#workout/planned-2026-08-23-long",
  );
  await expect(evidenceLink).toHaveAttribute("id", /evidence-0$/);
  expect((await evidenceLink.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(
    latest.getByText("23 August 2026 · Athlete Feedback"),
  ).not.toHaveAttribute("href", "#trends");

  await evidenceLink.click();
  await expect(page).toHaveURL(/#workout\/planned-2026-08-23-long$/);
  await page
    .getByRole("button", { name: "Back to Coaching", exact: true })
    .click();
  await expect(page).toHaveURL(/#coaching$/);
  await expect(evidenceLink).toBeFocused();

  await expect(topics).toContainText("Shin discomfort");
  await expect(topics).toContainText("The next Athlete report about a run.");
  await expect(adaptations).toContainText(
    "Protect the long-run recovery window",
  );
  await expect(adaptations).toContainText("Plan v0 → v1");
  await expect(archive.locator("details")).toHaveCount(2);
  const firstArchiveRow = archive.locator("summary").first();
  expect((await firstArchiveRow.boundingBox())!.height).toBeGreaterThanOrEqual(
    44,
  );
  await firstArchiveRow.click();
  await expect(archive.getByText("Carry the same restraint")).toBeVisible();

  expect(
    await latest.evaluate((element) => {
      const topics = document.querySelector('[aria-label="Coaching Topics"]')!;
      const archive = document.querySelector(
        '[aria-label="Weekly Progress Review archive"]',
      )!;
      const adaptations = document.querySelector(
        '[aria-label="Adaptation History"]',
      )!;
      return [topics, archive, adaptations].every((candidate) =>
        Boolean(
          element.compareDocumentPosition(candidate) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      );
    }),
  ).toBeTruthy();
  await expect(coaching.getByText("Coaching timeline")).toHaveCount(0);
  await expect(coaching.getByText("Recent training")).toHaveCount(0);
  await expect(coaching.getByText("Athlete Profile")).toHaveCount(0);
  await expect(coaching.getByText("Awaiting your review")).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("uses the balanced desktop notebook composition and keeps the app menu reachable @contract", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#coaching");

  const latest = page.getByRole("region", {
    name: "Latest Weekly Progress Review",
  });
  const topics = page.getByRole("region", { name: "Coaching Topics" });
  const archive = page.getByRole("region", {
    name: "Weekly Progress Review archive",
  });
  const adaptations = page.getByRole("region", {
    name: "Adaptation History",
  });
  const [latestBox, topicsBox, archiveBox, adaptationsBox] = await Promise.all([
    latest.boundingBox(),
    topics.boundingBox(),
    archive.boundingBox(),
    adaptations.boundingBox(),
  ]);
  expect(latestBox).not.toBeNull();
  expect(topicsBox).not.toBeNull();
  expect(archiveBox).not.toBeNull();
  expect(adaptationsBox).not.toBeNull();
  expect(Math.abs(latestBox!.y - topicsBox!.y)).toBeLessThanOrEqual(2);
  expect(archiveBox!.y).toBeGreaterThan(latestBox!.y + latestBox!.height);
  expect(adaptationsBox!.y).toBeGreaterThan(topicsBox!.y + topicsBox!.height);

  const trigger = page.getByRole("button", { name: "Open app menu" });
  await trigger.click();
  const menu = page.getByRole("menu", { name: "App menu" });
  await expect(menu).toBeVisible();
  const menuBox = await menu.boundingBox();
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(1280);
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(800);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(1280);
});

test("keeps the full-page Plan Approval route while omitting its pending Coaching card @contract", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installWebMcpHarness(page);
  await page.goto("/#coaching");

  await expect(openReviewFromAgent(page)).resolves.toMatchObject({
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
  await expect(
    review.getByRole("heading", { name: "Workout Adaptation" }),
  ).toBeFocused();

  await page.goBack();
  await expect(page).toHaveURL(/#coaching$/);
  await expect(
    page.getByRole("button", { name: "Review proposal" }),
  ).toHaveCount(0);
  await page.goto("/#adaptation/review%3Acoaching-pane");
  await expect(review).toBeVisible();
  await approveRecommendation(page);

  const history = page.getByRole("region", { name: "Adaptation History" });
  await expect(
    history.getByText("Recovery first", { exact: true }),
  ).toBeVisible();
  await expect(history.getByText("1 workouts · Plan v1 → v2")).toBeVisible();
});

test("opens an approved receipt from Adaptation History and survives reload @contract", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installWebMcpHarness(page);
  await page.goto("/#coaching");
  await openReviewFromAgent(page);
  await approveRecommendation(page);

  const history = page.getByRole("region", { name: "Adaptation History" });
  const entry = history.locator(
    "#coaching-entry-approved-adaptation-coaching-pane",
  );
  await expect(entry).toContainText("Recovery first");
  await expect(entry).toContainText("Plan v1 → v2");
  const receiptLink = entry.getByRole("link", { name: "Inspect receipt" });
  await receiptLink.scrollIntoViewIfNeeded();
  const coachingScrollY = await page.evaluate(() => window.scrollY);
  expect(coachingScrollY).toBeGreaterThan(0);
  await receiptLink.click();
  await expect(page).toHaveURL(
    /#adaptation%2Freview%3Acoaching-pane|#adaptation\/review%3Acoaching-pane/,
  );
  const receipt = page.getByRole("main", { name: "Workout Adaptation record" });
  await expect(
    receipt.getByRole("heading", { name: "Adaptation approved" }),
  ).toBeFocused();
  await expect(receipt).toContainText("Recovery first");
  await expect(receipt).toContainText("1 → 2");
  await expect(receipt).toContainText(/Based on: .*Training Load .*Recovery/);
  await receipt.getByRole("button", { name: "Back to Coaching" }).click();
  await expect(page).toHaveURL(/#coaching$/);
  await expect(receiptLink).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(coachingScrollY);
  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "Adaptation History" })
      .getByText("Recovery first", { exact: true }),
  ).toBeVisible();
});

test("focuses an approved adaptation whose review ID contains punctuation @contract", async ({
  page,
}) => {
  await installWebMcpHarness(page);
  await page.goto("/#coaching");
  const proposal = approvedReceiptProposal();
  proposal.reviewId = "review:rest-of-week:2026-08-26";
  await openReviewFromAgent(page, proposal);
  await approveRecommendation(page);

  const entry = page.locator(
    "#coaching-entry-approved-adaptation-rest-of-week-2026-08-26",
  );
  await expect(entry).toBeVisible();
  await expect(entry).toBeFocused();
});

test("keeps the desktop adaptation action bar readable @contract", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await installWebMcpHarness(page);
  await page.goto("/#coaching");
  await openReviewFromAgent(page);

  const review = page.getByRole("main", {
    name: "Workout Adaptation review",
  });
  const actionBar = review.locator(".adaptation-actions");
  await expect(actionBar).toBeVisible();
  const actionBarBox = await actionBar.boundingBox();
  expect(actionBarBox).not.toBeNull();
  expect(actionBarBox!.x + actionBarBox!.width).toBeLessThanOrEqual(1280);
  expect(actionBarBox!.y + actionBarBox!.height).toBeLessThanOrEqual(800);
  await approveRecommendation(page);
  await expect(
    page
      .getByRole("region", { name: "Adaptation History" })
      .getByText("Recovery first", { exact: true }),
  ).toBeVisible();
});

test("keeps unsupported receipt evidence literal in the complete record @contract", async ({
  page,
}) => {
  await installWebMcpHarness(page);
  await page.goto("/#coaching");
  const proposal = approvedReceiptProposal();
  proposal.evidenceRefs = ["planned-workout:planned-2026-08-26-threshold"];
  await openReviewFromAgent(page, proposal);
  await approveRecommendation(page);

  await page.evaluate(() => {
    const key = "your-last-coach.workspace.v1";
    const saved = window.localStorage.getItem(key);
    if (!saved) throw new Error("Expected the approved workspace to be saved");
    const envelope = JSON.parse(saved);
    envelope.state.adaptationReceipts[0].evidenceRefs.push(
      "evidence:unverified-source",
    );
    delete envelope.undeliveredReviewResult;
    window.localStorage.setItem(key, JSON.stringify(envelope));
  });
  await page.reload();
  await page
    .getByRole("region", { name: "Adaptation History" })
    .locator("#coaching-entry-approved-adaptation-coaching-pane")
    .getByRole("link", { name: "Inspect receipt" })
    .click();

  const receipt = page.getByRole("main", { name: "Workout Adaptation record" });
  await expect(receipt).toContainText(
    "Based on: 26 August 2026 · 5 × 1 km threshold · Evidence reference evidence:unverified-source",
  );
  await expect(
    receipt.getByText("Unverified source", { exact: true }),
  ).toHaveCount(0);
});
