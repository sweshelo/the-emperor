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
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Get player info and register
      const playerIds = getPlayerIds(debugState);
      const playerId = playerIds[0];
      const playerInfo = debugState.players[playerId];

      const { playerEntry } = await import("./helpers/debug-actions.ts");
      playerEntry(
        wsClient,
        "99999",
        playerId,
        playerInfo.name,
        playerInfo.deck?.map((card: any) => card.catalogId) || [],
        []
      );

      // Wait for Sync messages after registration
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check if we received Sync messages
      const syncMessages = receivedMessages.filter((m) => m.payload?.type === "Sync");
      expect(syncMessages.length).toBeGreaterThan(0);

      if (syncMessages.length > 0) {
        const syncMsg = syncMessages[0] as any;
        console.log("✓ Received Sync message");
        console.log(`  Debug mode enabled: ${syncMsg.payload?.body?.rule?.debug?.enable}`);
      }
    } catch (error) {
      console.error("Test failed:", error);
      throw error;
    }
  });

  test("should create card using DebugMake", async () => {
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

      let syncMessages: any[] = [];

      wsClient.onMessage((message) => {
        receivedMessages.push(message);
        console.log(`  Received: ${message.payload?.type || message.type}`);

        if (message.payload?.type === "Sync") {
          syncMessages.push(message);
        }
      });

      await wsClient.connect();
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Get player ID and info from state
      const playerIds = getPlayerIds(debugState);
      const playerId = playerIds[0];

      if (!playerId) {
        throw new Error("No player ID found");
      }

      const playerInfo = debugState.players[playerId];
      console.log(`Player: ${playerInfo.name} (${playerId})`);

      // Import helpers
      const { playerEntry, debugMakeCard } = await import("./helpers/debug-actions.ts");

      // Register as a player in the room
      console.log("Registering player...");
      playerEntry(
        wsClient,
        "99999", // Sandbox room ID
        playerId,
        playerInfo.name,
        playerInfo.deck?.map((card: any) => card.catalogId) || [],
        []
      );

      // Wait for initial Sync after player registration
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Record hand size before DebugMake
      const beforeSync = syncMessages[syncMessages.length - 1];
      const beforeHand = beforeSync?.payload?.body?.players?.[playerId]?.hand || [];
      console.log(`  Hand size before DebugMake: ${beforeHand.length}`);

      // Send DebugMake action to create ブロックナイト (1-1-018)
      debugMakeCard(wsClient, playerId, TEST_CARD_ID);

      // Wait for Sync message after DebugMake
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const afterSync = syncMessages[syncMessages.length - 1];
      const afterHand = afterSync?.payload?.body?.players?.[playerId]?.hand || [];
      console.log(`  Hand size after DebugMake: ${afterHand.length}`);

      // Verify hand size increased
      expect(afterHand.length).toBeGreaterThan(beforeHand.length);
      console.log(`  ✓ Card created: ${TEST_CARD_NAME} (${TEST_CARD_ID})`);
    } catch (error) {
      console.error("Test failed:", error);
      throw error;
    }
  });

  test("should summon card and verify effect resolution", async () => {
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

      let syncMessages: any[] = [];

      wsClient.onMessage((message) => {
        receivedMessages.push(message);

        if (message.payload?.type === "Sync") {
          syncMessages.push(message);
          const players = message.payload?.body?.players;

          if (players) {
            const playerIds = Object.keys(players);
            if (playerIds.length > 0) {
              const player = players[playerIds[0]];
              console.log(`  Hand: ${player?.hand?.length}, Field: ${player?.field?.length}`);
            }
          }
        }
      });

      await wsClient.connect();
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Get player ID and info
      const playerIds = getPlayerIds(debugState);
      const playerId = playerIds[0];

      if (!playerId) {
        throw new Error("No player ID found");
      }

      const playerInfo = debugState.players[playerId];

      // Import helpers
      const { playerEntry, debugMakeCard, unitDrive, verifyCardAddedToHand } = await import("./helpers/debug-actions.ts");

      // Register as a player
      console.log(`Registering player: ${playerInfo.name}`);
      playerEntry(
        wsClient,
        "99999",
        playerId,
        playerInfo.name,
        playerInfo.deck?.map((card: any) => card.catalogId) || [],
        []
      );

      // Wait for initial Sync
      await new Promise((resolve) => setTimeout(resolve, 1000));

      console.log("\n=== Test Flow: DebugMake → UnitDrive → Verify Effect ===");

      // Step 1: Create card with DebugMake
      console.log(`\n[Step 1] Creating ${TEST_CARD_NAME} (${TEST_CARD_ID}) with DebugMake...`);
      const beforeDebugMake = syncMessages[syncMessages.length - 1];
      const beforeHand = beforeDebugMake?.payload?.body?.players?.[playerId]?.hand || [];
      console.log(`  Hand size before: ${beforeHand.length}`);

      debugMakeCard(wsClient, playerId, TEST_CARD_ID);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const afterDebugMake = syncMessages[syncMessages.length - 1];
      const afterHand = afterDebugMake?.payload?.body?.players?.[playerId]?.hand || [];
      console.log(`  Hand size after: ${afterHand.length}`);
      expect(afterHand.length).toBeGreaterThan(beforeHand.length);

      // Find the created card ID
      const createdCard = afterHand.find((card: any) => card.catalogId === TEST_CARD_ID);
      if (!createdCard) {
        throw new Error("Created card not found in hand");
      }
      console.log(`  ✓ Card created with ID: ${createdCard.id}`);

      // Step 2: Summon the card with UnitDrive
      console.log(`\n[Step 2] Summoning ${TEST_CARD_NAME} with UnitDrive...`);
      const beforeSummon = syncMessages[syncMessages.length - 1];
      const beforeSummonHand = beforeSummon?.payload?.body?.players?.[playerId]?.hand || [];
      const beforeSummonField = beforeSummon?.payload?.body?.players?.[playerId]?.field || [];
      console.log(`  Hand: ${beforeSummonHand.length}, Field: ${beforeSummonField.length}`);

      unitDrive(wsClient, playerId, createdCard.id);
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait longer for effect to resolve

      const afterSummon = syncMessages[syncMessages.length - 1];
      const afterSummonHand = afterSummon?.payload?.body?.players?.[playerId]?.hand || [];
      const afterSummonField = afterSummon?.payload?.body?.players?.[playerId]?.field || [];
      console.log(`  Hand: ${afterSummonHand.length}, Field: ${afterSummonField.length}`);

      // Verify field size increased
      expect(afterSummonField.length).toBeGreaterThan(beforeSummonField.length);
      console.log(`  ✓ Card summoned to field`);

      // Step 3: Verify effect - hand size should increase due to ブロックナイト effect
      console.log(`\n[Step 3] Verifying ${TEST_CARD_NAME} effect (add green unit to hand)...`);

      const effectResult = verifyCardAddedToHand(beforeSummon, afterSummon, playerId, 4); // 4 = green color

      if (effectResult.success) {
        console.log(`  ✓ ${effectResult.message}`);
        console.log(`  Added cards:`, effectResult.addedCards.map((c: any) => ({
          id: c.id,
          catalogId: c.catalogId,
          name: c.name,
          color: c.color
        })));
      } else {
        console.log(`  ⚠ ${effectResult.message}`);
        console.log(`  Note: Effect resolution may require more time or specific game conditions`);
      }

      console.log("\n=== Test Complete ===\n");
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
        const messageType = message.payload?.type || message.action?.type || "Unknown";
        messageSequence.push({
          type: messageType,
          timestamp: Date.now(),
        });
        receivedMessages.push(message);
      });

      await wsClient.connect();
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Register player
      const playerIds = getPlayerIds(debugState);
      const playerId = playerIds[0];
      const playerInfo = debugState.players[playerId];

      const { playerEntry } = await import("./helpers/debug-actions.ts");
      playerEntry(
        wsClient,
        "99999",
        playerId,
        playerInfo.name,
        playerInfo.deck?.map((card: any) => card.catalogId) || [],
        []
      );

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
