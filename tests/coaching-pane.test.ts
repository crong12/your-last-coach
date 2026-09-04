// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { createWorkspaceApplication } from "../src/application/createWorkspaceApplication";
import type { WorkspaceRepository } from "../src/application/ports";
import { createDemoCoachingContextSource } from "../src/demo/demoCoachingContextSource";
import { CoachingPane } from "../src/ui/WorkspaceApp";

async function createFixtureApplication() {
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
  return createWorkspaceApplication({
    initialState: await fixtureSource.loadContext(),
    fixtureSource,
    repository,
  });
}

describe("CoachingPane notebook", () => {
  it("renders seeded weekly reviews, active topics, and adaptation history without the retired composition", async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const application = await createFixtureApplication();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const context = application.query({ type: "get_athlete_context" });

    await act(async () => {
      root.render(
        createElement(CoachingPane, {
          context: context.data,
          plannedWorkouts: application.getState().trainingPlan.plannedWorkouts,
          onReview: () => {},
        }),
      );
    });

    expect(
      container.querySelector('[aria-label="Latest Weekly Progress Review"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain(
      "Strong long-run consistency, with one signal to watch",
    );
    expect(container.textContent).toContain("17–23 August 2026");
    expect(container.textContent).toContain("Recorded 24 August 2026");
    expect(container.textContent).toContain("Progress");
    expect(container.textContent).toContain("Watch");
    expect(container.textContent).toContain("Next focus");
    expect(
      container.querySelector('[aria-label="Weekly Progress Review archive"]'),
    ).not.toBeNull();
    expect(container.querySelectorAll(".review-archive-entry")).toHaveLength(2);
    expect(
      container.querySelector('[aria-label="Coaching Topics"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("Shin discomfort");
    expect(container.textContent).toContain(
      "The next Athlete report about a run.",
    );
    expect(
      container.querySelector('[aria-label="Adaptation History"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain(
      "Protect the long-run recovery window",
    );
    expect(container.textContent).toContain("Plan v0 → v1");
    const feedbackEvidence = Array.from(
      container.querySelectorAll("span"),
    ).find((element) => element.textContent?.includes("Athlete Feedback"));
    expect(
      feedbackEvidence?.classList.contains("evidence-reference-list__literal"),
    ).toBe(true);
    expect(
      Array.from(container.querySelectorAll("a")).some((element) =>
        element.textContent?.includes("Athlete Feedback"),
      ),
    ).toBe(false);

    expect(container.textContent).not.toContain("Coaching timeline");
    expect(container.textContent).not.toContain("Recent training");
    expect(container.textContent).not.toContain("Athlete Profile");

    await act(async () => root.unmount());
    container.remove();
  });

  it("renders quiet empty states for every notebook collection", async () => {
    const application = await createFixtureApplication();
    const result = application.query({ type: "get_athlete_context" });
    const context = {
      ...result.data,
      activeCoachingTopics: [],
      recentAdaptationHistory: [],
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CoachingPane, {
          context,
          plannedWorkouts: application.getState().trainingPlan.plannedWorkouts,
          reviews: [],
          seededAdaptations: [],
        }),
      );
    });

    expect(container.textContent).toContain("No completed review yet");
    expect(container.textContent).toContain("No active Coaching Topics");
    expect(container.textContent).toContain("No prior reviews yet");
    expect(container.textContent).toContain("No approved adaptations yet");

    await act(async () => root.unmount());
    container.remove();
  });
});
