// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { createWorkspaceApplication } from "../src/application/createWorkspaceApplication";
import type { WorkspaceRepository } from "../src/application/ports";
import { createDemoCoachingContextSource } from "../src/demo/demoCoachingContextSource";
import { CoachingPane } from "../src/ui/WorkspaceApp";
import { acceptedProposal } from "./review-coordinator.test";

describe("CoachingPane adaptation entry", () => {
  it("only shows the pending card and records a declined timeline entry after Keep current plan", async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const fixtureSource = createDemoCoachingContextSource();
    const repository: WorkspaceRepository = {
      async load() {
        return null;
      },
      async save() {
        return "persistent";
      },
      async clear() {},
    };
    const application = createWorkspaceApplication({
      initialState: await fixtureSource.loadContext(),
      fixtureSource,
      repository,
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const renderPane = () => {
      const context = application.query({ type: "get_athlete_context" });
      root.render(
        createElement(CoachingPane, {
          context: context.data,
          plannedWorkouts: application.getState().trainingPlan.plannedWorkouts,
          pending: application.getState().pendingAdaptationProposal,
          declinedAdaptations: application.getState().declinedAdaptations,
          onReview: () => {},
        }),
      );
    };

    await act(async () => renderPane());
    expect(container.querySelector("#coaching-review-card")).toBeNull();

    await act(async () => {
      await application.openPlanReview(acceptedProposal(), "fallback");
      renderPane();
    });
    expect(container.querySelector("#coaching-review-card")).not.toBeNull();
    expect(container.textContent).toContain("Awaiting your review");
    expect(container.textContent).toContain("Based on:");
    expect(application.getState().trainingPlan.planVersion).toBe(1);

    await act(async () => {
      await application.declinePlanReview(acceptedProposal().reviewId);
      renderPane();
    });
    expect(container.querySelector("#coaching-review-card")).toBeNull();
    expect(container.textContent).toContain("Declined Adaptation");
    expect(container.textContent).toContain("kept current plan");
    expect(application.getState().trainingPlan.planVersion).toBe(1);

    await act(async () => root.unmount());
    container.remove();
  });
});
