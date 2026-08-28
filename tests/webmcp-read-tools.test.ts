import { describe, expect, it } from "vitest";

import { createWorkspaceApplication } from "../src/application/createWorkspaceApplication";
import type {
  PersistedWorkspace,
  WorkspaceRepository,
} from "../src/application/ports";
import {
  registerWebMcpReadTools,
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

describe("WebMCP coaching read tools", () => {
  it("registers the three read-only tools once with actionable metadata and schemas", async () => {
    const application = await createApplication();
    const { host, registrations } = createRecordingHost();

    const registration = await registerWebMcpReadTools(host, application);

    expect(registration).toMatchObject({
      status: "connected",
      toolNames: [
        "get_athlete_context",
        "get_training_plan",
        "get_workout_context",
      ],
    });
    expect(registrations).toHaveLength(3);
    expect(registrations.map(({ tool }) => tool.name)).toEqual(
      registration.toolNames,
    );
    expect(registrations.map(({ tool }) => tool.title)).toEqual([
      "Get athlete context",
      "Get training plan",
      "Get workout context",
    ]);
    for (const { tool, signal } of registrations) {
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
          description: "Stable Planned Workout ID returned by get_training_plan.",
        },
      },
      required: ["workoutId"],
      additionalProperties: false,
    });
  });

  it("executes every tool against the application's current authoritative state", async () => {
    const application = await createApplication();
    const { host, registrations } = createRecordingHost();
    await registerWebMcpReadTools(host, application);
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
    await registerWebMcpReadTools(host, application);
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

  it("aborts all registrations once during cleanup", async () => {
    const application = await createApplication();
    const { host, registrations } = createRecordingHost();
    const registration = await registerWebMcpReadTools(host, application);

    registration.cleanup();
    registration.cleanup();

    expect(registrations.every(({ signal }) => signal?.aborted)).toBe(true);
  });

  it("reports unavailable without attempting registration when the host is absent", async () => {
    const application = await createApplication();

    const registration = await registerWebMcpReadTools(undefined, application);

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

    const registration = await registerWebMcpReadTools(host, application);

    expect(registration).toMatchObject({
      status: "error",
      toolNames: [],
      message: "Coach Agent tools could not be connected.",
    });
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
