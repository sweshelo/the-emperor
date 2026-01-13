/**
 * Helper functions for debug actions
 */

import type { GameWebSocketClient } from "../../src/websocket/client.ts";
import type { DebugMakePayload, UnitDrivePayload, ClientMessage } from "../../src/types/game.ts";
import type { IAtom } from "../../suit/types/index.ts";

/**
 * Send DebugMake action to create a card
 *
 * @param wsClient WebSocket client
 * @param playerId Player ID
 * @param catalogId Card catalog ID (e.g., "1-1-018")
 *
 * Note: DebugMake creates the card and adds it to the player's hand automatically.
 * The server determines where to place the card based on internal logic.
 */
export function debugMakeCard(
  wsClient: GameWebSocketClient,
  playerId: string,
  catalogId: string
): void {
  if (!wsClient.isConnected()) {
    throw new Error("WebSocket is not connected");
  }

  const message: ClientMessage = {
    action: {
      type: "debug",
      handler: "core", // handler is required for proper message routing
    },
    payload: {
      type: "DebugMake",
      player: playerId,
      catalogId,
    },
  };

  try {
    wsClient.send(message);
    console.log(`[DebugMake] Creating card: ${catalogId} for player: ${playerId}`);
  } catch (error) {
    console.error("[DebugMake] Failed to create card:", error);
    throw error;
  }
}

/**
 * Send UnitDrive action to summon a card from hand to field
 *
 * @param wsClient WebSocket client
 * @param playerId Player ID
 * @param cardId Card ID in hand to summon
 */
export function unitDrive(
  wsClient: GameWebSocketClient,
  playerId: string,
  cardId: string
): void {
  if (!wsClient.isConnected()) {
    throw new Error("WebSocket is not connected");
  }

  const message: ClientMessage = {
    action: {
      type: "game",
      handler: "core",
    },
    payload: {
      type: "UnitDrive",
      player: playerId,
      target: { id: cardId },
    },
  };

  try {
    wsClient.send(message);
    console.log(`[UnitDrive] Summoning card: ${cardId} for player: ${playerId}`);
  } catch (error) {
    console.error("[UnitDrive] Failed to summon card:", error);
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
    const message = messages.find((m) => m.payload?.type === messageType);
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
 * Note: syncMessage should be the full Message with action and payload
 */
export function extractPlayerState(syncMessage: any, playerId: string) {
  return syncMessage.payload?.body?.players?.[playerId];
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
 * Note: Sync messages should be the full Message with action and payload
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
  const beforeHand = beforeSync.payload?.body?.players?.[playerId]?.hand || [];
  const afterHand = afterSync.payload?.body?.players?.[playerId]?.hand || [];

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
 * Note: syncMessage should be the full Message with action and payload
 */
export function printGameStateSummary(syncMessage: any, title: string = "Game State") {
  console.log(`\n=== ${title} ===`);

  const players = syncMessage.payload?.body?.players;
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

  console.log(`\nGame: Round ${syncMessage.payload?.body?.game?.round}, Turn ${syncMessage.payload?.body?.game?.turn}`);
  console.log("=".repeat(title.length + 8));
}
