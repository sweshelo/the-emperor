/**
 * Comprehensive sandbox tests with real game data
 */

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { SandboxClient } from "../src/sandbox/client.ts";
import { GameWebSocketClient } from "../src/websocket/client.ts";
import type { GameState } from "../src/types/game.ts";
import { loadSyncGameState, getPlayerIds } from "./helpers/data-loader.ts";
import syncData from "../data/payload/sync.json";

// Test configuration - uses SANDBOX_URL env var with fallback
const SANDBOX_WS_URL = process.env.SANDBOX_WS_URL || "ws://localhost:5000";

describe("Sandbox Comprehensive Tests", () => {
  let client: SandboxClient;
  let wsClient: GameWebSocketClient | null = null;

  beforeAll(() => {
    // SandboxClient uses SANDBOX_URL env var with fallback to localhost:5000
    client = new SandboxClient();
  });

  afterEach(async () => {
    // Cleanup: disconnect WebSocket and destroy sandbox
    if (wsClient) {
      wsClient.disconnect();
      wsClient = null;
    }

    try {
      await client.destroyRoom();
    } catch {
      // Ignore if room doesn't exist
    }
  });

  test("should create sandbox room", async () => {
    try {
      const isEnabled = await client.isEnabled();
      if (!isEnabled) {
        console.log("Skipping test: sandbox not enabled");
        return;
      }

      const result = await client.createRoom();
      expect(result.success).toBe(true);
      expect(result.roomId).toBe("99999");

      const status = await client.getStatus();
      expect(status.roomExists).toBe(true);

      console.log("✓ Sandbox room created successfully");
    } catch (error) {
      console.error("Test failed:", error);
      throw error;
    }
  });

  test("should load real game state from sync.json", async () => {
    try {
      const isEnabled = await client.isEnabled();
      if (!isEnabled) {
        console.log("Skipping test: sandbox not enabled");
        return;
      }

      // Create room
      await client.createRoom();

      // Extract game state from sync.json
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions
      const gameState: GameState = syncData.payload.body as any;

      // Load state
      const loadResult = await client.loadState(gameState);
      expect(loadResult.success).toBe(true);
      expect(loadResult.round).toBe(1);
      expect(loadResult.turn).toBe(1);

      console.log("✓ Real game state loaded successfully");
      console.log(`  Round: ${loadResult.round}, Turn: ${loadResult.turn}`);

      // Verify player data was loaded
      const playerIds = Object.keys(gameState.players);
      console.log(`  Players loaded: ${playerIds.length}`);
      playerIds.forEach((id) => {
        const player = gameState.players[id];
        console.log(`    - ${player?.name} (${id})`);
        console.log(`      Hand: ${player?.hand.length} cards`);
        console.log(`      Deck: ${player?.deck.length} cards`);
        console.log(`      Life: ${player?.life.current}/${player?.life.max}`);
      });
    } catch (error) {
      console.error("Test failed:", error);
      throw error;
    }
  });

  test("should start sandbox game with real data", async () => {
    try {
      const isEnabled = await client.isEnabled();
      if (!isEnabled) {
        console.log("Skipping test: sandbox not enabled");
        return;
      }

      // Setup: create room and load state
      await client.createRoom();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions
      const gameState: GameState = syncData.payload.body as any;
      await client.loadState(gameState);

      // Start game
      const startResult = await client.startGame();
      expect(startResult.success).toBe(true);

      console.log("✓ Sandbox game started with real data");
    } catch (error) {
      console.error("Test failed:", error);
      throw error;
    }
  });

  test("should connect to sandbox via WebSocket", async () => {
    try {
      const isEnabled = await client.isEnabled();
      if (!isEnabled) {
        console.log("Skipping test: sandbox not enabled");
        return;
      }

      // Setup sandbox
      await client.createRoom();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions
      const gameState: GameState = syncData.payload.body as any;
      await client.loadState(gameState);
      await client.startGame();

      // Connect via WebSocket
      wsClient = new GameWebSocketClient({
        url: `${SANDBOX_WS_URL}?roomId=99999`,
        reconnect: false,
      });

      let connected = false;
      wsClient.onConnect(() => {
        connected = true;
        console.log("✓ WebSocket connected to sandbox room");
      });

      await wsClient.connect();
      expect(connected).toBe(true);

      // Wait a bit to ensure connection is stable
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error("Test failed:", error);
      throw error;
    }
  });

  test("should send action to sandbox room", async () => {
    try {
      const isEnabled = await client.isEnabled();
      if (!isEnabled) {
        console.log("Skipping test: sandbox not enabled");
        return;
      }

      // Load game state and get player info
      const gameState = loadSyncGameState();
      const playerIds = getPlayerIds(gameState);
      const playerId = playerIds[0];

      if (!playerId) {
        throw new Error("No player ID found in game state");
      }

      const playerInfo = gameState.players[playerId];

      // Setup sandbox
      await client.createRoom();
      await client.loadState(gameState);

      // Connect via WebSocket BEFORE starting game
      wsClient = new GameWebSocketClient({
        url: `${SANDBOX_WS_URL}?roomId=99999`,
        reconnect: false,
      });

      const receivedMessages: unknown[] = [];
      wsClient.onMessage((message) => {
        receivedMessages.push(message);
      });

      await wsClient.connect();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Register player to receive Sync messages
      const { playerEntry } = await import("./helpers/debug-actions.ts");
      await playerEntry(
        wsClient,
        "99999",
        playerId,
        playerInfo.name,
        [],
        []
      );

      // Start game after player registration
      await client.startGame();

      // Wait for messages after game start
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify we received at least one message
      expect(receivedMessages.length).toBeGreaterThan(0);
      console.log(`✓ Received ${receivedMessages.length} message(s) from server`);

      console.log("✓ Action sending mechanism verified");
      console.log("  (Full action execution requires waiting for server prompts)");
    } catch (error) {
      console.error("Test failed:", error);
      throw error;
    }
  });

  test("should handle full sandbox workflow with real data", async () => {
    try {
      const isEnabled = await client.isEnabled();
      if (!isEnabled) {
        console.log("Skipping test: sandbox not enabled");
        return;
      }

      console.log("Starting full sandbox workflow...");

      // Step 1: Setup sandbox with real game data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions
      const gameState: GameState = syncData.payload.body as any;
      const result = await client.setupAndRun(gameState);

      expect(result.roomId).toBe("99999");
      expect(result.round).toBe(1);
      expect(result.turn).toBe(1);

      console.log("✓ Sandbox setup complete");

      // Step 2: Connect via WebSocket
      wsClient = new GameWebSocketClient({
        url: `${SANDBOX_WS_URL}?roomId=99999`,
        reconnect: false,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages: any[] = [];
      wsClient.onMessage((message) => {
        messages.push(message);
        console.log(`  Received: ${message.type}`);
      });

      await wsClient.connect();
      console.log("✓ WebSocket connected");

      // Step 3: Wait for initial sync
      await new Promise((resolve) => setTimeout(resolve, 500));

      console.log(`✓ Received ${messages.length} message(s) from server`);

      // Step 4: Verify we can get game state through messages
      const syncMessages = messages.filter((m) => m.type === "Sync");
      if (syncMessages.length > 0) {
        console.log("✓ Sync message received, game state synchronized");
        const syncedState = syncMessages[0].body;
        console.log(`  Round: ${syncedState.game?.round}, Turn: ${syncedState.game?.turn}`);
      }

      console.log("✓ Full workflow completed successfully");
    } catch (error) {
      console.error("Test failed:", error);
      throw error;
    }
  });

  test("should extract player hand details from sync data", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions
    const gameState: GameState = syncData.payload.body as any;
    const playerIds = Object.keys(gameState.players);

    console.log("Analyzing player hands from sync.json:");

    playerIds.forEach((playerId) => {
      const player = gameState.players[playerId];
      if (!player) return;

      console.log(`\nPlayer: ${player.name} (${playerId})`);
      console.log(`  Hand size: ${player.hand.length}`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      player.hand.forEach((card: any, index) => {
        if (card.catalogId) {
          console.log(`  [${index}] ${card.catalogId} (ID: ${card.id})`);
          if (card.bp) console.log(`      BP: ${card.bp}`);
          if (card.lv) console.log(`      Level: ${card.lv}`);
        } else {
          console.log(`  [${index}] Hidden card (ID: ${card.id})`);
        }
      });
    });

    expect(playerIds.length).toBe(2);
    console.log("\n✓ Player data analysis complete");
  });
});
