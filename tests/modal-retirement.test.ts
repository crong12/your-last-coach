import { describe, expect, it } from "vitest";
import * as workspaceApp from "../src/ui/WorkspaceApp";

describe("adaptation modal retirement", () => {
  it("ships only the pushed adaptation review UI", () => {
    expect("ReviewModal" in workspaceApp).toBe(false);
  });
});
