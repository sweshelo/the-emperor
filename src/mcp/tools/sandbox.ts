/**
 * MCP Tools for sandbox environment
 */

import type { ToolDefinition } from "../types/index.ts";
import { SandboxClient } from "../../sandbox/client.ts";
import { gameStateManager } from "../../game/state.ts";

/**
 * Type-safe getter for boolean arguments
 */
function getBoolean(args: Record<string, unknown>, key: string): boolean {
  const value = args[key];
  if (typeof value !== "boolean") {
    throw new Error(`Expected ${key} to be a boolean`);
  }
  return value;
}

/**
 * Type-safe getter for string arguments
 */
function getString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string") {
    throw new Error(`Expected ${key} to be a string`);
  }
  return value;
}

/**
 * Type guard to check if a value is a plain object
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === "object" && !Array.isArray(value)
  );
}

/**
 * Type-safe getter for optional object arguments
 */
function getOptionalObject(
  args: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (!isPlainObject(value)) {
    throw new Error(`Expected ${key} to be an object`);
  }
  return value;
}

/**
 * Deep merge two objects, recursively merging nested objects
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = result[key];

      if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
        result[key] = deepMerge(targetValue, sourceValue);
      } else {
        result[key] = sourceValue;
      }
    }
  }

  return result;
}

// Sandbox client instance (will be set externally)
let sandboxClient: SandboxClient | null = null;

/**
 * Set the sandbox client
 */
export function setSandboxClient(client: SandboxClient): void {
  sandboxClient = client;
}

/**
 * Helper to ensure sandbox client is available
 */
function ensureSandboxClient(): SandboxClient {
  if (!sandboxClient) {
    throw new Error("Sandbox client not initialized");
  }
  return sandboxClient;
}

/**
 * Check sandbox availability
 */
export const checkSandboxTool: ToolDefinition = {
  name: "check_sandbox",
  description: "Check if sandbox mode is available on the game server",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async () => {
    const client = ensureSandboxClient();

    try {
      const status = await client.getStatus();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to check sandbox status: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * Create sandbox room
 */
export const createSandboxRoomTool: ToolDefinition = {
  name: "create_sandbox_room",
  description: "Create a sandbox room (room ID: 99999) for testing moves",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async () => {
    const client = ensureSandboxClient();

    try {
      const result = await client.createRoom();
      return {
        content: [
          {
            type: "text",
            text: `Sandbox room created: ${result.roomId}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to create sandbox room: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * Load game state into sandbox
 */
export const loadSandboxStateTool: ToolDefinition = {
  name: "load_sandbox_state",
  description:
    "Load a game state into the sandbox. You can use the current game state or a modified version to test different scenarios.",
  inputSchema: {
    type: "object",
    properties: {
      useCurrentState: {
        type: "boolean",
        description:
          "If true, use the current game state. If false, you must provide a custom state.",
      },
      customState: {
        type: "object",
        description:
          "Custom game state to load (only used if useCurrentState is false)",
      },
    },
    required: ["useCurrentState"],
  },
  handler: async (args) => {
    const client = ensureSandboxClient();
    const useCurrentState = getBoolean(args, "useCurrentState");

    let state: Record<string, unknown>;
    if (useCurrentState) {
      const currentState = gameStateManager.getState();
      if (!currentState) {
        return {
          content: [
            {
              type: "text",
              text: "No current game state available",
            },
          ],
          isError: true,
        };
      }
      state = currentState;
    } else {
      const customState = getOptionalObject(args, "customState");
      if (!customState) {
        return {
          content: [
            {
              type: "text",
              text: "customState is required when useCurrentState is false",
            },
          ],
          isError: true,
        };
      }
      state = customState;
    }

    try {
      const result = await client.loadState(state);
      return {
        content: [
          {
            type: "text",
            text: `Sandbox state loaded successfully. Round: ${result.round}, Turn: ${result.turn}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to load sandbox state: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * Start sandbox game
 */
export const startSandboxGameTool: ToolDefinition = {
  name: "start_sandbox_game",
  description: "Start the sandbox game (skips mulligan phase)",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async () => {
    const client = ensureSandboxClient();

    try {
      const result = await client.startGame();
      return {
        content: [
          {
            type: "text",
            text: `Sandbox game started with ${result.playerCount} player(s)`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to start sandbox game: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * Destroy sandbox room
 */
export const destroySandboxRoomTool: ToolDefinition = {
  name: "destroy_sandbox_room",
  description: "Destroy the sandbox room and clean up resources",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async () => {
    const client = ensureSandboxClient();

    try {
      const result = await client.destroyRoom();
      return {
        content: [
          {
            type: "text",
            text: result.message,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to destroy sandbox room: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * Evaluate a move in sandbox
 */
export const evaluateMoveTool: ToolDefinition = {
  name: "evaluate_move",
  description:
    "Evaluate a potential move by testing it in a sandbox environment. This creates a sandbox, loads the current state, executes the move, and returns the resulting state.",
  inputSchema: {
    type: "object",
    properties: {
      moveDescription: {
        type: "string",
        description:
          "Description of the move to evaluate (for logging purposes)",
      },
      stateModifications: {
        type: "object",
        description:
          "Modifications to apply to the current game state before evaluating the move (optional)",
      },
    },
    required: ["moveDescription"],
  },
  handler: async (args) => {
    const client = ensureSandboxClient();
    const moveDescription = getString(args, "moveDescription");
    const stateModifications = getOptionalObject(args, "stateModifications");

    console.log(`[Sandbox] Evaluating move: ${moveDescription}`);

    try {
      // Get current state
      const currentState = gameStateManager.getState();
      if (!currentState) {
        return {
          content: [
            {
              type: "text",
              text: "No current game state available",
            },
          ],
          isError: true,
        };
      }

      // Apply modifications if provided (deep merge to preserve nested structures)
      let testState: Record<string, unknown> = currentState;
      if (stateModifications) {
        testState = deepMerge(currentState, stateModifications);
      }

      // Setup sandbox
      const result = await client.setupAndRun(testState);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                moveDescription,
                roomId: result.roomId,
                initialState: {
                  round: result.round,
                  turn: result.turn,
                },
                note: "Sandbox is ready. You can now connect via WebSocket to room 99999 and execute the move to see the results.",
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to evaluate move: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const sandboxTools = [
  checkSandboxTool,
  createSandboxRoomTool,
  loadSandboxStateTool,
  startSandboxGameTool,
  destroySandboxRoomTool,
  evaluateMoveTool,
];
