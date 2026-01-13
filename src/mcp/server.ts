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
import { sandboxTools, setSandboxClient } from "./tools/sandbox.ts";
import { GameWebSocketClient } from "../websocket/client.ts";
import { SandboxClient } from "../sandbox/client.ts";
import { gameStateManager } from "../game/state.ts";
import type { ServerMessage } from "../types/game.ts";
import { parseGameState, parseChoices } from "../schemas/index.ts";

// Type for MCP CallTool request
interface CallToolRequest {
  params: {
    name: string;
    arguments?: Record<string, unknown>;
  };
}

// Combine all tools
const allTools = [
  ...catalogTools,
  ...gameStateTools,
  ...actionTools,
  ...sandboxTools,
];

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
  setActionSender((payload) => {
    if (!wsClient || !wsClient.isConnected()) {
      throw new Error("WebSocket client not connected");
    }
    // Use sendMcpAction which properly handles McpClientPayload
    // (looser types with IDs only - server resolves full data)
    wsClient.sendMcpAction(payload);
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
  // @ts-ignore - MCP SDK type compatibility issue
  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
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
    const payload = message.payload;
    const payloadType = "type" in payload ? payload.type : "unknown";
    console.log(`[MCP] Received message: ${payloadType}`);

    switch (payloadType) {
      case "Sync":
        if ("body" in payload) {
          const gameState = parseGameState(payload.body);
          if (gameState) {
            gameStateManager.updateState(gameState);
          }
        }
        break;

      case "Choices":
        if ("promptId" in payload && "player" in payload && "choices" in payload) {
          const choices = parseChoices(payload.choices);
          if (choices) {
            gameStateManager.setChoice({
              type: "Choices",
              promptId: payload.promptId,
              player: payload.player,
              choices,
            });
          }
        }
        break;

      case "TurnChange":
        if ("player" in payload && "isFirst" in payload) {
          console.log(
            `[MCP] Turn changed to ${payload.player} (${payload.isFirst ? "first" : "second"})`
          );
        }
        break;

      case "MulliganStart":
        console.log("[MCP] Mulligan phase started");
        break;

      case "Operation":
        if ("action" in payload) {
          console.log(`[MCP] Operation: ${payload.action}`);
        }
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

  // Setup sandbox client if base URL is provided
  const sandboxBaseUrl =
    process.env.SANDBOX_BASE_URL || process.env.GAME_SERVER_URL;

  if (sandboxBaseUrl) {
    // Remove query string and trailing slash, then convert ws:// to http://
    const urlWithoutQuery = sandboxBaseUrl.split("?")[0] || sandboxBaseUrl;
    const cleanUrl = urlWithoutQuery.replace(/\/$/, "") || urlWithoutQuery;
    const httpBaseUrl = cleanUrl
      .replace(/^wss:\/\//, "https://")
      .replace(/^ws:\/\//, "http://");

    console.error(`[MCP] Initializing sandbox client: ${httpBaseUrl}`);
    const sandboxClient = new SandboxClient(httpBaseUrl);
    setSandboxClient(sandboxClient);

    // Check if sandbox is enabled
    try {
      const isEnabled = await sandboxClient.isEnabled();
      if (isEnabled) {
        console.error("[MCP] Sandbox mode is enabled on the server");
      } else {
        console.error(
          "[MCP] Sandbox mode is not enabled on the server (this is normal for production)"
        );
      }
    } catch (error) {
      console.error("[MCP] Could not check sandbox status:", error);
    }
  } else {
    console.error("[MCP] No sandbox URL configured. Sandbox tools will not be available.");
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
