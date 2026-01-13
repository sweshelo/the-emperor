/**
 * Game state management
 */

import type { GameState, ChoicesMessage } from "../types/game.ts";
import type { DecisionContext } from "../types/agent.ts";

/**
 * Game state manager
 */
export class GameStateManager {
  private currentState: GameState | null = null;
  private currentChoice: ChoicesMessage | null = null;
  private myPlayerId: string | null = null;

  /**
   * Update game state
   */
  updateState(state: GameState): void {
    this.currentState = state;
    console.log(
      `[GameState] Updated - Round: ${state.game.round}, Turn: ${state.game.turn}`
    );
  }

  /**
   * Set current choice prompt
   */
  setChoice(choice: ChoicesMessage): void {
    this.currentChoice = choice;
    console.log(`[GameState] Choice prompt: ${choice.choices.title}`);
  }

  /**
   * Clear current choice
   */
  clearChoice(): void {
    this.currentChoice = null;
  }

  /**
   * Set my player ID
   */
  setMyPlayerId(playerId: string): void {
    this.myPlayerId = playerId;
    console.log(`[GameState] My player ID: ${playerId}`);
  }

  /**
   * Get current game state
   */
  getState(): GameState | null {
    return this.currentState;
  }

  /**
   * Get current choice
   */
  getCurrentChoice(): ChoicesMessage | null {
    return this.currentChoice;
  }

  /**
   * Get my player ID
   */
  getMyPlayerId(): string | null {
    return this.myPlayerId;
  }

  /**
   * Get my player info
   */
  getMyPlayer() {
    if (!this.currentState || !this.myPlayerId) {
      return null;
    }
    return this.currentState.players[this.myPlayerId];
  }

  /**
   * Get opponent player info
   */
  getOpponentPlayer() {
    if (!this.currentState || !this.myPlayerId) {
      return null;
    }

    const opponentId = Object.keys(this.currentState.players).find(
      (id) => id !== this.myPlayerId
    );

    return opponentId ? this.currentState.players[opponentId] : null;
  }

  /**
   * Get player by ID
   */
  getPlayer(playerId: string) {
    if (!this.currentState) {
      return null;
    }
    return this.currentState.players[playerId];
  }

  /**
   * Check if it's my turn (based on choice prompt)
   */
  isMyTurn(): boolean {
    if (!this.currentChoice || !this.myPlayerId) {
      return false;
    }
    return this.currentChoice.player === this.myPlayerId;
  }

  /**
   * Get serializable state for AI
   */
  getSerializableState(): object | null {
    if (!this.currentState) {
      return null;
    }

    return {
      game: this.currentState.game,
      rule: this.currentState.rule,
      players: this.currentState.players,
      myPlayerId: this.myPlayerId,
      currentChoice: this.currentChoice,
    };
  }

  /**
   * Get decision context for the agent
   * Returns null if game state or player ID is not available
   */
  getDecisionContext(): DecisionContext | null {
    if (!this.currentState || !this.myPlayerId) {
      return null;
    }

    return {
      gameState: this.currentState,
      choice: this.currentChoice,
      myPlayerId: this.myPlayerId,
    };
  }

  /**
   * Reset state
   */
  reset(): void {
    this.currentState = null;
    this.currentChoice = null;
    this.myPlayerId = null;
    console.log("[GameState] Reset");
  }
}

// Singleton instance
export const gameStateManager = new GameStateManager();
