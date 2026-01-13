import { describe, test, expect } from "bun:test";
import { BaseAgent } from "../src/agent/base.ts";

describe("BaseAgent", () => {
  test("should create an agent with a name", () => {
    const agent = new BaseAgent("TestAgent");
    expect(agent.getName()).toBe("TestAgent");
  });

  test("should throw error when decideAction is not implemented", async () => {
    const agent = new BaseAgent("TestAgent");
    expect(agent.decideAction({})).rejects.toThrow("Not implemented");
  });
});
