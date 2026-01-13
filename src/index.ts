/**
 * CODE OF JOKER Simulator AI Agent - Main Entry Point
 *
 * This is the main entry point for the AI agent that plays CODE OF JOKER Simulator.
 */

import { ClaudeAgent } from "./agent/claude.ts";
import { BuddyAgent } from "./agent/buddy.ts";
import { GameController } from "./game/controller.ts";
import { catalogService } from "./catalog/index.ts";
import type { AgentMode, Agent } from "./types/agent.ts";

/**
 * Configuration from environment variables
 */
interface Config {
  apiKey?: string;
  serverUrl: string;
  playerId: string;
  playerName: string;
  model?: string;
  mode: AgentMode;
}

/**
 * Validate and return agent mode from string
 */
function parseAgentMode(value: string | undefined): AgentMode {
  if (value === "buddy") {
    return "buddy";
  }
  return "autonomous";
}

/**
 * Load configuration from environment
 */
function loadConfig(): Config {
  const mode = parseAgentMode(process.env.AGENT_MODE);

  // API key is only required for autonomous mode
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (mode === "autonomous" && !apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required for autonomous mode");
  }

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
    mode,
  };
}

/**
 * Create agent based on mode
 */
function createAgent(config: Config, catalogLookup: (id: string) => ReturnType<typeof catalogService.getCard>): Agent {
  if (config.mode === "buddy") {
    console.log("Mode: BUDDY (Interactive)");
    console.log("  You control the agent via command line input");
    return new BuddyAgent(config.playerName, catalogLookup);
  }

  // Autonomous mode
  console.log("Mode: AUTONOMOUS (AI-controlled)");
  console.log(`  Model: ${config.model ?? "claude-sonnet-4-20250514 (default)"}`);

  if (!config.apiKey) {
    throw new Error("API key required for autonomous mode");
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
  console.log("");

  // Create catalog lookup function
  const catalogLookup = (id: string) => catalogService.getCard(id);

  // Create agent based on mode
  let agent: Agent;
  try {
    agent = createAgent(config, catalogLookup);
  } catch (error) {
    console.error("Failed to create agent:", error);
    process.exit(1);
  }

  console.log("");

  // Create game controller
  const controller = new GameController(
    {
      serverUrl: config.serverUrl,
      playerId: config.playerId,
      playerName: config.playerName,
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
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
