import type { WorkspaceApplication } from "../../application/createWorkspaceApplication";
import type {
  CoachAgentConnection,
  ModelContextHost,
  WebMcpRegistration,
  WebMcpTool,
} from "./types";

export type { ModelContextHost, WebMcpTool } from "./types";

export const WEBMCP_TOOL_NAMES = [
  "get_athlete_context",
  "get_training_plan",
  "get_workout_context",
  "record_athlete_feedback",
] as const;

function safeExecution(
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>,
): WebMcpTool["execute"] {
  return async (input) => {
    try {
      return await execute(input);
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

function createTools(application: WorkspaceApplication): WebMcpTool[] {
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
  return tools;
}

function withCleanup(
  connection: CoachAgentConnection,
  controller?: AbortController,
): WebMcpRegistration {
  let cleanedUp = false;
  return {
    ...connection,
    cleanup() {
      if (cleanedUp) return;
      cleanedUp = true;
      controller?.abort();
    },
  };
}

export async function registerWebMcpTools(
  host: ModelContextHost | undefined,
  application: WorkspaceApplication,
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
    for (const tool of createTools(application)) {
      await host.registerTool(tool, { signal: controller.signal });
    }
    return withCleanup(
      {
        status: "connected",
        toolNames: [...WEBMCP_TOOL_NAMES],
        message: "Coach Agent tools are connected.",
      },
      controller,
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
