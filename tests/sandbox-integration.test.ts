/**
 * Sandbox integration tests
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { SandboxClient } from "../src/sandbox/client.ts";

describe("Sandbox Integration Tests", () => {
  let client: SandboxClient;

  beforeAll(() => {
    // SandboxClient uses SANDBOX_URL env var with fallback to localhost:5000
    client = new SandboxClient();
  });

  test("should check if sandbox is available", async () => {
    try {
      const isEnabled = await client.isEnabled();
      console.log(`Sandbox enabled: ${isEnabled}`);

      if (isEnabled) {
        const status = await client.getStatus();
        console.log("Sandbox status:", status);
        expect(status.enabled).toBe(true);
      }
    } catch (error) {
      console.log("Sandbox not available (this is OK if SANDBOX_MODE=false):", error);
    }
  });

  test("should create and destroy sandbox room", async () => {
    try {
      const isEnabled = await client.isEnabled();
      if (!isEnabled) {
        console.log("Skipping test: sandbox not enabled");
        return;
      }

      // Create room
      const createResult = await client.createRoom();
      expect(createResult.success).toBe(true);
      expect(createResult.roomId).toBe("99999");
      console.log("Created sandbox room:", createResult.roomId);

      // Check status
      const status = await client.getStatus();
      expect(status.roomExists).toBe(true);

      // Destroy room
      const destroyResult = await client.destroyRoom();
      expect(destroyResult.success).toBe(true);
      console.log("Destroyed sandbox room");
    } catch (error) {
      console.error("Test failed:", error);
      throw error;
    }
  });

  test("should load game state and start game", async () => {
    try {
      const isEnabled = await client.isEnabled();
      if (!isEnabled) {
        console.log("Skipping test: sandbox not enabled");
        return;
      }

      // Create room
      await client.createRoom();

      // Sample game state
      const sampleState: any = {
        game: {
          round: 1,
          turn: 1,
        },
        players: {
          "test-player-1": {
            id: "test-player-1",
            name: "Test Player 1",
            deck: [],
            hand: [],
            field: [],
            trash: [],
            delete: [],
            trigger: [],
            cp: { current: 2, max: 2 },
            life: { current: 7, max: 7 },
            joker: { card: [], gauge: 0 },
            purple: undefined,
          },
        },
        rule: {
          maxLife: 7,
          maxCP: 10,
          maxFieldSize: 5,
          maxTriggerSize: 5,
          maxHandSize: 7,
          initialHandSize: 5,
          initialCP: 2,
        },
      };

      // Load state
      const loadResult = await client.loadState(sampleState);
      expect(loadResult.success).toBe(true);
      expect(loadResult.round).toBe(1);
      expect(loadResult.turn).toBe(1);
      console.log("Loaded game state");

      // Start game
      const startResult = await client.startGame();
      expect(startResult.success).toBe(true);
      console.log("Started sandbox game");

      // Cleanup
      await client.destroyRoom();
    } catch (error) {
      console.error("Test failed:", error);
      // Cleanup on error
      try {
        await client.destroyRoom();
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  });

  test("should execute full sandbox workflow", async () => {
    try {
      const isEnabled = await client.isEnabled();
      if (!isEnabled) {
        console.log("Skipping test: sandbox not enabled");
        return;
      }

      const sampleState: any = {
        game: {
          round: 3,
          turn: 5,
        },
        players: {
          "test-player-1": {
            id: "test-player-1",
            name: "Test Player 1",
            deck: [],
            hand: [],
            field: [],
            trash: [],
            delete: [],
            trigger: [],
            cp: { current: 5, max: 5 },
            life: { current: 5, max: 7 },
            joker: { card: [], gauge: 50 },
            purple: undefined,
          },
        },
        rule: {
          maxLife: 7,
          maxCP: 10,
          maxFieldSize: 5,
          maxTriggerSize: 5,
          maxHandSize: 7,
          initialHandSize: 5,
          initialCP: 2,
        },
      };

      // Execute full workflow
      const result = await client.setupAndRun(sampleState);
      expect(result.roomId).toBe("99999");
      expect(result.round).toBe(3);
      expect(result.turn).toBe(5);
      console.log("Full workflow completed:", result);

      // Cleanup
      await client.destroyRoom();
    } catch (error) {
      console.error("Test failed:", error);
      // Cleanup on error
      try {
        await client.destroyRoom();
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  });
});
