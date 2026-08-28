import type { CoachingContextSource } from "../domain/types";
import { validateWorkspaceState } from "../domain/validation";
import { createDemoWorkspaceState } from "./demoFixture";

export function createDemoCoachingContextSource(): CoachingContextSource {
  return {
    async loadContext() {
      const state = createDemoWorkspaceState();
      const validation = validateWorkspaceState(state);
      if (!validation.valid) {
        throw new Error(
          `demo-athlete-v1 failed validation: ${validation.errors.join(", ")}`,
        );
      }
      return state;
    },
  };
}
