// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { createReviewCoordinator } from "../src/application/createReviewCoordinator";
import { createWorkspaceApplication } from "../src/application/createWorkspaceApplication";
import type { WorkspaceRepository } from "../src/application/ports";
import { createDemoCoachingContextSource } from "../src/demo/demoCoachingContextSource";
import { AdaptationScreen } from "../src/ui/WorkspaceApp";
import { acceptedProposal } from "./review-coordinator.test";

describe("AdaptationScreen", () => {
  it("renders a pushed, accessible review with an explicit selection", async () => {
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
    const coordinator = createReviewCoordinator({ application });
    coordinator.open(acceptedProposal());
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(AdaptationScreen, {
          application,
          coordinator,
          reviewId: acceptedProposal().reviewId,
          onBack: () => {},
          onDecided: () => {},
        }),
      );
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector("h1")?.textContent).toContain(
      "Workout Adaptation",
    );
    expect(container.textContent).toContain("Coach Recommendation");
    expect(container.textContent).toContain("Recovery first");
    expect(container.textContent).toContain("Keep current plan");
    expect(container.querySelector("details")).not.toBeNull();
    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="Adapt my plan: Recovery first"]',
      )?.disabled,
    ).toBe(true);

    const alternative = container.querySelector<HTMLButtonElement>(
      '[aria-label="Alternative — Keep the rhythm"]',
    );
    expect(alternative).not.toBeNull();
    await act(async () => alternative?.click());
    expect(alternative?.getAttribute("aria-pressed")).toBe("true");
    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="Adapt my plan: Keep the rhythm"]',
      )?.disabled,
    ).toBe(false);

    await act(async () => root.unmount());
    container.remove();
  });
});
