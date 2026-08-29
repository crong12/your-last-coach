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

export const WEBMCP_TOOL_NAMES = [
  "get_athlete_context",
  "get_training_plan",
  "get_workout_context",
  "record_athlete_feedback",
] as const;

function safeExecution(
  execute: (
    input: Record<string, unknown>,
    options: { signal: AbortSignal },
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

export type ReviewMode = "primary" | "fallback";

interface RegisterWebMcpOptions {
  reviewMode: ReviewMode;
  reviewCoordinator: ReviewCoordinator;
  onActivity?: (activity: ToolActivity) => void;
}

const TOOL_ACTIVITY_LABELS: Record<string, string> = {
  get_athlete_context: "reading the athlete context",
  get_training_plan: "reading the Training Plan",
  get_workout_context: "reading the workout context",
  record_athlete_feedback: "recording Athlete Feedback",
  review_workout_adaptation: "opening the adaptation review",
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
      name: "get_athlete_context",
      title: "Get athlete context",
      description:
        "Read the Athlete, Target Race, Training Phase, recent training, load, recovery, sleep, HRV, resting heart rate, and stress context shown in the workspace.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations,
      execute: safeExecution(() =>
        application.query({ type: "get_athlete_context" }),
      ),
    },
    {
      name: "get_training_plan",
      title: "Get training plan",
      description:
        "Read the current Training Plan version and stable Planned Workout IDs for an inclusive date range shown in the workspace.",
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
        "Read one Planned Workout with its separate Workout Result, recorded laps, related Athlete Feedback, provenance, and stable evidence references.",
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
      "Record the Athlete’s original report and only explicitly reported normalized fields for one Planned Workout. Retrying the same valid requestId returns the original record without recording twice.",
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
  if (options?.reviewMode === "primary") {
    tools.push({
      name: "review_workout_adaptation",
      title: "Review workout adaptation",
      description:
        "Open one ranked Workout Adaptation review. The call remains pending while the Athlete compares the recommendation and alternative, and settles when they discuss further or dismiss this issue-14 review.",
      inputSchema: reviewProposalSchema,
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: false,
      },
      execute: safeExecution(async (input, execution) => {
        const opened = options.reviewCoordinator.open(
          normalizeHostValue(input),
          "primary",
          execution.signal,
        ) as {
          status: string;
          reviewId?: string;
        };
        if (opened.status !== "review_opened" || !opened.reviewId) {
          return opened;
        }
        return options.reviewCoordinator.waitForSettlement(opened.reviewId);
      }),
    });
  } else if (options?.reviewMode === "fallback") {
    tools.push(
      {
        name: "open_workout_adaptation_review",
        title: "Open workout adaptation review",
        description:
          "Open one ranked Workout Adaptation review and return immediately while the Athlete decides in the workspace.",
        inputSchema: reviewProposalSchema,
        annotations: {
          readOnlyHint: false,
          untrustedContentHint: false,
        },
        execute: safeExecution((input, execution) =>
          options.reviewCoordinator.open(
            normalizeHostValue(input),
            "fallback",
            execution.signal,
          ),
        ),
      },
      {
        name: "read_workout_adaptation_decision",
        title: "Read workout adaptation decision",
        description:
          "Read the completed fallback decision once, or report that the active review is not ready.",
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
