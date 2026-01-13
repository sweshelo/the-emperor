/**
 * Base AI Agent implementation
 */

import type { Agent, DecisionContext, ParsedAction } from "../types/agent.ts";

/**
 * Base class for AI agents
 * Extend this class to implement custom decision logic
 */
export class BaseAgent implements Agent {
  constructor(protected name: string) {}

  /**
   * Decide the next action based on the current game context
   * Override this method in subclasses to implement custom logic
   */
  async decideAction(_context: DecisionContext): Promise<ParsedAction> {
    throw new Error("decideAction not implemented - use ClaudeAgent or implement in subclass");
  }

  /**
   * Get agent name
   */
  getName(): string {
    return this.name;
  }
}
