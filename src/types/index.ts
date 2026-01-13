/**
 * Core type definitions for CODE OF JOKER AI Agent
 */

/**
 * Game state representation
 */
export interface GameState {
  // TODO: Define game state structure based on the-fool simulator
}

/**
 * Action that the AI agent can take
 */
export interface Action {
  type: string;
  // TODO: Define action structure
}

/**
 * AI agent interface
 */
export interface Agent {
  /**
   * Decide the next action based on the current game state
   */
  decideAction(state: GameState): Promise<Action>;
}
