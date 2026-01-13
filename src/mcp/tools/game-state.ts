/**
 * MCP Tools for game state access
 */

import type { ToolDefinition } from "../types/index.ts";
import { gameStateManager } from "../../game/state.ts";
import { catalogService, type CatalogCard } from "../../catalog/index.ts";

/**
 * Card atom with catalogId (runtime type for hand/field cards)
 */
interface CardAtom {
  id: string;
  catalogId?: string;
  [key: string]: unknown;
}

/**
 * Check if an atom has a catalogId
 */
function hasCardId(atom: unknown): atom is CardAtom {
  return (
    typeof atom === "object" &&
    atom !== null &&
    "catalogId" in atom &&
    typeof (atom as CardAtom).catalogId === "string"
  );
}

/**
 * Get current game state
 */
export const getGameStateTool: ToolDefinition = {
  name: "get_game_state",
  description: "Get the current game state including all player information",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async () => {
    const state = gameStateManager.getSerializableState();

    if (!state) {
      return {
        content: [
          {
            type: "text",
            text: "No game state available",
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(state, null, 2),
        },
      ],
    };
  },
};

/**
 * Get my player information
 */
export const getMyPlayerTool: ToolDefinition = {
  name: "get_my_player",
  description: "Get your player information (hand, field, life, CP, etc.)",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async () => {
    const player = gameStateManager.getMyPlayer();

    if (!player) {
      return {
        content: [
          {
            type: "text",
            text: "Player information not available",
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(player, null, 2),
        },
      ],
    };
  },
};

/**
 * Get opponent player information
 */
export const getOpponentPlayerTool: ToolDefinition = {
  name: "get_opponent_player",
  description: "Get opponent player information (visible information only)",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async () => {
    const player = gameStateManager.getOpponentPlayer();

    if (!player) {
      return {
        content: [
          {
            type: "text",
            text: "Opponent information not available",
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(player, null, 2),
        },
      ],
    };
  },
};

/**
 * Get current choice prompt
 */
export const getCurrentChoiceTool: ToolDefinition = {
  name: "get_current_choice",
  description: "Get the current choice prompt if there is one",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async () => {
    const choice = gameStateManager.getCurrentChoice();

    if (!choice) {
      return {
        content: [
          {
            type: "text",
            text: "No current choice prompt",
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(choice, null, 2),
        },
      ],
    };
  },
};

/**
 * Get detailed hand information with card details
 */
export const getHandDetailsTool: ToolDefinition = {
  name: "get_hand_details",
  description:
    "Get detailed information about cards in your hand, including card details from catalog",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async () => {
    const player = gameStateManager.getMyPlayer();

    if (!player) {
      return {
        content: [
          {
            type: "text",
            text: "Player information not available",
          },
        ],
        isError: true,
      };
    }

    const handWithDetails = player.hand.map((atom) => {
      let cardInfo: CatalogCard | null = null;
      if (hasCardId(atom) && atom.catalogId) {
        cardInfo = catalogService.getCard(atom.catalogId) ?? null;
      }
      return {
        ...atom,
        cardInfo,
      };
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(handWithDetails, null, 2),
        },
      ],
    };
  },
};

/**
 * Get detailed field information with card details
 */
export const getFieldDetailsTool: ToolDefinition = {
  name: "get_field_details",
  description:
    "Get detailed information about units on your field, including card details from catalog",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async () => {
    const player = gameStateManager.getMyPlayer();

    if (!player) {
      return {
        content: [
          {
            type: "text",
            text: "Player information not available",
          },
        ],
        isError: true,
      };
    }

    const fieldWithDetails = player.field.map((unit) => {
      const cardInfo = unit.catalogId
        ? catalogService.getCard(unit.catalogId) ?? null
        : null;
      return {
        ...unit,
        cardInfo,
      };
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(fieldWithDetails, null, 2),
        },
      ],
    };
  },
};

export const gameStateTools = [
  getGameStateTool,
  getMyPlayerTool,
  getOpponentPlayerTool,
  getCurrentChoiceTool,
  getHandDetailsTool,
  getFieldDetailsTool,
];
