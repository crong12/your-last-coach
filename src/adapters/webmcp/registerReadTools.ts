import type { WorkspaceApplication } from "../../application/createWorkspaceApplication";
import type { ReviewCoordinator } from "../../application/createReviewCoordinator";
import type {
  CoachAgentConnection,
  ModelContextHost,
  ToolActivity,
  WebMcpRegistration,
  WebMcpTool,
} from "./types";

export type { ModelContextHost, WebMcpTool } from "./types";

function normalizeHostValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeHostValue);
  }
  if (value !== null && typeof value === "object") {
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      normalized[key] = normalizeHostValue(
        (value as Record<string, unknown>)[key],
      );
    }
    return normalized;
  }
  return value;
}

const COACH_INTERACTION_CONTRACT = {
  version: "1.0",
  sequence: [
    {
      step: "read_evidence",
      instruction:
        "Read this briefing, the relevant Training Plan range, and source workout context before deciding what to recommend.",
    },
    {
      step: "record_feedback",
      instruction:
        "When the current Athlete message reports new workout experience, obtain any host-required consent before recording it and before composing or presenting adaptations; then record the exact report.",
    },
    {
      step: "prepare_review",
      instruction:
        "After recording feedback, prepare one recommendation and one meaningful alternative grounded in returned evidence. Do not present the options in conversation.",
    },
    {
      step: "open_review",
      instruction:
        "Open the native review as the first user-facing presentation of both options; never apply a Training Plan directly.",
    },
    {
      step: "await_decision",
      instruction:
        "Wait for the Athlete's on-page decision. Selecting an option alone does not mutate the Training Plan.",
    },
    {
      step: "read_decision",
      instruction:
        "Use the same reviewId to read the terminal approved, discuss_further, or cancelled result.",
    },
  ],
  approvalBoundaries: {
    feedbackRecordingConsent:
      "Consent to record Athlete Feedback authorizes only that feedback write.",
    planApproval:
      "Only the Athlete pressing Adapt my plan authorizes Training Plan mutation.",
  },
} as const;

function safeExecution(
  execute: (
    input: Record<string, unknown>,
    options?: { signal: AbortSignal },
  ) => unknown | Promise<unknown>,
): WebMcpTool["execute"] {
  return async (input, options) => {
    try {
      return await execute(input, options);
    } catch {
      return {
        status: "error",
        code: "internal_error",
        message: "The Coach Agent request could not be completed.",
        retryable: true,
      };
    }
  };
}

export type ReviewMode = "fallback";

interface RegisterWebMcpOptions {
  reviewMode: ReviewMode;
  reviewCoordinator: ReviewCoordinator;
  onActivity?: (activity: ToolActivity) => void;
}

const TOOL_ACTIVITY_LABELS: Record<string, string> = {
  get_coaching_briefing: "reading the Coaching Briefing",
  get_training_plan: "reading the Training Plan",
  get_workout_context: "reading the workout context",
  record_athlete_feedback: "recording Athlete Feedback",
  open_workout_adaptation_review: "opening the adaptation review",
  read_workout_adaptation_decision: "reading your adaptation decision",
};

function withActivity(
  tool: WebMcpTool,
  onActivity?: (activity: ToolActivity) => void,
): WebMcpTool {
  if (!onActivity) return tool;
  const activityLabel =
    TOOL_ACTIVITY_LABELS[tool.name] ?? "using the workspace";
  const publish = (activity: ToolActivity) => {
    try {
      onActivity(activity);
    } catch {
      // UI observation must never alter the public tool result.
    }
  };
  return {
    ...tool,
    async execute(input, execution) {
      publish({
        status: "running",
        toolName: tool.name,
        message: `Coach Agent is ${activityLabel}.`,
      });
      const result = await tool.execute(input, execution);
      const status =
        typeof result === "object" && result !== null && "status" in result
          ? String(result.status)
          : "ok";
      if (status === "error") {
        publish({
          status: "error",
          toolName: tool.name,
          message:
            "The request could not be completed. Your Training Plan was not changed.",
        });
      } else if (status === "not_ready") {
        publish({
          status: "waiting",
          toolName: tool.name,
          message: "Waiting for your decision.",
        });
      } else if (status === "review_opened") {
        publish({
          status: "success",
          toolName: tool.name,
          message: "Review opened in the workspace.",
        });
      } else {
        publish({
          status: "success",
          toolName: tool.name,
          message: `${tool.title} completed.`,
        });
      }
      return result;
    },
  };
}

const reviewProposalSchema: WebMcpTool["inputSchema"] = {
  type: "object",
  properties: {
    reviewId: { type: "string", minLength: 1 },
    sourceWorkoutId: { type: "string", minLength: 1 },
    expectedPlanVersion: { type: "integer", minimum: 1 },
    evidenceRefs: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { type: "string", minLength: 1 },
    },
    rationale: {
      type: "object",
      properties: {
        summary: { type: "string", minLength: 1 },
        counterEvidence: { type: "string", minLength: 1 },
        confidence: { type: "string", enum: ["low", "moderate", "high"] },
        limitations: {
          type: "array",
          minItems: 1,
          items: { type: "string", minLength: 1 },
        },
      },
      required: ["summary", "counterEvidence", "confidence", "limitations"],
      additionalProperties: false,
    },
    recommended: { $ref: "#/$defs/adaptationOption" },
    alternative: { $ref: "#/$defs/adaptationOption" },
  },
  required: [
    "reviewId",
    "sourceWorkoutId",
    "expectedPlanVersion",
    "evidenceRefs",
    "rationale",
    "recommended",
    "alternative",
  ],
  additionalProperties: false,
  $defs: {
    prescription: {
      type: "object",
      properties: {
        blocks: { type: "array", minItems: 1, items: { type: "object" } },
      },
      required: ["blocks"],
      additionalProperties: false,
    },
    workoutChange: {
      oneOf: [
        {
          type: "object",
          properties: {
            kind: { const: "create" },
            workout: { type: "object" },
          },
          required: ["kind", "workout"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            kind: { const: "update" },
            workoutId: { type: "string", minLength: 1 },
            changes: {
              type: "object",
              properties: {
                date: { type: "string", format: "date" },
                title: { type: "string", minLength: 1 },
                purpose: { type: "string", minLength: 1 },
                distanceKm: { type: "number", exclusiveMinimum: 0 },
                prescription: { $ref: "#/$defs/prescription" },
              },
              minProperties: 1,
              additionalProperties: false,
            },
          },
          required: ["kind", "workoutId", "changes"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            kind: { const: "delete" },
            workoutId: { type: "string", minLength: 1 },
          },
          required: ["kind", "workoutId"],
          additionalProperties: false,
        },
      ],
    },
    adaptationOption: {
      type: "object",
      properties: {
        optionId: { type: "string", minLength: 1 },
        label: { type: "string", minLength: 1 },
        summary: { type: "string", minLength: 1 },
        tradeoff: { type: "string", minLength: 1 },
        workoutChanges: {
          type: "array",
          minItems: 1,
          items: { $ref: "#/$defs/workoutChange" },
        },
      },
      required: ["optionId", "label", "summary", "tradeoff", "workoutChanges"],
      additionalProperties: false,
    },
  },
} as WebMcpTool["inputSchema"];

function createTools(
  application: WorkspaceApplication,
  options?: RegisterWebMcpOptions,
): WebMcpTool[] {
  const annotations = {
    readOnlyHint: true,
    untrustedContentHint: false,
  } as const;

  const tools: WebMcpTool[] = [
    {
      name: "get_coaching_briefing",
      title: "Get coaching briefing",
      description:
        "Start here for the bounded Coaching Briefing and structured interaction contract for this workspace.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations,
      execute: safeExecution(() => {
        const briefing = application.query({ type: "get_athlete_context" });
        return {
          ...briefing,
          data: {
            ...briefing.data,
            interactionContract: structuredClone(COACH_INTERACTION_CONTRACT),
          },
        };
      }),
    },
    {
      name: "get_training_plan",
      title: "Get training plan",
      description:
        "Retrieve the relevant date range from the current planVersion; use returned Planned Workout IDs in later calls and proposals.",
      inputSchema: {
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
      },
      annotations,
      execute: safeExecution((input) =>
        application.query({
          type: "get_training_plan",
          from: input.from,
          to: input.to,
        }),
      ),
    },
    {
      name: "get_workout_context",
      title: "Get workout context",
      description:
        "Inspect the prescription, result, and feedback for one returned Planned Workout ID before explaining what happened.",
      inputSchema: {
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
      },
      annotations,
      execute: safeExecution((input) =>
        application.query({
          type: "get_workout_context",
          workoutId: input.workoutId,
        }),
      ),
    },
  ];
  tools.push({
    name: "record_athlete_feedback",
    title: "Record athlete feedback",
    description:
      "Record the current Athlete message when it reports new workout experience; preserve the raw words and only explicitly stated structured fields before proposing related changes. The result includes evidenceRef; reuse that value verbatim in a later adaptation proposal. Reusing the same requestId returns the original feedback without recording twice.",
    inputSchema: {
      type: "object",
      properties: {
        requestId: {
          type: "string",
          minLength: 1,
          description: "Stable idempotency key for this feedback report.",
        },
        relatedWorkoutId: {
          type: "string",
          minLength: 1,
          description:
            "Stable Planned Workout ID returned by get_training_plan.",
        },
        rawText: {
          type: "string",
          minLength: 1,
          description: "The Athlete’s natural-language statement, unchanged.",
        },
        reported: {
          type: "object",
          properties: {
            sessionRpe: { type: "number", minimum: 0, maximum: 10 },
            legFeel: { type: "string", minLength: 1 },
            painReported: { type: "boolean" },
            stoppedReason: { type: "string", minLength: 1 },
          },
          additionalProperties: false,
        },
      },
      required: ["requestId", "relatedWorkoutId", "rawText"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: false,
    },
    execute: safeExecution((input) =>
      application.command({
        type: "record_athlete_feedback",
        requestId: input.requestId,
        relatedWorkoutId: input.relatedWorkoutId,
        rawText: input.rawText,
        reported: input.reported,
      }),
    ),
  });
  if (options?.reviewMode === "fallback") {
    tools.push(
      {
        name: "open_workout_adaptation_review",
        title: "Open workout adaptation review",
        description:
          "Submit evidence-grounded rationale and exactly two ranked, structurally different options; open the on-page review; never apply a plan directly; the call returns immediately.",
        inputSchema: reviewProposalSchema,
        annotations: {
          readOnlyHint: false,
          untrustedContentHint: false,
        },
        execute: safeExecution((input, execution) =>
          options.reviewCoordinator.openAndPersist(
            normalizeHostValue(input),
            "fallback",
            execution?.signal,
          ),
        ),
      },
      {
        name: "read_workout_adaptation_decision",
        title: "Read workout adaptation decision",
        description:
          "Use the same reviewId after opening; poll only as needed until approved, declined, discuss_further, or cancelled; return the Athlete-controlled terminal outcome.",
        inputSchema: {
          type: "object",
          properties: { reviewId: { type: "string", minLength: 1 } },
          required: ["reviewId"],
          additionalProperties: false,
        },
        annotations,
        execute: safeExecution((input) =>
          application.readFallbackResult(input.reviewId),
        ),
      },
    );
  }
  return tools;
}

function withCleanup(
  connection: CoachAgentConnection,
  controller?: AbortController,
  onCleanup?: () => void,
): WebMcpRegistration {
  let cleanedUp = false;
  return {
    ...connection,
    cleanup() {
      if (cleanedUp) return;
      cleanedUp = true;
      controller?.abort();
      onCleanup?.();
    },
  };
}

export async function registerWebMcpTools(
  host: ModelContextHost | undefined,
  application: WorkspaceApplication,
  options?: RegisterWebMcpOptions,
): Promise<WebMcpRegistration> {
  if (!host) {
    return withCleanup({
      status: "unavailable",
      toolNames: [],
      message: "Coach Agent tools are unavailable in this browser.",
    });
  }

  const controller = new AbortController();
  try {
    const tools = createTools(application, options).map((tool) =>
      withActivity(tool, options?.onActivity),
    );
    for (const tool of tools) {
      await host.registerTool(tool, { signal: controller.signal });
    }
    return withCleanup(
      {
        status: "connected",
        toolNames: tools.map(({ name }) => name),
        message: "Coach Agent tools are connected.",
      },
      controller,
      options?.reviewCoordinator.dispose,
    );
  } catch {
    controller.abort();
    return withCleanup({
      status: "error",
      toolNames: [],
      message: "Coach Agent tools could not be connected.",
    });
  }
}
