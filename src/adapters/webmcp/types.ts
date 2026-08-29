export interface JsonSchema {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required?: string[];
  additionalProperties: false;
}

export interface WebMcpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint: false;
  };
  execute(
    input: Record<string, unknown>,
    options?: { signal: AbortSignal },
  ): Promise<unknown>;
}

export interface ToolActivity {
  status: "running" | "success" | "waiting" | "error";
  toolName: string;
  message: string;
}

export interface ModelContextHost {
  registerTool(
    tool: WebMcpTool,
    options?: { signal?: AbortSignal },
  ): Promise<void>;
}

export type CoachAgentConnection =
  | {
      status: "connected";
      toolNames: string[];
      message: "Coach Agent tools are connected.";
    }
  | {
      status: "unavailable";
      toolNames: [];
      message: "Coach Agent tools are unavailable in this browser.";
    }
  | {
      status: "error";
      toolNames: [];
      message: "Coach Agent tools could not be connected.";
    };

export type WebMcpRegistration = CoachAgentConnection & {
  cleanup(): void;
};
