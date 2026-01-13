/**
 * Helper functions for debug actions
 */

import type { GameWebSocketClient } from "../../src/websocket/client.ts";
import type {
  ContinuePayload,
  PlayerEntryPayload,
  DebugMakePayload,
  UnitDrivePayload,
} from "../../suit/types/message/payload/index.ts";
import type { Message } from "../../suit/types/message/message.ts";

/**
 * Send Continue message to acknowledge DisplayEffect
 * This is required because System.show() waits for a client response
 *
 * @param wsClient WebSocket client
 * @param promptId The prompt ID from the DisplayEffect message
 * @param playerId The player ID sending the continue
 */
export function sendContinue(
  wsClient: GameWebSocketClient,
  promptId: string,
  playerId: string
): void {
  if (!wsClient.isConnected()) {
    throw new Error("WebSocket is not connected");
  }

  const message = {
    action: {
      type: "continue",
      handler: "core",
    },
    payload: {
      type: "Continue",
      promptId,
      player: playerId,
    },
  } satisfies Message<ContinuePayload>;

  try {
    wsClient.send(message);
    console.log(`[Continue] Sent for promptId: ${promptId}`);
  } catch (error) {
    console.error("[Continue] Failed to send:", error);
    throw error;
  }
}

/**
 * Send PlayerEntry message to register as a player in the room
 *
 * @param wsClient WebSocket client
 * @param roomId Room ID
 * @param playerId Player ID
 * @param playerName Player name
 * @param deck Player deck (array of catalog IDs)
 * @param jokersOwned Optional joker cards owned by the player
 *
 * Note: This must be called after WebSocket connection and before game actions.
 * Without player registration, the server won't send game state updates.
 *
 * Returns a promise that resolves when the registration is confirmed (Sync message received).
 */
export function playerEntry(
  wsClient: GameWebSocketClient,
  roomId: string,
  playerId: string,
  playerName: string,
  deck: string[] = [],
  jokersOwned: string[] = []
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!wsClient.isConnected()) {
      reject(new Error("WebSocket is not connected"));
      return;
    }

    const message = {
      action: {
        type: "join",
        handler: "room",
      },
      payload: {
        type: "PlayerEntry",
        roomId,
        player: {
          id: playerId,
          name: playerName,
          deck,
        },
        jokersOwned,
      },
    } satisfies Message<PlayerEntryPayload>;

    // Set up listener for Sync message (confirms registration)
    let syncReceived = false;
    const timeout = setTimeout(() => {
      if (!syncReceived) {
        cleanup();
        reject(new Error("Timeout waiting for PlayerEntry confirmation (Sync message)"));
      }
    }, 5000); // 5 second timeout

    const cleanup = wsClient.onMessage((msg) => {
      if (msg.payload?.type === "Sync") {
        syncReceived = true;
        clearTimeout(timeout);
        cleanup();
        console.log(`[PlayerEntry] Confirmed: ${playerName} registered in room ${roomId}`);
        resolve();
      }
    });

    try {
      wsClient.send(message);
      console.log(`[PlayerEntry] Sent registration: ${playerName} (${playerId}) to room ${roomId}`);
    } catch (error) {
      clearTimeout(timeout);
      cleanup();
      console.error("[PlayerEntry] Failed to send:", error);
      reject(error);
    }
  });
}

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

  const message = {
    action: {
      type: "debug",
      handler: "core",
    },
    payload: {
      type: "DebugMake",
      player: playerId,
      catalogId,
    },
  } satisfies Message<DebugMakePayload>;

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

  const message = {
    action: {
      type: "game",
      handler: "core",
    },
    payload: {
      type: "UnitDrive",
      player: playerId,
      target: { id: cardId },
    },
  } satisfies Message<UnitDrivePayload>;

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[],
  messageType: string,
  timeout: number = 5000
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
 * Wait for a DisplayEffect message with a specific effect title
 *
 * @param messages Array of received messages
 * @param effectTitle The effect title to wait for (e.g., "援軍／緑")
 * @param timeout Timeout in milliseconds (default: 5000)
 * @returns The matched DisplayEffect message
 */
export async function waitForDisplayEffect(

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[],
  effectTitle: string,
  timeout: number = 5000
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const message = messages.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (m: any) => m.payload?.type === "DisplayEffect" && m.payload?.title === effectTitle
    );
    if (message) {
      return message;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timeout waiting for DisplayEffect: ${effectTitle}`);
}

/**
 * Wait for a Defrost message (indicates player can act again after effect resolution)
 *
 * @param messages Array of received messages
 * @param afterIndex Start searching from this index
 * @param timeout Timeout in milliseconds (default: 5000)
 * @returns The Defrost message
 */
export async function waitForDefrost(

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[],
  afterIndex: number = 0,
  timeout: number = 5000
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    for (let i = afterIndex; i < messages.length; i++) {
      if (messages[i]?.payload?.type === "Defrost") {
        return messages[i];
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timeout waiting for Defrost message`);
}

/**
 * Wait for the next Sync message after a specific point
 *
 * @param messages Array of received messages
 * @param afterIndex Start searching from this index
 * @param timeout Timeout in milliseconds (default: 5000)
 * @returns The next Sync message
 */
export async function waitForNextSync(

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[],
  afterIndex: number,
  timeout: number = 5000
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    for (let i = afterIndex + 1; i < messages.length; i++) {
      if (messages[i]?.payload?.type === "Sync") {
        return messages[i];
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timeout waiting for next Sync message after index ${afterIndex}`);
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractPlayerState(syncMessage: any, playerId: string) {
  return syncMessage.payload?.body?.players?.[playerId];
}

/**
 * Compare hand sizes before and after an action
 */
export function compareHandSize(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  beforeState: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  beforeState: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  beforeSync: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  afterSync: any,
  playerId: string,
  expectedColor?: number
): {
  success: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addedCards: any[];
  message: string;
} {
  const beforeHand = beforeSync.payload?.body?.players?.[playerId]?.hand || [];
  const afterHand = afterSync.payload?.body?.players?.[playerId]?.hand || [];

  // Find new cards (cards in after but not in before)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const beforeIds = new Set(beforeHand.map((card: any) => card.id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function printGameStateSummary(syncMessage: any, title: string = "Game State") {
  console.log(`\n=== ${title} ===`);

  const players = syncMessage.payload?.body?.players;
  if (!players) {
    console.log("No player data available");
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
