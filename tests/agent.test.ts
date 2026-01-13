import { describe, test, expect } from "bun:test";
import { BaseAgent } from "../src/agent/base.ts";
import type { DecisionContext } from "../src/types/agent.ts";

describe("BaseAgent", () => {
  test("should create an agent with a name", () => {
    const agent = new BaseAgent("TestAgent");
    expect(agent.getName()).toBe("TestAgent");
  });

  test("should throw error when decideAction is not implemented", async () => {
    const agent = new BaseAgent("TestAgent");
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any
    const mockContext = {} as any as DecisionContext;
    await expect(agent.decideAction(mockContext)).rejects.toThrow("decideAction not implemented");
  });
});
