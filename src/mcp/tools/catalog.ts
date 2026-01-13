/**
 * MCP Tools for catalog access
 */

import type { ToolDefinition } from "../types/index.ts";
import { catalogService } from "../../catalog/index.ts";

/**
 * Get card information by catalog ID
 */
export const getCardTool: ToolDefinition = {
  name: "get_card",
  description: "Get detailed information about a card by its catalog ID",
  inputSchema: {
    type: "object",
    properties: {
      catalogId: {
        type: "string",
        description: "The catalog ID of the card",
      },
    },
    required: ["catalogId"],
  },
  handler: async (args) => {
    const catalogId = args.catalogId as string;
    const card = catalogService.getCard(catalogId);

    if (!card) {
      return {
        content: [
          {
            type: "text",
            text: `Card not found: ${catalogId}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(card, null, 2),
        },
      ],
    };
  },
};

/**
 * Search cards by name
 */
export const searchCardsByNameTool: ToolDefinition = {
  name: "search_cards_by_name",
  description: "Search for cards by name (partial match supported)",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query for card name",
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (default: 10)",
      },
    },
    required: ["query"],
  },
  handler: async (args) => {
    const query = args.query as string;
    const limit = (args.limit as number) || 10;
    const results = catalogService.searchByName(query).slice(0, limit);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  },
};

/**
 * Search cards by ability text
 */
export const searchCardsByAbilityTool: ToolDefinition = {
  name: "search_cards_by_ability",
  description: "Search for cards by ability text (partial match supported)",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query for ability text",
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (default: 10)",
      },
    },
    required: ["query"],
  },
  handler: async (args) => {
    const query = args.query as string;
    const limit = (args.limit as number) || 10;
    const results = catalogService.searchByAbility(query).slice(0, limit);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  },
};

/**
 * Get cards by type
 */
export const getCardsByTypeTool: ToolDefinition = {
  name: "get_cards_by_type",
  description: "Get all cards of a specific type",
  inputSchema: {
    type: "object",
    properties: {
      cardType: {
        type: "string",
        description: "The card type",
        enum: ["unit", "trigger", "intercept", "advanced_unit", "virus", "joker"],
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (default: 20)",
      },
    },
    required: ["cardType"],
  },
  handler: async (args) => {
    const cardType = args.cardType as any;
    const limit = (args.limit as number) || 20;
    const results = catalogService.getCardsByType(cardType).slice(0, limit);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  },
};

/**
 * Get cards by cost range
 */
export const getCardsByCostRangeTool: ToolDefinition = {
  name: "get_cards_by_cost_range",
  description: "Get cards within a cost range",
  inputSchema: {
    type: "object",
    properties: {
      minCost: {
        type: "number",
        description: "Minimum cost",
      },
      maxCost: {
        type: "number",
        description: "Maximum cost",
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (default: 20)",
      },
    },
    required: ["minCost", "maxCost"],
  },
  handler: async (args) => {
    const minCost = args.minCost as number;
    const maxCost = args.maxCost as number;
    const limit = (args.limit as number) || 20;
    const results = catalogService
      .getCardsByCostRange(minCost, maxCost)
      .slice(0, limit);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  },
};

export const catalogTools = [
  getCardTool,
  searchCardsByNameTool,
  searchCardsByAbilityTool,
  getCardsByTypeTool,
  getCardsByCostRangeTool,
];
