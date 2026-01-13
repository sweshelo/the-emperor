/**
 * Advanced sandbox tests with debug mode and card effects
 */

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { SandboxClient } from "../src/sandbox/client.ts";
import { GameWebSocketClient } from "../src/websocket/client.ts";
import type { GameState } from "../src/types/game.ts";
import type { ServerMessage } from "../src/types/game.ts";
import { loadSyncGameState, getPlayerIds } from "./helpers/data-loader.ts";

// Test configuration - uses SANDBOX_URL env var with fallback
const SANDBOX_WS_URL = process.env.SANDBOX_WS_URL || "ws://localhost:5000";

// Test card: ブロックナイト (1-1-018)
// Effect: When this unit enters the field, add 1 random green unit card to hand
const TEST_CARD_ID = "1-1-018";
const TEST_CARD_NAME = "ブロックナイト";
const TEST_CARD_EFFECT_NAME = "援軍／緑";

describe("Sandbox Advanced Tests - Debug Mode & Card Effects", () => {
  let client: SandboxClient;
  let wsClient: GameWebSocketClient | null = null;
  let receivedMessages: ServerMessage[] = [];

  beforeAll(() => {
    // SandboxClient uses SANDBOX_URL env var with fallback to localhost:5000
    client = new SandboxClient();
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
   * Enable debug mode in game state and optionally add green units to deck
   */
  function enableDebugMode(state: GameState, addGreenUnits: boolean = false): GameState {
    const modifiedState = {
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

    // Add green units to deck for effect testing
    if (addGreenUnits) {
      const playerIds = Object.keys(modifiedState.players);
      for (const playerId of playerIds) {
        const player = modifiedState.players[playerId];
        if (player) {
          // Add ブロックナイト (1-1-018) to deck - a green unit
          // Generate unique IDs for the added cards
          const greenUnitId1 = `test-green-${Date.now()}-1`;
          const greenUnitId2 = `test-green-${Date.now()}-2`;

          // Add to deck with proper structure (catalogId is needed for effect to find green units)
          /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions */
          player.deck = [
            { id: greenUnitId1, catalogId: TEST_CARD_ID, color: 4 },
            { id: greenUnitId2, catalogId: TEST_CARD_ID, color: 4 },
            ...(player.deck || []),
          ] as any;
          /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions */
        }
      }
    }

    return modifiedState;
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

      // Get player info
      const playerIds = getPlayerIds(debugState);
      const playerId = playerIds[0];
      const playerInfo = debugState.players[playerId];

      await client.createRoom();
      await client.loadState(debugState);

      // Connect via WebSocket BEFORE starting game
      wsClient = new GameWebSocketClient({
        url: `${SANDBOX_WS_URL}?roomId=99999`,
        reconnect: false,
      });

      wsClient.onMessage((message) => {
        receivedMessages.push(message);
      });

      await wsClient.connect();
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Register player BEFORE starting game
      const { playerEntry } = await import("./helpers/debug-actions.ts");
      await playerEntry(
        wsClient,
        "99999",
        playerId,
        playerInfo.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions
        (playerInfo as any).library || [],
        []
      );

      // PlayerEntry is now confirmed (Sync received), start the game
      await client.startGame();

      // Wait for Sync messages after game start
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check if we received Sync messages
      const syncMessages = receivedMessages.filter((m) => m.payload?.type === "Sync");
      expect(syncMessages.length).toBeGreaterThan(0);

      if (syncMessages.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions
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

      // Get player ID and info from state
      const playerIds = getPlayerIds(debugState);
      const playerId = playerIds[0];

      if (!playerId) {
        throw new Error("No player ID found");
      }

      const playerInfo = debugState.players[playerId];
      console.log(`Player: ${playerInfo.name} (${playerId})`);

      await client.createRoom();
      await client.loadState(debugState);

      // Connect via WebSocket BEFORE starting the game
      wsClient = new GameWebSocketClient({
        url: `${SANDBOX_WS_URL}?roomId=99999`,
        reconnect: false,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      // Import helpers
      const { playerEntry, debugMakeCard } = await import("./helpers/debug-actions.ts");

      // Register as a player in the room BEFORE starting the game
      console.log("Registering player...");
      await playerEntry(
        wsClient,
        "99999", // Sandbox room ID
        playerId,
        playerInfo.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions
        (playerInfo as any).library || [],
        []
      );

      // NOW start the game (after player is registered)
      await client.startGame();

      // Wait for initial Sync after game start
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

      // Setup sandbox - sync.json should already have green units in deck
      const baseState = loadSyncGameState();
      const debugState = enableDebugMode(baseState, false); // Don't add extra green units

      // Get player info
      const playerIds = getPlayerIds(debugState);
      const playerId = playerIds[0];

      if (!playerId) {
        throw new Error("No player ID found");
      }

      const playerInfo = debugState.players[playerId];

      await client.createRoom();
      await client.loadState(debugState);

      // Connect BEFORE starting game
      wsClient = new GameWebSocketClient({
        url: `${SANDBOX_WS_URL}?roomId=99999`,
        reconnect: false,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let syncMessages: any[] = [];

      wsClient.onMessage((message) => {
        receivedMessages.push(message);

        if (message.payload?.type === "Sync") {
          syncMessages.push(message);
          const players = message.payload?.body?.players;

          if (players) {
            const syncPlayerIds = Object.keys(players);
            if (syncPlayerIds.length > 0) {
              const player = players[syncPlayerIds[0]];
              console.log(`  Hand: ${player?.hand?.length}, Field: ${player?.field?.length}`);
            }
          }
        }
      });

      await wsClient.connect();
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Import helpers
      const { playerEntry, debugMakeCard, unitDrive, verifyCardAddedToHand } = await import("./helpers/debug-actions.ts");

      // Register player BEFORE starting game
      console.log(`Registering player: ${playerInfo.name}`);
      await playerEntry(
        wsClient,
        "99999",
        playerId,
        playerInfo.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions
        (playerInfo as any).library || [],
        []
      );

      // Start game after player registration
      await client.startGame();

      // Wait for initial Sync after game start
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      // Import helper for waiting DisplayEffect
      const { waitForDisplayEffect, waitForNextSync, waitForDefrost, sendContinue } = await import("./helpers/debug-actions.ts");

      // Step 3: Wait for DisplayEffect message (effect resolution indicator)
      console.log(`\n[Step 3] Waiting for DisplayEffect: ${TEST_CARD_EFFECT_NAME}...`);
      const displayEffectMsg = await waitForDisplayEffect(receivedMessages, TEST_CARD_EFFECT_NAME, 3000);
      console.log(`  ✓ DisplayEffect received: ${displayEffectMsg.payload?.title}`);
      console.log(`    Description: ${displayEffectMsg.payload?.message}`);

      // Send Continue to acknowledge DisplayEffect and allow effect resolution to proceed
      const promptId = displayEffectMsg.payload?.promptId;
      if (!promptId) {
        throw new Error("No promptId in DisplayEffect message");
      }
      sendContinue(wsClient, promptId);
      console.log(`  ✓ Continue sent for promptId: ${promptId}`);

      // Wait for the Sync message after DisplayEffect (effect applied)
      const displayEffectIndex = receivedMessages.indexOf(displayEffectMsg);
      console.log(`\n[Step 4] Waiting for Sync after effect resolution...`);
      const afterEffectSync = await waitForNextSync(receivedMessages, displayEffectIndex, 5000);
      console.log(`  ✓ Sync received after effect resolution`);

      // Verify effect results from the post-effect Sync
      const afterSummonHand = afterEffectSync?.payload?.body?.players?.[playerId]?.hand || [];
      const afterSummonField = afterEffectSync?.payload?.body?.players?.[playerId]?.field || [];
      console.log(`  Hand: ${afterSummonHand.length}, Field: ${afterSummonField.length}`);

      // Verify field size increased
      expect(afterSummonField.length).toBeGreaterThan(beforeSummonField.length);
      console.log(`  ✓ Card summoned to field`);

      // Step 5: Wait for Defrost message or additional Sync (indicates effect resolution complete)
      console.log(`\n[Step 5] Waiting for effect resolution to complete...`);

      // Wait for Defrost or timeout (some game modes may not send Defrost)
      try {
        await waitForDefrost(receivedMessages, displayEffectIndex, 2000);
        console.log(`  ✓ Defrost received - effect resolution complete`);
      } catch {
        console.log(`  Defrost not received (this may be normal in sandbox mode)`);
      }

      // Wait a bit more to ensure all messages are received
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Get the latest Sync message after effect resolution
      const latestSyncIndex = receivedMessages.reduce((latest, msg, idx) =>
        msg?.payload?.type === "Sync" ? idx : latest, -1);
      const finalSync = latestSyncIndex >= 0 ? receivedMessages[latestSyncIndex] : afterEffectSync;
      const finalHand = finalSync?.payload?.body?.players?.[playerId]?.hand || [];

      // Step 6: Verify effect - hand size should increase due to ブロックナイト effect
      console.log(`\n[Step 6] Verifying ${TEST_CARD_NAME} effect (add green unit to hand)...`);
      console.log(`  Hand before summon: ${beforeSummonHand.length}`);
      console.log(`  Hand after effect: ${finalHand.length}`);

      // ブロックナイト効果: 緑属性ユニットを1枚手札に加える
      // 召喚で手札が1枚減るが、効果で1枚加わるので、差し引きゼロか+になるはず
      // beforeSummonHand.length - 1 (召喚で減る) + 1 (効果で増える) = beforeSummonHand.length
      // Note: 色のチェックは省略（サーバーから返されるカードにcolor属性がない場合があるため）
      const effectResult = verifyCardAddedToHand(beforeSummon, finalSync, playerId);

      if (effectResult.success) {
        console.log(`  ✓ ${effectResult.message}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        console.log(`  Added cards:`, effectResult.addedCards.map((c: any) => ({
          id: c.id,
          catalogId: c.catalogId,
          name: c.name
        })));
        // 追加されたカードがブロックナイト（緑属性）であることを確認
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hasGreenUnit = effectResult.addedCards.some((c: any) => c.catalogId === TEST_CARD_ID);
        if (hasGreenUnit) {
          console.log(`  ✓ Green unit (${TEST_CARD_ID}) added to hand`);
        } else {
          console.log(`  Note: Added card is not ${TEST_CARD_ID}, but effect resolved successfully`);
        }
      } else {
        // 効果が解決されなかった場合はテスト失敗
        throw new Error(`Effect not resolved: ${effectResult.message}. Expected card to be added to hand.`);
      }

      console.log("\n=== Test Complete ===\n");
    } catch (error) {
      console.error("Test failed:", error);
      throw error;
    }
  }, { timeout: 15000 });

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

      // Get player info
      const playerIds = getPlayerIds(debugState);
      const playerId = playerIds[0];
      const playerInfo = debugState.players[playerId];

      await client.createRoom();
      await client.loadState(debugState);

      // Connect BEFORE starting game
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

      // Register player BEFORE starting game
      const { playerEntry } = await import("./helpers/debug-actions.ts");
      await playerEntry(
        wsClient,
        "99999",
        playerId,
        playerInfo.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions
        (playerInfo as any).library || [],
        []
      );

      // PlayerEntry is now confirmed (Sync received), start the game
      await client.startGame();

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
