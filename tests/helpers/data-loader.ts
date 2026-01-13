/**
 * Helper functions for loading and converting test data
 */

import type { GameState } from "../../src/types/game.ts";
import syncData from "../../data/payload/sync.json";

/**
 * Load game state from sync.json
 */
export function loadSyncGameState(): GameState {
  // The sync.json contains the full message structure
  // We need to extract just the body which contains the GameState
  const body = syncData.payload.body;

  // Convert to GameState type
  // Note: The JSON structure should match our GameState interface
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return body as unknown as GameState;
}

/**
 * Get player IDs from loaded game state
 */
export function getPlayerIds(state: GameState): string[] {
  return Object.keys(state.players);
}

/**
 * Get specific player from game state
 */
export function getPlayer(state: GameState, playerId: string) {
  return state.players[playerId];
}

/**
 * Extract hand cards with catalog IDs (visible cards)
 */
export function getVisibleHandCards(state: GameState, playerId: string) {
  const player = getPlayer(state, playerId);
  if (!player) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return player.hand.filter((card: any) => card.catalogId !== undefined);
}

/**
 * Get summary statistics from game state
 */
export function getGameStateSummary(state: GameState) {
  const playerIds = getPlayerIds(state);
  const players = playerIds.map((id) => {
    const player = getPlayer(state, id);
    return {
      id,
      name: player?.name || "Unknown",
      handSize: player?.hand.length || 0,
      deckSize: player?.deck.length || 0,
      fieldSize: player?.field.length || 0,
      life: `${player?.life.current}/${player?.life.max}`,
      cp: `${player?.cp.current}/${player?.cp.max}`,
    };
  });

  return {
    round: state.game.round,
    turn: state.game.turn,
    playerCount: playerIds.length,
    players,
  };
}

/**
 * Validate game state structure
 */
export function validateGameState(state: GameState): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!state.game) {
    errors.push("Missing game property");
  } else {
    if (typeof state.game.round !== "number") {
      errors.push("game.round must be a number");
    }
    if (typeof state.game.turn !== "number") {
      errors.push("game.turn must be a number");
    }
  }

  if (!state.players || typeof state.players !== "object") {
    errors.push("Missing or invalid players property");
  } else {
    const playerIds = Object.keys(state.players);
    if (playerIds.length === 0) {
      errors.push("No players in game state");
    }

    playerIds.forEach((playerId) => {
      const player = state.players[playerId];
      if (!player) {
        errors.push(`Player ${playerId} is null or undefined`);
        return;
      }

      if (!player.id) errors.push(`Player ${playerId}: missing id`);
      if (!player.name) errors.push(`Player ${playerId}: missing name`);
      if (!Array.isArray(player.hand))
        errors.push(`Player ${playerId}: hand is not an array`);
      if (!Array.isArray(player.deck))
        errors.push(`Player ${playerId}: deck is not an array`);
      if (!Array.isArray(player.field))
        errors.push(`Player ${playerId}: field is not an array`);
      if (!player.life)
        errors.push(`Player ${playerId}: missing life property`);
      if (!player.cp) errors.push(`Player ${playerId}: missing cp property`);
    });
  }

  if (!state.rule) {
    errors.push("Missing rule property");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
