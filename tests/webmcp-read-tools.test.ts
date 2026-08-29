import { describe, expect, it } from "vitest";

import { createWorkspaceApplication } from "../src/application/createWorkspaceApplication";
import { createReviewCoordinator } from "../src/application/createReviewCoordinator";
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
import type { ReviewProposal } from "../src/domain/review";

function reviewProposal(): ReviewProposal {
  const prescription = (distanceKm: number) => ({
    blocks: [{ kind: "easy" as const, distanceKm }],
  });
  return {
    reviewId: "review:webmcp",
    sourceWorkoutId: "planned-2026-08-26-threshold",
    expectedPlanVersion: 2,
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
      summary: "Reduce accumulated load.",
      tradeoff: "Loses weekly volume.",
      workoutChanges: [
        { kind: "delete", workoutId: "planned-2026-08-27-recovery" },
        {
          kind: "update",
          workoutId: "planned-2026-08-29-strides",
          changes: {
            title: "Easy run",
            distanceKm: 6,
            prescription: prescription(6),
          },
        },
        {
          kind: "update",
          workoutId: "planned-2026-08-30-long",
          changes: {
            title: "Easy long run",
            distanceKm: 14,
            prescription: prescription(14),
          },
        },
      ],
    },
    alternative: {
      optionId: "keep-the-rhythm",
      label: "Keep the rhythm",
      summary: "Preserve more aerobic volume.",
      tradeoff: "Provides less recovery.",
      workoutChanges: [
        {
          kind: "update",
          workoutId: "planned-2026-08-27-recovery",
          changes: {
            title: "Very easy run",
            distanceKm: 5,
            prescription: prescription(5),
          },
        },
        {
          kind: "update",
          workoutId: "planned-2026-08-29-strides",
          changes: {
            title: "Easy run",
            distanceKm: 6,
            prescription: prescription(6),
          },
        },
        {
          kind: "update",
          workoutId: "planned-2026-08-30-long",
          changes: {
            title: "Easy long run",
            distanceKm: 16,
            prescription: prescription(16),
          },
        },
      ],
    },
  };
}

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
  it("publishes safe ephemeral activity without exposing tool data or errors", async () => {
    const application = await createApplication();
    const coordinator = createReviewCoordinator({ application });
    const { host, registrations } = createRecordingHost();
    const activity: Array<{
      status: string;
      toolName: string;
      message: string;
    }> = [];

    await registerWebMcpTools(host, application, {
      reviewMode: "fallback",
      reviewCoordinator: coordinator,
      onActivity: (event) => activity.push(event),
    });
    const planTool = registrations.find(
      ({ tool }) => tool.name === "get_training_plan",
    )!.tool;

    await planTool.execute(
      { from: "invalid private input", to: "2026-08-30" },
      { signal: new AbortController().signal },
    );

    expect(activity).toEqual([
      {
        status: "running",
        toolName: "get_training_plan",
        message: "Coach Agent is reading the Training Plan.",
      },
      {
        status: "error",
        toolName: "get_training_plan",
        message:
          "The request could not be completed. Your Training Plan was not changed.",
      },
    ]);
    expect(JSON.stringify(activity)).not.toContain("invalid private input");
  });

  it("keeps tool behavior independent from the UI activity observer", async () => {
    const application = await createApplication();
    const coordinator = createReviewCoordinator({ application });
    const { host, registrations } = createRecordingHost();
    await registerWebMcpTools(host, application, {
      reviewMode: "fallback",
      reviewCoordinator: coordinator,
      onActivity: () => {
        throw new Error("UI observer failed");
      },
    });
    const planTool = registrations.find(
      ({ tool }) => tool.name === "get_training_plan",
    )!.tool;

    await expect(
      planTool.execute(
        { from: "2026-08-24", to: "2026-08-30" },
        { signal: new AbortController().signal },
      ),
    ).resolves.toMatchObject({ status: "ok", data: { planVersion: 2 } });
  });

  it("keeps primary and fallback review registrations mutually exclusive", async () => {
    for (const mode of ["primary", "fallback"] as const) {
      const application = await createApplication();
      const coordinator = createReviewCoordinator({ application });
      const { host, registrations } = createRecordingHost();

      const registration = await registerWebMcpTools(host, application, {
        reviewMode: mode,
        reviewCoordinator: coordinator,
      });
      const names = registrations.map(({ tool }) => tool.name);

      expect(names.includes("review_workout_adaptation")).toBe(
        mode === "primary",
      );
      expect(names.includes("open_workout_adaptation_review")).toBe(
        mode === "fallback",
      );
      expect(names.includes("read_workout_adaptation_decision")).toBe(
        mode === "fallback",
      );
      expect(registration.toolNames).toEqual(names);
    }
  });

  it("teaches the fallback tools the six-step coaching lifecycle", async () => {
    const application = await createApplication();
    const coordinator = createReviewCoordinator({ application });
    const { host, registrations } = createRecordingHost();

    await registerWebMcpTools(host, application, {
      reviewMode: "fallback",
      reviewCoordinator: coordinator,
    });

    expect(registrations.map(({ tool }) => tool.name)).toEqual([
      "get_athlete_context",
      "get_training_plan",
      "get_workout_context",
      "record_athlete_feedback",
      "open_workout_adaptation_review",
      "read_workout_adaptation_decision",
    ]);
    expect(registrations).toHaveLength(6);

    const descriptionFor = (name: string) =>
      registrations.find(({ tool }) => tool.name === name)!.tool.description;
    expect(descriptionFor("get_athlete_context")).toMatch(/start here/i);
    expect(descriptionFor("record_athlete_feedback")).toMatch(
      /record.*before.*propos/i,
    );
    expect(descriptionFor("get_training_plan")).toMatch(/planVersion/i);
    expect(descriptionFor("get_workout_context")).toMatch(
      /Planned Workout ID/i,
    );
    expect(descriptionFor("open_workout_adaptation_review")).toMatch(
      /exactly two.*on-page review/i,
    );
    expect(descriptionFor("read_workout_adaptation_decision")).toMatch(
      /same reviewId.*terminal/i,
    );

    const feedbackTool = registrations.find(
      ({ tool }) => tool.name === "record_athlete_feedback",
    )!.tool;
    const properties = (
      feedbackTool.inputSchema as {
        properties: Record<string, unknown>;
      }
    ).properties;
    expect(Object.keys(properties)).toEqual([
      "requestId",
      "relatedWorkoutId",
      "rawText",
      "reported",
    ]);
    expect(properties).not.toHaveProperty("relatedWorkoutResultId");
  });

  it("opens a fallback review immediately and reports not_ready while it is active", async () => {
    const application = await createApplication();
    const coordinator = createReviewCoordinator({ application });
    const { host, registrations } = createRecordingHost();
    await registerWebMcpTools(host, application, {
      reviewMode: "fallback",
      reviewCoordinator: coordinator,
    });
    const tools = Object.fromEntries(
      registrations.map(({ tool }) => [tool.name, tool]),
    );
    const execution = { signal: new AbortController().signal };

    await expect(
      tools.open_workout_adaptation_review.execute(
        reviewProposal() as unknown as Record<string, unknown>,
        execution,
      ),
    ).resolves.toEqual({
      status: "review_opened",
      reviewId: "review:webmcp",
    });
    await expect(
      tools.read_workout_adaptation_decision.execute(
        { reviewId: "review:webmcp" },
        execution,
      ),
    ).resolves.toEqual({
      status: "not_ready",
      reviewId: "review:webmcp",
    });
    expect(application.getState().trainingPlan.planVersion).toBe(2);
  });

  it("opens a fallback review from a JSON-compatible host-shaped nested input", async () => {
    const application = await createApplication();
    const coordinator = createReviewCoordinator({ application });
    const { host, registrations } = createRecordingHost();
    await registerWebMcpTools(host, application, {
      reviewMode: "fallback",
      reviewCoordinator: coordinator,
    });
    const tools = Object.fromEntries(
      registrations.map(({ tool }) => [tool.name, tool]),
    );
    const execution = { signal: new AbortController().signal };
    const proposal = reviewProposal() as unknown as Record<string, unknown>;
    proposal.recommended = new Proxy(
      proposal.recommended as Record<string, unknown>,
      {},
    );

    expect(() => structuredClone(proposal)).toThrow();
    await expect(
      tools.open_workout_adaptation_review.execute(proposal, execution),
    ).resolves.toEqual({
      status: "review_opened",
      reviewId: "review:webmcp",
    });
    expect(coordinator.getState()).toMatchObject({
      status: "reviewing",
      proposal: { reviewId: "review:webmcp" },
    });
    expect(application.getState().trainingPlan.planVersion).toBe(2);
  });

  it("opens a fallback review when a host omits execution options", async () => {
    const application = await createApplication();
    const coordinator = createReviewCoordinator({ application });
    const { host, registrations } = createRecordingHost();
    await registerWebMcpTools(host, application, {
      reviewMode: "fallback",
      reviewCoordinator: coordinator,
    });
    const tool = registrations.find(
      ({ tool }) => tool.name === "open_workout_adaptation_review",
    )!.tool;

    await expect(
      (tool.execute as (input: Record<string, unknown>) => Promise<unknown>)(
        reviewProposal() as unknown as Record<string, unknown>,
      ),
    ).resolves.toEqual({
      status: "review_opened",
      reviewId: "review:webmcp",
    });
    expect(coordinator.getState()).toMatchObject({
      status: "reviewing",
      proposal: { reviewId: "review:webmcp" },
    });
    expect(application.getState().trainingPlan.planVersion).toBe(2);
  });

  it("stores one non-mutating fallback cancellation when the host aborts", async () => {
    const application = await createApplication();
    const coordinator = createReviewCoordinator({ application });
    const { host, registrations } = createRecordingHost();
    await registerWebMcpTools(host, application, {
      reviewMode: "fallback",
      reviewCoordinator: coordinator,
    });
    const tools = Object.fromEntries(
      registrations.map(({ tool }) => [tool.name, tool]),
    );
    const controller = new AbortController();

    await tools.open_workout_adaptation_review.execute(
      reviewProposal() as unknown as Record<string, unknown>,
      { signal: controller.signal },
    );
    controller.abort();
    await expect.poll(() => coordinator.getState()).toEqual({ status: "idle" });

    await expect(
      tools.read_workout_adaptation_decision.execute(
        { reviewId: "review:webmcp" },
        { signal: new AbortController().signal },
      ),
    ).resolves.toEqual({
      status: "cancelled",
      reviewId: "review:webmcp",
      reason: "host_aborted",
    });
    expect(application.getState().trainingPlan.planVersion).toBe(2);
  });

  it("persists fallback approval with its plan state and delivers it exactly once", async () => {
    const fixtureSource = createDemoCoachingContextSource();
    const initialState = structuredClone(await fixtureSource.loadContext());
    initialState.trainingPlan.planVersion = 2;
    const saves: PersistedWorkspace[] = [];
    const repository: WorkspaceRepository = {
      async load() {
        return null;
      },
      async save(workspace) {
        saves.push(structuredClone(workspace));
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
    const { host, registrations } = createRecordingHost();
    await registerWebMcpTools(host, application, {
      reviewMode: "fallback",
      reviewCoordinator: coordinator,
    });
    const tools = Object.fromEntries(
      registrations.map(({ tool }) => [tool.name, tool]),
    );
    const execution = { signal: new AbortController().signal };

    await tools.open_workout_adaptation_review.execute(
      reviewProposal() as unknown as Record<string, unknown>,
      execution,
    );
    coordinator.select("recovery-first");
    await coordinator.approve();

    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({
      schemaVersion: 1,
      state: { trainingPlan: { planVersion: 3 } },
      undeliveredFallbackResult: {
        status: "approved",
        reviewId: "review:webmcp",
        planVersionBefore: 2,
        planVersionAfter: 3,
      },
    });
    await expect(
      tools.open_workout_adaptation_review.execute(
        reviewProposal() as unknown as Record<string, unknown>,
        execution,
      ),
    ).resolves.toMatchObject({ status: "error", code: "busy" });
    await expect(
      tools.read_workout_adaptation_decision.execute(
        { reviewId: "review:webmcp" },
        execution,
      ),
    ).resolves.toMatchObject({
      status: "approved",
      reviewId: "review:webmcp",
      planVersionAfter: 3,
      durability: "persistent",
    });
    await expect(
      tools.read_workout_adaptation_decision.execute(
        { reviewId: "review:webmcp" },
        execution,
      ),
    ).resolves.toEqual({
      status: "not_ready",
      reviewId: "review:webmcp",
    });
    expect(saves).toHaveLength(2);
    expect(saves[1].undeliveredFallbackResult).toBeUndefined();
  });

  it("stores a non-mutating fallback discussion, blocks another open, and serializes reads", async () => {
    const application = await createApplication();
    const coordinator = createReviewCoordinator({ application });
    const { host, registrations } = createRecordingHost();
    await registerWebMcpTools(host, application, {
      reviewMode: "fallback",
      reviewCoordinator: coordinator,
    });
    const tools = Object.fromEntries(
      registrations.map(({ tool }) => [tool.name, tool]),
    );
    const execution = { signal: new AbortController().signal };
    const proposal = reviewProposal() as unknown as Record<string, unknown>;

    await tools.open_workout_adaptation_review.execute(proposal, execution);
    await coordinator.discussFurther();
    await expect(
      tools.open_workout_adaptation_review.execute(proposal, execution),
    ).resolves.toMatchObject({ status: "error", code: "busy" });

    const [first, concurrent] = await Promise.all([
      tools.read_workout_adaptation_decision.execute(
        { reviewId: "review:webmcp" },
        execution,
      ),
      tools.read_workout_adaptation_decision.execute(
        { reviewId: "review:webmcp" },
        execution,
      ),
    ]);
    expect(first).toEqual({
      status: "discuss_further",
      reviewId: "review:webmcp",
    });
    expect(concurrent).toEqual({
      status: "not_ready",
      reviewId: "review:webmcp",
    });
    await expect(
      tools.open_workout_adaptation_review.execute(proposal, execution),
    ).resolves.toEqual({
      status: "review_opened",
      reviewId: "review:webmcp",
    });
  });

  it("orders teardown cancellation after an in-flight fallback approval save", async () => {
    const fixtureSource = createDemoCoachingContextSource();
    const initialState = structuredClone(await fixtureSource.loadContext());
    initialState.trainingPlan.planVersion = 2;
    let releaseFirstSave!: () => void;
    const firstSaveGate = new Promise<void>(
      (resolve) => (releaseFirstSave = resolve),
    );
    const saves: PersistedWorkspace[] = [];
    const application = createWorkspaceApplication({
      initialState,
      fixtureSource,
      repository: {
        async load() {
          return null;
        },
        async save(workspace) {
          saves.push(structuredClone(workspace));
          if (saves.length === 1) await firstSaveGate;
          return "persistent";
        },
        async clear() {},
      },
    });
    const coordinator = createReviewCoordinator({ application });
    const { host, registrations } = createRecordingHost();
    const registration = await registerWebMcpTools(host, application, {
      reviewMode: "fallback",
      reviewCoordinator: coordinator,
    });
    const tools = Object.fromEntries(
      registrations.map(({ tool }) => [tool.name, tool]),
    );
    const execution = { signal: new AbortController().signal };
    await tools.open_workout_adaptation_review.execute(
      reviewProposal() as unknown as Record<string, unknown>,
      execution,
    );
    coordinator.select("recovery-first");

    const approval = coordinator.approve();
    await Promise.resolve();
    registration.cleanup();
    registration.cleanup();
    releaseFirstSave();

    await expect(approval).resolves.toMatchObject({
      status: "error",
      code: "cancelled",
    });
    await expect(
      application.readFallbackResult("review:webmcp"),
    ).resolves.toEqual({
      status: "cancelled",
      reviewId: "review:webmcp",
      reason: "teardown",
    });
    expect(application.getState().trainingPlan.planVersion).toBe(2);
    expect(saves).toHaveLength(3);
    expect(saves[0]).toMatchObject({
      state: { trainingPlan: { planVersion: 3 } },
      undeliveredFallbackResult: { status: "approved" },
    });
    expect(saves[1]).toMatchObject({
      state: { trainingPlan: { planVersion: 2 } },
      undeliveredFallbackResult: {
        status: "cancelled",
        reason: "teardown",
      },
    });
  });

  it("keeps an accepted primary call pending through selection and settles discussion", async () => {
    const application = await createApplication();
    const coordinator = createReviewCoordinator({ application });
    const { host, registrations } = createRecordingHost();
    await registerWebMcpTools(host, application, {
      reviewMode: "primary",
      reviewCoordinator: coordinator,
    });
    const tool = registrations.find(
      ({ tool }) => tool.name === "review_workout_adaptation",
    )!.tool;
    let settled = false;
    const pending = tool
      .execute(reviewProposal() as unknown as Record<string, unknown>, {
        signal: new AbortController().signal,
      })
      .then((result) => {
        settled = true;
        return result;
      });

    await Promise.resolve();
    expect(settled).toBe(false);
    expect(coordinator.getState()).toMatchObject({ status: "reviewing" });
    coordinator.select("recovery-first");
    await Promise.resolve();
    expect(settled).toBe(false);
    coordinator.discussFurther();
    await expect(pending).resolves.toEqual({
      status: "discuss_further",
      reviewId: "review:webmcp",
    });
    expect(application.getState().trainingPlan.planVersion).toBe(2);
  });

  it("returns invalid, stale, and busy primary outcomes immediately", async () => {
    const application = await createApplication();
    const coordinator = createReviewCoordinator({ application });
    const { host, registrations } = createRecordingHost();
    await registerWebMcpTools(host, application, {
      reviewMode: "primary",
      reviewCoordinator: coordinator,
    });
    const tool = registrations.find(
      ({ tool }) => tool.name === "review_workout_adaptation",
    )!.tool;
    const execution = { signal: new AbortController().signal };

    await expect(tool.execute({}, execution)).resolves.toMatchObject({
      status: "error",
      code: "invalid_input",
      issues: expect.arrayContaining([
        expect.objectContaining({ path: expect.any(String) }),
      ]),
    });
    const stale = reviewProposal();
    stale.expectedPlanVersion = 1;
    await expect(
      tool.execute(stale as unknown as Record<string, unknown>, execution),
    ).resolves.toMatchObject({ status: "error", code: "stale_plan" });

    coordinator.open(reviewProposal());
    await expect(
      tool.execute(
        reviewProposal() as unknown as Record<string, unknown>,
        execution,
      ),
    ).resolves.toMatchObject({ status: "error", code: "busy" });
  });

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
