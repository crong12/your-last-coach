import { describe, expect, it } from "vitest";

import { createWorkspaceApplication } from "../src/application/createWorkspaceApplication";
import type {
  PersistedWorkspace,
  WorkspaceRepository,
} from "../src/application/ports";
import {
  registerWebMcpTools,
  type ModelContextHost,
  type WebMcpTool,
} from "../src/adapters/webmcp/registerReadTools";
import { createDemoCoachingContextSource } from "../src/demo/demoCoachingContextSource";

async function createApplication() {
  const fixtureSource = createDemoCoachingContextSource();
  const initialState = structuredClone(await fixtureSource.loadContext());
  initialState.trainingPlan.planVersion = 2;
  const repository: WorkspaceRepository = {
    async load() {
      return null;
    },
    async save(_workspace: PersistedWorkspace) {
      return "persistent";
    },
    async clear() {},
  };
  return createWorkspaceApplication({
    initialState,
    fixtureSource,
    repository,
  });
}

function createRecordingHost() {
  const registrations: Array<{
    tool: WebMcpTool;
    signal: AbortSignal | undefined;
  }> = [];
  const host: ModelContextHost = {
    async registerTool(tool, options) {
      registrations.push({ tool, signal: options?.signal });
    },
  };
  return { host, registrations };
}

describe("WebMCP coaching tools", () => {
  it("registers three read tools and the retry-safe feedback mutation", async () => {
    const application = await createApplication();
    const { host, registrations } = createRecordingHost();

    const registration = await registerWebMcpTools(host, application);

    expect(registration).toMatchObject({
      status: "connected",
      toolNames: [
        "get_athlete_context",
        "get_training_plan",
        "get_workout_context",
        "record_athlete_feedback",
      ],
    });
    expect(registrations).toHaveLength(4);
    expect(registrations.map(({ tool }) => tool.name)).toEqual(
      registration.toolNames,
    );
    expect(registrations.map(({ tool }) => tool.title)).toEqual([
      "Get athlete context",
      "Get training plan",
      "Get workout context",
      "Record athlete feedback",
    ]);
    for (const { tool, signal } of registrations.slice(0, 3)) {
      expect(tool.description.length).toBeGreaterThan(30);
      expect(tool.annotations).toEqual({
        readOnlyHint: true,
        untrustedContentHint: false,
      });
      expect(tool.inputSchema).toMatchObject({
        type: "object",
        additionalProperties: false,
      });
      expect(signal?.aborted).toBe(false);
    }
    expect(registrations[0].tool.inputSchema).toEqual({
      type: "object",
      properties: {},
      additionalProperties: false,
    });
    expect(registrations[1].tool.inputSchema).toEqual({
      type: "object",
      properties: {
        from: {
          type: "string",
          format: "date",
          description: "First Planned Workout date to include, YYYY-MM-DD.",
        },
        to: {
          type: "string",
          format: "date",
          description: "Last Planned Workout date to include, YYYY-MM-DD.",
        },
      },
      required: ["from", "to"],
      additionalProperties: false,
    });
    expect(registrations[2].tool.inputSchema).toEqual({
      type: "object",
      properties: {
        workoutId: {
          type: "string",
          minLength: 1,
          description:
            "Stable Planned Workout ID returned by get_training_plan.",
        },
      },
      required: ["workoutId"],
      additionalProperties: false,
    });
    expect(registrations[3].tool.annotations).toEqual({
      readOnlyHint: false,
      untrustedContentHint: false,
    });
    expect(registrations[3].tool.description).toContain("requestId");
    expect(registrations[3].tool.inputSchema).toMatchObject({
      type: "object",
      required: ["requestId", "relatedWorkoutId", "rawText"],
      additionalProperties: false,
      properties: {
        requestId: { type: "string", minLength: 1 },
        relatedWorkoutId: { type: "string", minLength: 1 },
        rawText: { type: "string", minLength: 1 },
        reported: {
          type: "object",
          additionalProperties: false,
        },
      },
    });
  });

  it("records feedback through the application and exposes it through workout context", async () => {
    const application = await createApplication();
    const { host, registrations } = createRecordingHost();
    await registerWebMcpTools(host, application);
    const tools = Object.fromEntries(
      registrations.map(({ tool }) => [tool.name, tool]),
    );
    const execution = { signal: new AbortController().signal };

    const recorded = await tools.record_athlete_feedback.execute(
      {
        requestId: "webmcp-feedback",
        relatedWorkoutId: "planned-2026-08-26-threshold",
        rawText: "That was rough. No pain.",
        reported: { sessionRpe: 9, painReported: false },
      },
      execution,
    );
    const workout = await tools.get_workout_context.execute(
      { workoutId: "planned-2026-08-26-threshold" },
      execution,
    );

    expect(recorded).toMatchObject({
      status: "ok",
      feedback: {
        requestId: "webmcp-feedback",
        rawText: "That was rough. No pain.",
        reported: { sessionRpe: 9, painReported: false },
      },
    });
    expect(workout).toMatchObject({
      status: "ok",
      data: {
        athleteFeedback: [{ requestId: "webmcp-feedback" }],
      },
    });
  });

  it("executes every tool against the application's current authoritative state", async () => {
    const application = await createApplication();
    const { host, registrations } = createRecordingHost();
    await registerWebMcpTools(host, application);
    const tools = Object.fromEntries(
      registrations.map(({ tool }) => [tool.name, tool]),
    );
    const execution = { signal: new AbortController().signal };

    const athlete = await tools.get_athlete_context.execute({}, execution);
    const planBeforeReset = await tools.get_training_plan.execute(
      { from: "2026-08-24", to: "2026-08-30" },
      execution,
    );
    const workout = await tools.get_workout_context.execute(
      { workoutId: "planned-2026-08-26-threshold" },
      execution,
    );
    await application.command({ type: "reset_demo" });
    const planAfterReset = await tools.get_training_plan.execute(
      { from: "2026-08-24", to: "2026-08-30" },
      execution,
    );

    expect(athlete).toMatchObject({
      status: "ok",
      data: {
        athlete: { displayName: "Sam" },
        observations: { recovery: { percent: 46 } },
      },
    });
    expect(planBeforeReset).toMatchObject({
      status: "ok",
      data: { planVersion: 2 },
    });
    expect(planAfterReset).toMatchObject({
      status: "ok",
      data: { planVersion: 1 },
    });
    expect(workout).toMatchObject({
      status: "ok",
      data: {
        plannedWorkout: { id: "planned-2026-08-26-threshold" },
        workoutResult: { status: "partial" },
      },
    });
  });

  it("returns structured input and not-found errors through tool execution", async () => {
    const application = await createApplication();
    const { host, registrations } = createRecordingHost();
    await registerWebMcpTools(host, application);
    const tools = Object.fromEntries(
      registrations.map(({ tool }) => [tool.name, tool]),
    );
    const execution = { signal: new AbortController().signal };

    await expect(
      tools.get_training_plan.execute(
        { from: "2026-08-30", to: "2026-08-24" },
        execution,
      ),
    ).resolves.toEqual({
      status: "error",
      code: "invalid_input",
      message: "from must be on or before to.",
      retryable: false,
    });
    await expect(
      tools.get_workout_context.execute(
        { workoutId: "missing-workout" },
        execution,
      ),
    ).resolves.toMatchObject({
      status: "error",
      code: "not_found",
      retryable: false,
    });
  });

  it("converts unexpected asynchronous adapter failures to a safe error", async () => {
    const application = await createApplication();
    const before = application.getState();
    application.command = (async () => {
      throw new Error("private stack detail");
    }) as typeof application.command;
    const { host, registrations } = createRecordingHost();
    await registerWebMcpTools(host, application);
    const feedbackTool = registrations.find(
      ({ tool }) => tool.name === "record_athlete_feedback",
    )?.tool;
    if (!feedbackTool) throw new Error("Expected feedback tool");

    const outcome = await feedbackTool.execute(
      {
        requestId: "adapter-failure",
        relatedWorkoutId: "planned-2026-08-26-threshold",
        rawText: "Heavy legs.",
      },
      { signal: new AbortController().signal },
    );

    expect(outcome).toEqual({
      status: "error",
      code: "internal_error",
      message: "The Coach Agent request could not be completed.",
      retryable: true,
    });
    expect(JSON.stringify(outcome)).not.toContain("private stack detail");
    expect(application.getState()).toBe(before);
  });

  it("aborts all registrations once during cleanup", async () => {
    const application = await createApplication();
    const { host, registrations } = createRecordingHost();
    const registration = await registerWebMcpTools(host, application);

    registration.cleanup();
    registration.cleanup();

    expect(registrations.every(({ signal }) => signal?.aborted)).toBe(true);
  });

  it("reports unavailable without attempting registration when the host is absent", async () => {
    const application = await createApplication();

    const registration = await registerWebMcpTools(undefined, application);

    expect(registration).toMatchObject({
      status: "unavailable",
      toolNames: [],
    });
    expect(() => registration.cleanup()).not.toThrow();
  });

  it("rolls back partial registration and reports a safe error", async () => {
    const application = await createApplication();
    const signals: AbortSignal[] = [];
    const host: ModelContextHost = {
      async registerTool(_tool, options) {
        if (options?.signal) signals.push(options.signal);
        if (signals.length === 2) throw new Error("private host detail");
      },
    };

    const registration = await registerWebMcpTools(host, application);

    expect(registration).toMatchObject({
      status: "error",
      toolNames: [],
      message: "Coach Agent tools could not be connected.",
    });
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
