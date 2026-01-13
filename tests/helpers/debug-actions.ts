/**
 * Helper functions for debug actions
 */

import type { GameWebSocketClient } from "../../src/websocket/client.ts";

/**
 * DebugMake action structure (based on expected implementation)
 * TODO: Update this structure when the actual API is confirmed
 */
export interface DebugMakeAction {
  type: "DebugMake";
  player: string;
  catalogId: string;
  destination?: "hand" | "field" | "deck";
  level?: number;
}

/**
 * Send DebugMake action to create a card
 *
 * @param wsClient WebSocket client
 * @param playerId Player ID
 * @param catalogId Card catalog ID
 * @param destination Where to place the card (default: "hand")
 * @param level Card level (default: 1)
 *
 * @throws Error if DebugMake is not yet implemented on server
 */
export async function debugMakeCard(
  wsClient: GameWebSocketClient,
  playerId: string,
  catalogId: string,
  destination: "hand" | "field" | "deck" = "hand",
  level: number = 1
): Promise<void> {
  if (!wsClient.isConnected()) {
    throw new Error("WebSocket is not connected");
  }

  // TODO: Remove this check when DebugMake is implemented
  console.warn("⚠️ DebugMake action structure is tentative. May need updates when API is finalized.");

  const action: DebugMakeAction = {
    type: "DebugMake",
    player: playerId,
    catalogId,
    destination,
    level,
  };

  try {
    wsClient.send(action as any);
    console.log(`[DebugMake] Card created: ${catalogId} → ${destination}`);
  } catch (error) {
    console.error("[DebugMake] Failed to create card:", error);
    throw error;
  }
}

/**
 * Wait for a specific message type
 *
 * @param messages Array of received messages (will be mutated)
 * @param messageType Type of message to wait for
 * @param timeout Timeout in milliseconds (default: 5000)
 * @returns The matched message
 */
export async function waitForMessage(
  messages: any[],
  messageType: string,
  timeout: number = 5000
): Promise<any> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const message = messages.find((m) => m.type === messageType);
    if (message) {
      return message;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timeout waiting for message type: ${messageType}`);
}

/**
 * Wait for a condition to be true
 *
 * @param condition Function that returns true when condition is met
 * @param timeout Timeout in milliseconds (default: 5000)
 * @param checkInterval Check interval in milliseconds (default: 100)
 */
export async function waitForCondition(
  condition: () => boolean,
  timeout: number = 5000,
  checkInterval: number = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }

  throw new Error("Timeout waiting for condition");
}

/**
 * Extract player state from Sync message
 */
export function extractPlayerState(syncMessage: any, playerId: string) {
  return syncMessage.body?.players?.[playerId];
}

/**
 * Compare hand sizes before and after an action
 */
export function compareHandSize(
  beforeState: any,
  afterState: any,
  playerId: string
): {
  before: number;
  after: number;
  changed: boolean;
  delta: number;
} {
  const before = beforeState?.players?.[playerId]?.hand?.length || 0;
  const after = afterState?.players?.[playerId]?.hand?.length || 0;

  return {
    before,
    after,
    changed: before !== after,
    delta: after - before,
  };
}

/**
 * Compare field sizes before and after an action
 */
export function compareFieldSize(
  beforeState: any,
  afterState: any,
  playerId: string
): {
  before: number;
  after: number;
  changed: boolean;
  delta: number;
} {
  const before = beforeState?.players?.[playerId]?.field?.length || 0;
  const after = afterState?.players?.[playerId]?.field?.length || 0;

  return {
    before,
    after,
    changed: before !== after,
    delta: after - before,
  };
}

/**
 * Verify card effect: Check if a card was added to hand
 */
export function verifyCardAddedToHand(
  beforeSync: any,
  afterSync: any,
  playerId: string,
  expectedColor?: number
): {
  success: boolean;
  addedCards: any[];
  message: string;
} {
  const beforeHand = beforeSync.body?.players?.[playerId]?.hand || [];
  const afterHand = afterSync.body?.players?.[playerId]?.hand || [];

  // Find new cards (cards in after but not in before)
  const beforeIds = new Set(beforeHand.map((card: any) => card.id));
  const addedCards = afterHand.filter((card: any) => !beforeIds.has(card.id));

  if (addedCards.length === 0) {
    return {
      success: false,
      addedCards: [],
      message: "No cards were added to hand",
    };
  }

  // Check color if specified
  if (expectedColor !== undefined) {
    const hasCorrectColor = addedCards.some(
      (card: any) => card.catalogId && card.color === expectedColor
    );

    if (!hasCorrectColor) {
      return {
        success: false,
        addedCards,
        message: `Card added, but not the expected color (expected: ${expectedColor})`,
      };
    }
  }

  return {
    success: true,
    addedCards,
    message: `${addedCards.length} card(s) added to hand successfully`,
  };
}

/**
 * Debug helper: Print current game state summary
 */
export function printGameStateSummary(syncMessage: any, title: string = "Game State") {
  console.log(`\n=== ${title} ===`);

  const players = syncMessage.body?.players;
  if (!players) {
    console.log("No player data available");
    return;
  }

  Object.entries(players).forEach(([playerId, player]: [string, any]) => {
    console.log(`\nPlayer: ${player.name} (${playerId})`);
    console.log(`  Life: ${player.life?.current}/${player.life?.max}`);
    console.log(`  CP: ${player.cp?.current}/${player.cp?.max}`);
    console.log(`  Hand: ${player.hand?.length || 0} cards`);
    console.log(`  Field: ${player.field?.length || 0} units`);
    console.log(`  Deck: ${player.deck?.length || 0} cards`);
  });

  console.log(`\nGame: Round ${syncMessage.body?.game?.round}, Turn ${syncMessage.body?.game?.turn}`);
  console.log("=".repeat(title.length + 8));
}
