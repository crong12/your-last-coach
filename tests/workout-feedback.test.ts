// @vitest-environment jsdom

import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Durability } from "../src/application/ports";
import type { WorkspaceApplication } from "../src/application/createWorkspaceApplication";
import { selectWorkoutContext } from "../src/application/readSelectors";
import { createDemoWorkspaceState } from "../src/demo/demoFixture";
import type { AthleteFeedback } from "../src/domain/types";
import { WorkoutFeedback } from "../src/ui/WorkspaceApp";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const selectedContext = selectWorkoutContext(createDemoWorkspaceState(), {
  workoutId: "planned-2026-08-06-threshold",
});
if (selectedContext.status !== "ok") {
  throw new Error("Expected a Workout Result context");
}

const context = selectedContext.data;

let container: HTMLDivElement | undefined;
let root: Root | undefined;

function renderFeedback(
  application: WorkspaceApplication,
  onDurability: (durability: Durability) => void = vi.fn(),
) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      createElement(WorkoutFeedback, {
        context,
        application,
        onDurability,
      }),
    );
  });
}

function click(selector: string) {
  const element = container?.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function fill(value: string) {
  const textarea = container?.querySelector<HTMLTextAreaElement>("textarea");
  if (!textarea) throw new Error("Missing feedback textarea");
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(textarea, value);
    textarea.dispatchEvent(
      new InputEvent("input", { bubbles: true, data: value }),
    );
  });
}

async function submit() {
  const form = container?.querySelector<HTMLFormElement>("form");
  if (!form) throw new Error("Missing feedback form");
  await act(async () => {
    form.dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe("Workout Feedback UI", () => {
  it("keeps the draft focused on application error and reuses one request ID on retry", async () => {
    const feedback = {
      id: "athlete-feedback:retry-feedback",
      requestId: "retry-feedback",
      relatedWorkoutId: "planned-2026-08-06-threshold",
      relatedWorkoutResultId: "result-2026-08-06-threshold",
      rawText: "The second attempt was controlled.",
      recordedAt: "2026-08-30T20:15:00+01:00",
    } satisfies AthleteFeedback;
    const command = vi
      .fn()
      .mockResolvedValueOnce({
        status: "error",
        code: "invalid_input",
        message: "The feedback could not be saved.",
        retryable: false,
      })
      .mockResolvedValueOnce({
        status: "ok",
        feedback,
        durability: "persistent",
      });
    const application = { command } as unknown as WorkspaceApplication;

    renderFeedback(application);
    click(".workout-feedback__add");
    fill("The second attempt was controlled.");
    const requestId = container
      ?.querySelector("form")
      ?.getAttribute("data-feedback-request-id");
    expect(requestId).toBeTruthy();

    await submit();

    const error = container?.querySelector<HTMLElement>(
      ".workout-feedback__error",
    );
    const textarea = container?.querySelector<HTMLTextAreaElement>("textarea");
    expect(error?.textContent).toBe("The feedback could not be saved.");
    expect(error).toBe(document.activeElement);
    expect(textarea?.value).toBe("The second attempt was controlled.");

    await submit();

    expect(command).toHaveBeenCalledTimes(2);
    expect(command.mock.calls[0][0]).toMatchObject({
      type: "record_athlete_feedback",
      requestId,
      relatedWorkoutId: "planned-2026-08-06-threshold",
      rawText: "The second attempt was controlled.",
    });
    expect(command.mock.calls[1][0]).toMatchObject({
      type: "record_athlete_feedback",
      requestId,
      relatedWorkoutId: "planned-2026-08-06-threshold",
      rawText: "The second attempt was controlled.",
    });
  });

  it("keeps memory-only feedback visible while propagating durability", async () => {
    const feedback = {
      id: "athlete-feedback:memory-only-ui",
      requestId: "memory-only-ui",
      relatedWorkoutId: "planned-2026-08-06-threshold",
      relatedWorkoutResultId: "result-2026-08-06-threshold",
      rawText: "The result remains visible in memory.",
      recordedAt: "2026-08-30T20:15:00+01:00",
    } satisfies AthleteFeedback;
    const command = vi.fn().mockResolvedValue({
      status: "ok",
      feedback,
      durability: "memory_only",
    });
    const application = { command } as unknown as WorkspaceApplication;
    const durabilities: Durability[] = [];

    function StatefulFeedback() {
      const [athleteFeedback, setAthleteFeedback] = useState<AthleteFeedback[]>(
        [],
      );
      return createElement(WorkoutFeedback, {
        context: { ...context, athleteFeedback },
        application,
        onDurability: (durability) => {
          durabilities.push(durability);
          setAthleteFeedback([feedback]);
        },
      });
    }

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root!.render(createElement(StatefulFeedback)));

    click(".workout-feedback__add");
    fill(feedback.rawText);
    await submit();

    expect(durabilities).toEqual(["memory_only"]);
    expect(container?.textContent).toContain(feedback.rawText);
    expect(container?.textContent).not.toContain(
      "No Athlete Feedback recorded",
    );
  });
});
