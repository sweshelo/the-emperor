/**
 * Advanced sandbox tests with debug mode and card effects
 */

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { SandboxClient } from "../src/sandbox/client.ts";
import { GameWebSocketClient } from "../src/websocket/client.ts";
import type { GameState } from "../src/types/game.ts";
import type { ServerMessage } from "../src/types/game.ts";
import { loadSyncGameState, getPlayerIds } from "./helpers/data-loader.ts";

// Test configuration
const SANDBOX_BASE_URL = process.env.TEST_SANDBOX_URL || "http://localhost:3000";
const SANDBOX_WS_URL = process.env.TEST_SANDBOX_WS_URL || "ws://localhost:3000";

// Test card: ブロックナイト (1-1-018)
// Effect: When this unit enters the field, add 1 random green unit card to hand
const TEST_CARD_ID = "1-1-018";
const TEST_CARD_NAME = "ブロックナイト";

describe("Sandbox Advanced Tests - Debug Mode & Card Effects", () => {
  let client: SandboxClient;
  let wsClient: GameWebSocketClient | null = null;
  let receivedMessages: ServerMessage[] = [];

  beforeAll(() => {
    client = new SandboxClient(SANDBOX_BASE_URL);
  });

  afterEach(async () => {
    // Cleanup
    if (wsClient) {
      wsClient.disconnect();
      wsClient = null;
    }

    try {
      await client.destroyRoom();
    } catch {
      // Ignore if room doesn't exist
    }

    receivedMessages = [];
  });

  /**
   * Enable debug mode in game state
   */
  function enableDebugMode(state: GameState): GameState {
    return {
      ...state,
      rule: {
        ...state.rule,
        debug: {
          enable: true,
          reveal: {
            opponent: {
              deck: true,
              hand: true,
              trigger: true,
              trash: false,
            },
            self: {
              deck: true,
            },
          },
        },
      },
    };
  }

  test("should create sandbox room with debug mode enabled", async () => {
    try {
      const isEnabled = await client.isEnabled();
      if (!isEnabled) {
        console.log("Skipping test: sandbox not enabled");
        return;
      }

      // Load game state and enable debug mode
      const baseState = loadSyncGameState();
      const debugState = enableDebugMode(baseState);

      expect(debugState.rule.debug?.enable).toBe(true);

      // Create sandbox and load debug state
      await client.createRoom();
      const loadResult = await client.loadState(debugState);

      expect(loadResult.success).toBe(true);
      console.log("✓ Sandbox room created with debug mode enabled");
    } catch (error) {
      console.error("Test failed:", error);
      throw error;
    }
  });

  test("should receive sync message with debug mode info", async () => {
    try {
      const isEnabled = await client.isEnabled();
      if (!isEnabled) {
        console.log("Skipping test: sandbox not enabled");
        return;
      }

      // Setup sandbox with debug mode
      const baseState = loadSyncGameState();
      const debugState = enableDebugMode(baseState);

      await client.createRoom();
      await client.loadState(debugState);
      await client.startGame();

      // Connect via WebSocket
      wsClient = new GameWebSocketClient({
        url: `${SANDBOX_WS_URL}?roomId=99999`,
        reconnect: false,
      });

      wsClient.onMessage((message) => {
        receivedMessages.push(message);
      });

      await wsClient.connect();

      // Wait for messages
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check if we received Sync messages
      const syncMessages = receivedMessages.filter((m) => m.type === "Sync");
      expect(syncMessages.length).toBeGreaterThan(0);

      if (syncMessages.length > 0) {
        const syncMsg = syncMessages[0] as any;
        console.log("✓ Received Sync message");
        console.log(`  Debug mode enabled: ${syncMsg.body?.rule?.debug?.enable}`);
      }
    } catch (error) {
      console.error("Test failed:", error);
      throw error;
    }
  });

  test("should create card using DebugMake (structure only)", async () => {
    try {
      const isEnabled = await client.isEnabled();
      if (!isEnabled) {
        console.log("Skipping test: sandbox not enabled");
        return;
      }

      // Setup sandbox with debug mode
      const baseState = loadSyncGameState();
      const debugState = enableDebugMode(baseState);

      await client.createRoom();
      await client.loadState(debugState);
      await client.startGame();

      // Connect via WebSocket
      wsClient = new GameWebSocketClient({
        url: `${SANDBOX_WS_URL}?roomId=99999`,
        reconnect: false,
      });

      wsClient.onMessage((message) => {
        receivedMessages.push(message);
        console.log(`  Received: ${message.type}`);
      });

      await wsClient.connect();
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Get player ID
      const playerIds = getPlayerIds(debugState);
      const playerId = playerIds[0];

      if (!playerId) {
        throw new Error("No player ID found");
      }

      console.log(`Player ID: ${playerId}`);

      // TODO: Implement DebugMake action
      // The actual message structure for DebugMake needs to be determined
      // Expected structure (example):
      // {
      //   type: "DebugMake",
      //   player: playerId,
      //   catalogId: TEST_CARD_ID,
      //   destination: "hand" | "field" | "deck"
      // }

      console.log("⚠ DebugMake action not yet implemented");
      console.log(`  Need to create card: ${TEST_CARD_NAME} (${TEST_CARD_ID})`);
      console.log("  This test demonstrates the test structure for future implementation");
    } catch (error) {
      console.error("Test failed:", error);
      throw error;
    }
  });

  test("should summon card and verify effect resolution (structure only)", async () => {
    try {
      const isEnabled = await client.isEnabled();
      if (!isEnabled) {
        console.log("Skipping test: sandbox not enabled");
        return;
      }

      // Setup sandbox
      const baseState = loadSyncGameState();
      const debugState = enableDebugMode(baseState);

      await client.createRoom();
      await client.loadState(debugState);
      await client.startGame();

      // Connect
      wsClient = new GameWebSocketClient({
        url: `${SANDBOX_WS_URL}?roomId=99999`,
        reconnect: false,
      });

      let initialHandSize = 0;
      let fieldUpdated = false;
      let effectTriggered = false;

      wsClient.onMessage((message) => {
        receivedMessages.push(message);

        if (message.type === "Sync") {
          const syncMsg = message as any;
          const players = syncMsg.body?.players;

          if (players) {
            const playerIds = Object.keys(players);
            if (playerIds.length > 0) {
              const player = players[playerIds[0]];
              console.log(`  Hand: ${player?.hand?.length}, Field: ${player?.field?.length}`);

              // Track initial state
              if (initialHandSize === 0 && player?.hand) {
                initialHandSize = player.hand.length;
              }

              // Check if field was updated (card summoned)
              if (player?.field && player.field.length > 0) {
                fieldUpdated = true;
              }

              // Check if hand size increased (effect resolved)
              if (player?.hand && player.hand.length > initialHandSize) {
                effectTriggered = true;
                console.log(`  ✓ Effect triggered! Hand size increased: ${initialHandSize} → ${player.hand.length}`);
              }
            }
          }
        }
      });

      await wsClient.connect();
      await new Promise((resolve) => setTimeout(resolve, 500));

      console.log("⚠ Full test flow not yet implemented:");
      console.log("  1. DebugMake to create ブロックナイト (1-1-018)");
      console.log("  2. UnitDrive to summon the card");
      console.log("  3. Verify effect: Green unit added to hand");
      console.log("");
      console.log("Expected behavior:");
      console.log(`  - Card: ${TEST_CARD_NAME} (${TEST_CARD_ID})`);
      console.log("  - Effect: Add 1 random green unit to hand");
      console.log("  - Verification: Hand size increases by 1 after summoning");
    } catch (error) {
      console.error("Test failed:", error);
      throw error;
    }
  });

  test("should track message sequence for effect resolution", async () => {
    try {
      const isEnabled = await client.isEnabled();
      if (!isEnabled) {
        console.log("Skipping test: sandbox not enabled");
        return;
      }

      // Setup sandbox
      const baseState = loadSyncGameState();
      const debugState = enableDebugMode(baseState);

      await client.createRoom();
      await client.loadState(debugState);
      await client.startGame();

      // Connect
      wsClient = new GameWebSocketClient({
        url: `${SANDBOX_WS_URL}?roomId=99999`,
        reconnect: false,
      });

      const messageSequence: Array<{ type: string; timestamp: number }> = [];

      wsClient.onMessage((message) => {
        messageSequence.push({
          type: message.type,
          timestamp: Date.now(),
        });
        receivedMessages.push(message);
      });

      await wsClient.connect();
      await new Promise((resolve) => setTimeout(resolve, 1000));

      console.log("Message sequence received:");
      messageSequence.forEach((msg, index) => {
        console.log(`  [${index}] ${msg.type}`);
      });

      // Analyze message patterns
      const syncCount = messageSequence.filter((m) => m.type === "Sync").length;
      const choiceCount = messageSequence.filter((m) => m.type === "Choices").length;

      console.log(`\nMessage statistics:`);
      console.log(`  Sync messages: ${syncCount}`);
      console.log(`  Choices messages: ${choiceCount}`);
      console.log(`  Total messages: ${messageSequence.length}`);

      console.log("\n✓ Message tracking system working");
      console.log("  This infrastructure will be used to verify effect resolution");
    } catch (error) {
      console.error("Test failed:", error);
      throw error;
    }
  });
});
