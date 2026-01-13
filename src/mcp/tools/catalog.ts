/**
 * MCP Tools for catalog access
 */

import type { ToolDefinition } from "../types/index.ts";
import { catalogService, type CatalogCard } from "../../catalog/index.ts";

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
 * Type-safe getter for optional number arguments
 */
function getOptionalNumber(
  args: Record<string, unknown>,
  key: string,
  defaultValue: number
): number {
  const value = args[key];
  if (value === undefined || value === null) return defaultValue;
  if (typeof value !== "number") {
    throw new Error(`Expected ${key} to be a number`);
  }
  return value;
}

/**
 * Type-safe getter for required number arguments
 */
function getNumber(args: Record<string, unknown>, key: string): number {
  const value = args[key];
  if (typeof value !== "number") {
    throw new Error(`Expected ${key} to be a number`);
  }
  return value;
}

/**
 * Type guard to check if a string is a valid card type
 */
function isValidCardType(value: string): value is CatalogCard["type"] {
  return (
    value === "unit" ||
    value === "trigger" ||
    value === "intercept" ||
    value === "advanced_unit" ||
    value === "virus" ||
    value === "joker"
  );
}

/**
 * Type-safe getter for card type arguments
 */
function getCardType(
  args: Record<string, unknown>,
  key: string
): CatalogCard["type"] {
  const value = args[key];
  if (typeof value !== "string") {
    throw new Error(`Expected ${key} to be a string`);
  }
  if (!isValidCardType(value)) {
    throw new Error(
      `Invalid card type: ${value}. Must be one of: unit, trigger, intercept, advanced_unit, virus, joker`
    );
  }
  return value;
}

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
    const catalogId = getString(args, "catalogId");
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
    const query = getString(args, "query");
    const limit = getOptionalNumber(args, "limit", 10);
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
    const query = getString(args, "query");
    const limit = getOptionalNumber(args, "limit", 10);
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
    const cardType = getCardType(args, "cardType");
    const limit = getOptionalNumber(args, "limit", 20);
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
    const minCost = getNumber(args, "minCost");
    const maxCost = getNumber(args, "maxCost");
    const limit = getOptionalNumber(args, "limit", 20);
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
