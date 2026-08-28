// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { createReviewCoordinator } from "../src/application/createReviewCoordinator";
import { createWorkspaceApplication } from "../src/application/createWorkspaceApplication";
import type { WorkspaceRepository } from "../src/application/ports";
import { createDemoCoachingContextSource } from "../src/demo/demoCoachingContextSource";
import type { ReviewProposal } from "../src/domain/review";
import { ReviewModal } from "../src/ui/WorkspaceApp";

function proposal(): ReviewProposal {
  const prescription = (distanceKm: number) => ({
    blocks: [{ kind: "easy" as const, distanceKm }],
  });
  return {
    reviewId: "review:component",
    sourceWorkoutId: "planned-2026-08-26-threshold",
    expectedPlanVersion: 1,
    evidenceRefs: [
      "planned-workout:planned-2026-08-26-threshold",
      "workout-result:result-2026-08-26-threshold",
    ],
    rationale: {
      summary: "Accumulated fatigue is more consistent with the evidence.",
      counterEvidence: "Sleep and HRV remain close to the normal range.",
      confidence: "moderate",
      limitations: ["One difficult workout cannot establish the cause."],
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
            distanceKm: 6,
            prescription: prescription(6),
          },
        },
        {
          kind: "update",
          workoutId: "planned-2026-08-30-long",
          changes: {
            title: "14 km easy long run",
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
      tradeoff: "Provides less recovery.",
      workoutChanges: [
        {
          kind: "update",
          workoutId: "planned-2026-08-27-recovery",
          changes: {
            title: "5 km very easy",
            distanceKm: 5,
            prescription: prescription(5),
          },
        },
        {
          kind: "update",
          workoutId: "planned-2026-08-29-strides",
          changes: {
            title: "6 km easy",
            distanceKm: 6,
            prescription: prescription(6),
          },
        },
        {
          kind: "update",
          workoutId: "planned-2026-08-30-long",
          changes: {
            title: "16 km easy long run",
            distanceKm: 16,
            prescription: prescription(16),
          },
        },
      ],
    },
  };
}

describe("ReviewModal", () => {
  it("renders ranked content, previews selection, and settles without mutation", async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const fixtureSource = createDemoCoachingContextSource();
    const initialState = await fixtureSource.loadContext();
    let saveCount = 0;
    const repository: WorkspaceRepository = {
      async load() {
        return null;
      },
      async save() {
        saveCount += 1;
        return "persistent";
      },
      async clear() {},
    };
    const application = createWorkspaceApplication({
      initialState,
      fixtureSource,
      repository,
    });
    const coordinator = createReviewCoordinator({ application });
    const before = structuredClone(application.getState());
    coordinator.open(proposal());
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(ReviewModal, { coordinator }));
    });
    expect(container.textContent).toContain("Review Workout Adaptations");
    expect(container.textContent).toContain("Recovery first");
    expect(container.textContent).toContain("Alternative");
    expect(container.textContent).toContain(
      "One difficult workout cannot establish the cause.",
    );

    const recommendation = container.querySelector<HTMLButtonElement>(
      '[aria-label="Coach\'s recommendation — Recovery first"]',
    )!;
    await act(async () => recommendation.click());
    expect(recommendation.getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).toContain("6 km recovery → Rest");
    expect(container.textContent).toContain(
      "18 km long run → 14 km easy long run",
    );
    expect(application.getState()).toEqual(before);
    expect(saveCount).toBe(0);

    const discuss = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("None — discuss further"),
    )!;
    await act(async () => discuss.click());
    expect(container.textContent).toBe("");
    expect(application.getState()).toEqual(before);
    expect(saveCount).toBe(0);

    coordinator.open(proposal());
    await act(async () => {});
    const close = container.querySelector<HTMLButtonElement>(
      '[aria-label="Close adaptation review"]',
    )!;
    await act(async () => close.click());
    expect(container.textContent).toBe("");
    expect(application.getState()).toEqual(before);
    expect(saveCount).toBe(0);

    await act(async () => root.unmount());
    container.remove();
  });
});
