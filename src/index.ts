/**
 * CODE OF JOKER Simulator AI Agent - Main Entry Point
 *
 * This is the main entry point for the AI agent that plays CODE OF JOKER Simulator.
 */

import { ClaudeAgent } from "./agent/claude.ts";
import { BuddyAgent } from "./agent/buddy.ts";
import { GameController } from "./game/controller.ts";
import { catalogService } from "./catalog/index.ts";
import { selectMode, waitForJoinCommand, closeReadline } from "./cli/index.ts";
import type { AgentMode, Agent } from "./types/agent.ts";

/**
 * Default deck configuration
 * Based on the-magician's STARTER_DECK
 */
const DEFAULT_DECK = [
  "1-2-001", "1-2-001", "1-2-003", "1-2-003", "1-2-004", "1-2-004",
  "1-2-007", "1-2-007", "1-2-101", "1-2-101", "1-2-104", "1-2-104",
  "1-2-106", "1-2-106", "PR-028", "PR-028", "1-2-043", "1-2-043",
  "1-2-049", "1-2-049", "1-2-051", "1-2-051", "1-2-124", "PR-016",
  "PR-016", "PR-031", "PR-031", "1-2-122", "1-2-122", "1-2-057",
  "1-2-057", "PR-032", "1-2-078", "1-2-141", "PR-067", "1-2-099",
  "1-2-099", "1-2-148", "1-2-071", "1-2-071",
];

/**
 * Configuration from environment variables
 */
interface Config {
  apiKey?: string;
  serverUrl: string;
  playerId: string;
  playerName: string;
  model?: string;
  deck: string[];
}

/**
 * Load configuration from environment
 */
function loadConfig(): Config {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const serverUrl = process.env.GAME_SERVER_URL ?? "ws://localhost:3000";
  const playerId = process.env.PLAYER_ID ?? `emperor-${Date.now()}`;
  const playerName = process.env.PLAYER_NAME ?? "The Emperor";
  const model = process.env.CLAUDE_MODEL;

  return {
    apiKey,
    serverUrl,
    playerId,
    playerName,
    model,
    deck: DEFAULT_DECK,
  };
}

/**
 * Default path for learning records
 */
const LEARNING_RECORDS_PATH = "./data/learning-records.json";

/**
 * Create agent based on mode
 */
function createAgent(
  mode: AgentMode,
  config: Config,
  catalogLookup: (id: string) => ReturnType<typeof catalogService.getCard>
): Agent {
  if (mode === "buddy") {
    console.log("Mode: BUDDY (Interactive)");
    console.log("  You control the agent via command line input");

    // Enable AI advisor if API key is available
    if (config.apiKey) {
      console.log("  AI Advisor: ENABLED (use /think, /advice commands)");
      return new BuddyAgent(config.playerName, catalogLookup, {
        advisor: {
          apiKey: config.apiKey,
          model: config.model,
        },
        autoEvaluate: true,
        learningRecordsPath: LEARNING_RECORDS_PATH,
      });
    }

    console.log("  AI Advisor: DISABLED (set ANTHROPIC_API_KEY to enable)");
    return new BuddyAgent(config.playerName, catalogLookup);
  }

  // Autonomous mode
  console.log("Mode: AUTONOMOUS (AI-controlled)");
  console.log(`  Model: ${config.model ?? "claude-sonnet-4-20250514 (default)"}`);

  if (!config.apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required for autonomous mode");
  }

  return new ClaudeAgent(
    config.playerName,
    {
      apiKey: config.apiKey,
      model: config.model,
    },
    catalogLookup
  );
}

async function main() {
  console.log("CODE OF JOKER AI Agent - The Emperor");
  console.log("=====================================");
  console.log("");

  // Load configuration
  let config: Config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error("Configuration error:", error);
    process.exit(1);
  }

  console.log(`Player ID: ${config.playerId}`);
  console.log(`Player Name: ${config.playerName}`);
  console.log(`Server URL: ${config.serverUrl}`);

  // Interactive mode selection
  const mode = await selectMode();
  console.log("");

  // Create catalog lookup function
  const catalogLookup = (id: string) => catalogService.getCard(id);

  // Create agent based on mode
  let agent: Agent;
  try {
    agent = createAgent(mode, config, catalogLookup);
  } catch (error) {
    console.error("Failed to create agent:", error);
    closeReadline();
    process.exit(1);
  }

  console.log("");

  // Wait for /join command
  const joinResult = await waitForJoinCommand();
  console.log(`Joining room: ${joinResult.roomId}`);
  console.log("");

  // Create game controller with room ID
  const controller = new GameController(
    {
      serverUrl: config.serverUrl,
      roomId: joinResult.roomId,
      playerId: config.playerId,
      playerName: config.playerName,
      deck: config.deck,
    },
    agent
  );

  // Handle graceful shutdown
  const shutdown = () => {
    console.log("\nShutting down...");
    if (agent.clearHistory) {
      agent.clearHistory();
    }
    controller.stop();
    closeReadline();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start the controller
  console.log("Starting game controller...");
  try {
    await controller.start();
    console.log("Agent is running. Press Ctrl+C to stop.");

    // Keep process alive
    await new Promise(() => {
      // This promise never resolves - we wait for shutdown signal
    });
  } catch (error) {
    console.error("Failed to start:", error);
    closeReadline();
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
