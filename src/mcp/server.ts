#!/usr/bin/env bun
/**
 * MCP Server for CODE OF JOKER AI Agent
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { catalogTools } from "./tools/catalog.ts";
import { gameStateTools } from "./tools/game-state.ts";
import { actionTools, setActionSender } from "./tools/actions.ts";
import { GameWebSocketClient } from "../websocket/client.ts";
import { gameStateManager } from "../game/state.ts";
import type { ServerMessage } from "../types/game.ts";

// Combine all tools
const allTools = [...catalogTools, ...gameStateTools, ...actionTools];

/**
 * Create MCP server
 */
function createServer() {
  const server = new Server(
    {
      name: "the-emperor",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // WebSocket client instance (will be initialized when needed)
  let wsClient: GameWebSocketClient | null = null;

  // Setup action sender for action tools
  setActionSender((action) => {
    if (!wsClient || !wsClient.isConnected()) {
      throw new Error("WebSocket client not connected");
    }
    wsClient.send(action);
  });

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: allTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const tool = allTools.find((t) => t.name === toolName);

    if (!tool) {
      return {
        content: [
          {
            type: "text",
            text: `Unknown tool: ${toolName}`,
          },
        ],
        isError: true,
      };
    }

    try {
      return await tool.handler(request.params.arguments || {});
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error executing tool ${toolName}: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  return { server, getWsClient: () => wsClient, setWsClient: (client: GameWebSocketClient) => { wsClient = client; } };
}

/**
 * Setup WebSocket client (called externally or via environment)
 */
export function setupWebSocketClient(url: string, playerId: string): GameWebSocketClient {
  const wsClient = new GameWebSocketClient({ url });

  // Set player ID
  gameStateManager.setMyPlayerId(playerId);

  // Setup message handlers
  wsClient.onMessage((message: ServerMessage) => {
    console.log(`[MCP] Received message: ${message.type}`);

    switch (message.type) {
      case "Sync":
        gameStateManager.updateState(message.body);
        break;

      case "Choices":
        gameStateManager.setChoice(message);
        break;

      case "TurnChange":
        console.log(
          `[MCP] Turn changed to ${message.player} (${message.isFirst ? "first" : "second"})`
        );
        break;

      case "MulliganStart":
        console.log("[MCP] Mulligan phase started");
        break;

      case "Operation":
        console.log(`[MCP] Operation: ${message.action}`);
        break;
    }
  });

  wsClient.onError((error) => {
    console.error("[MCP] WebSocket error:", error);
  });

  wsClient.onConnect(() => {
    console.log("[MCP] WebSocket connected");
  });

  wsClient.onDisconnect(() => {
    console.log("[MCP] WebSocket disconnected");
    gameStateManager.reset();
  });

  return wsClient;
}

/**
 * Main entry point
 */
async function main() {
  console.error("[MCP] Starting CODE OF JOKER AI Agent MCP Server");

  const { server, setWsClient } = createServer();

  // Check for WebSocket configuration in environment
  const wsUrl = process.env.GAME_SERVER_URL;
  const playerId = process.env.PLAYER_ID;

  if (wsUrl && playerId) {
    console.error(`[MCP] Connecting to game server: ${wsUrl}`);
    const wsClient = setupWebSocketClient(wsUrl, playerId);
    setWsClient(wsClient);

    try {
      await wsClient.connect();
      console.error("[MCP] Connected to game server");
    } catch (error) {
      console.error("[MCP] Failed to connect to game server:", error);
    }
  } else {
    console.error(
      "[MCP] No WebSocket configuration found. Set GAME_SERVER_URL and PLAYER_ID to connect."
    );
  }

  // Start MCP server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[MCP] MCP Server running on stdio");
}

// Run if this is the main module
if (import.meta.main) {
  main().catch((error) => {
    console.error("[MCP] Fatal error:", error);
    process.exit(1);
  });
}

export { createServer, main };
