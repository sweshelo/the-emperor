/**
 * Base AI Agent implementation
 */

import type { Agent, GameState, Action } from "../types/index.ts";

/**
 * Base class for AI agents
 */
export class BaseAgent implements Agent {
  constructor(protected name: string) {}

  async decideAction(state: GameState): Promise<Action> {
    // TODO: Implement decision logic
    throw new Error("Not implemented");
  }

  getName(): string {
    return this.name;
  }
}
