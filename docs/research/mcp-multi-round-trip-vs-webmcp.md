# MCP multi-round-trip requests vs. WebMCP for adaptation review

**Question:** Can MCP 2026-07-28 Multi Round-Trip Requests (MRTR) power a WebMCP tool that opens two workout-option cards, waits for the athlete to choose, and returns that choice to the coach agent?

## Decision

Use a **pending imperative WebMCP tool execution**, not MCP MRTR, for the hackathon POC.

MRTR and the proposed interaction are analogous—both let a tool pause for human input—but MRTR does **not** apply directly to the WebMCP JavaScript API. MRTR is a JSON-RPC client/server pattern: an MCP server ends the original request with `resultType: "input_required"`, the client obtains the requested input, and the client retries the original operation as a new request with `inputResponses` and any opaque `requestState`. The two requests are independent and must use different JSON-RPC IDs. ([MCP release post](https://blog.modelcontextprotocol.io/posts/2026-07-28/), [MRTR specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr), [SEP-2322](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2322-MRTR.md))

WebMCP is a browser API whose tool implementation lives in the page. Chrome describes it as “MCP-inspired,” not a direct JavaScript implementation of MCP, and the WebMCP specification deliberately leaves the browser-to-agent transport unspecified: a browser may expose page tools through MCP, proprietary function calling, or another mechanism. Therefore, a page cannot portably return an MCP `InputRequiredResult` and assume the browser will perform MRTR. ([Chrome comparison](https://developer.chrome.com/docs/ai/webmcp/compare-mcp), [WebMCP agent interaction](https://webmachinelearning.github.io/webmcp/#interaction-with-agents))

ChatGPT Site Tools likewise distinguishes WebMCP from a local or remote MCP server. A page can expose Site Tools to ChatGPT's built-in browser without installing or operating a separate MCP server. ([OpenAI Site Tools](https://learn.chatgpt.com/docs/webmcp))

## Standards-faithful interaction

Register an imperative tool such as `review_workout_adaptation`. Its async `execute` callback should:

1. Open the dashboard modal with the Coach's Recommendation and one Alternative.
2. Return a Promise that remains pending while the athlete inspects the cards.
3. Treat card clicks as preview-only: update the selected state and preview the affected calendar workouts.
4. Resolve only when the athlete selects **Adapt my plan**, returning structured data such as:
   `{ decision: "approved", optionId: "recovery-first" }`.
5. Resolve with `{ decision: "discuss_further" }` if the athlete declines both options.
6. Let a separate write tool apply the approved option to the plan, so selection/consent and mutation remain distinct operations.

This follows the WebMCP contract directly: an imperative tool's `execute` function may be asynchronous, and the agent receives the result when its Promise resolves. WebMCP explicitly tracks pending tool executions. ([WebMCP tool callback](https://webmachinelearning.github.io/webmcp/#modelcontexttool-dictionary), [Chrome imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api))

## Lifecycle and cancellation requirements

- Listen to the `AbortSignal` passed as the second `execute` argument. On abort, close the modal, remove event listeners, clear any pending resolver, and avoid mutating plan state. The WebMCP API defines this signal specifically to communicate tool cancellation. ([WebMCP callback options](https://webmachinelearning.github.io/webmcp/#toolexecutecallbackoptions-dictionary))
- Make settlement idempotent because cancellation and natural Promise resolution can race; the specification guarantees only the first completion wins. ([WebMCP pending execution cancellation](https://webmachinelearning.github.io/webmcp/#pending-tool-executions))
- Cancel/clean up on page reset and reject or focus an already-open review if a second invocation arrives. The app should allow only one active adaptation review.
- Do not depend on navigation surviving the interaction. WebMCP cleans up pending executions when the caller or target document unloads, and OpenAI notes that closing or navigating away can make page tools unavailable. ([WebMCP unload cleanup](https://webmachinelearning.github.io/webmcp/#pending-tool-executions), [OpenAI Site Tools](https://learn.chatgpt.com/docs/webmcp))
- The cited OpenAI documentation specifies no maximum Site Tool execution duration. Before depending on a long human pause, run a focused spike in the current ChatGPT built-in browser to measure timeout behavior. Keep the modal interaction short and provide a graceful cancellation message.

## Where MRTR would fit later

MRTR becomes relevant if the product later adds a **separate remote MCP server** that must request missing information or confirmation without keeping an HTTP stream or server session open. That server could send an `elicitation/create` request inside `inputRequests`, protect and return any `requestState`, and finish when the client retries with `inputResponses`. The client controls how elicitation is presented, so MRTR alone does not guarantee that the running dashboard will render the project's bespoke two-card comparison. ([MRTR server and client requirements](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr#server-requirements-basic-workflow))

For this POC, adding that server would duplicate the browser-native mechanism and add infrastructure without improving the shared-page demonstration.

## Implementation risk to test early

Build a minimal browser spike before the full dashboard:

- one imperative Site Tool;
- one two-card modal;
- one pending Promise;
- confirm, discuss-further, cancellation, duplicate invocation, reset, and navigation cases;
- verify that ChatGPT receives the chosen `optionId` and can call the separate apply tool.

If the target ChatGPT build imposes an undocumented timeout, use a two-call fallback: the first tool opens and records a pending review, the athlete chooses in the page, and a later read tool returns the stored decision. This is less seamless because the agent will need another turn or prompt to fetch the choice, so it is a compatibility fallback rather than the preferred demo path.
