/**
 * MCP Tools for game actions
 */

import type { ToolDefinition } from "../types/index.ts";
import type { ClientAction } from "../../types/game.ts";

// This will be injected by the MCP server
let sendAction: ((action: ClientAction) => void) | null = null;

/**
 * Set the action sender function
 */
export function setActionSender(sender: (action: ClientAction) => void): void {
  sendAction = sender;
}

/**
 * Helper to ensure action sender is available
 */
function ensureActionSender(): (action: ClientAction) => void {
  if (!sendAction) {
    throw new Error("Action sender not initialized");
  }
  return sendAction;
}

/**
 * Summon a unit from hand
 */
export const summonUnitTool: ToolDefinition = {
  name: "summon_unit",
  description: "Summon a unit card from your hand to the field",
  inputSchema: {
    type: "object",
    properties: {
      playerId: {
        type: "string",
        description: "Your player ID",
      },
      cardId: {
        type: "string",
        description: "The ID of the card in your hand to summon",
      },
    },
    required: ["playerId", "cardId"],
  },
  handler: async (args) => {
    const sender = ensureActionSender();
    const action: ClientAction = {
      type: "UnitDrive",
      player: args.playerId as string,
      target: { id: args.cardId as string },
    };

    sender(action);

    return {
      content: [
        {
          type: "text",
          text: `Summoned unit: ${args.cardId}`,
        },
      ],
    };
  },
};

/**
 * Evolve a unit
 */
export const evolveUnitTool: ToolDefinition = {
  name: "evolve_unit",
  description: "Evolve a unit on the field with an evolution card from hand",
  inputSchema: {
    type: "object",
    properties: {
      playerId: {
        type: "string",
        description: "Your player ID",
      },
      evolutionCardId: {
        type: "string",
        description: "The ID of the evolution card in your hand",
      },
      baseUnitId: {
        type: "string",
        description: "The ID of the unit on the field to evolve",
      },
    },
    required: ["playerId", "evolutionCardId", "baseUnitId"],
  },
  handler: async (args) => {
    const sender = ensureActionSender();
    const action: ClientAction = {
      type: "EvolveDrive",
      player: args.playerId as string,
      target: { id: args.evolutionCardId as string },
      source: { id: args.baseUnitId as string },
    };

    sender(action);

    return {
      content: [
        {
          type: "text",
          text: `Evolved unit ${args.baseUnitId} with ${args.evolutionCardId}`,
        },
      ],
    };
  },
};

/**
 * Use JOKER
 */
export const useJokerTool: ToolDefinition = {
  name: "use_joker",
  description: "Use a JOKER card",
  inputSchema: {
    type: "object",
    properties: {
      playerId: {
        type: "string",
        description: "Your player ID",
      },
      jokerId: {
        type: "string",
        description: "The ID of the JOKER card to use",
      },
    },
    required: ["playerId", "jokerId"],
  },
  handler: async (args) => {
    const sender = ensureActionSender();
    const action: ClientAction = {
      type: "JokerDrive",
      player: args.playerId as string,
      target: { id: args.jokerId as string },
    };

    sender(action);

    return {
      content: [
        {
          type: "text",
          text: `Used JOKER: ${args.jokerId}`,
        },
      ],
    };
  },
};

/**
 * Set trigger/intercept
 */
export const setTriggerTool: ToolDefinition = {
  name: "set_trigger",
  description: "Set a trigger or intercept card from hand",
  inputSchema: {
    type: "object",
    properties: {
      playerId: {
        type: "string",
        description: "Your player ID",
      },
      cardId: {
        type: "string",
        description: "The ID of the trigger/intercept card in hand",
      },
      catalogId: {
        type: "string",
        description: "The catalog ID of the card",
      },
    },
    required: ["playerId", "cardId", "catalogId"],
  },
  handler: async (args) => {
    const sender = ensureActionSender();
    const action: ClientAction = {
      type: "TriggerSet",
      player: args.playerId as string,
      target: {
        id: args.cardId as string,
        catalogId: args.catalogId as string,
      },
    };

    sender(action);

    return {
      content: [
        {
          type: "text",
          text: `Set trigger/intercept: ${args.cardId}`,
        },
      ],
    };
  },
};

/**
 * Attack with a unit
 */
export const attackTool: ToolDefinition = {
  name: "attack",
  description: "Attack with a unit",
  inputSchema: {
    type: "object",
    properties: {
      playerId: {
        type: "string",
        description: "Your player ID",
      },
      unitId: {
        type: "string",
        description: "The ID of the unit to attack with",
      },
    },
    required: ["playerId", "unitId"],
  },
  handler: async (args) => {
    const sender = ensureActionSender();
    const action: ClientAction = {
      type: "Attack",
      player: args.playerId as string,
      target: { id: args.unitId as string },
    };

    sender(action);

    return {
      content: [
        {
          type: "text",
          text: `Attacked with unit: ${args.unitId}`,
        },
      ],
    };
  },
};

/**
 * Use boot ability
 */
export const useBootAbilityTool: ToolDefinition = {
  name: "use_boot_ability",
  description: "Use a unit's boot (activated) ability",
  inputSchema: {
    type: "object",
    properties: {
      playerId: {
        type: "string",
        description: "Your player ID",
      },
      unitId: {
        type: "string",
        description: "The ID of the unit whose ability to use",
      },
    },
    required: ["playerId", "unitId"],
  },
  handler: async (args) => {
    const sender = ensureActionSender();
    const action: ClientAction = {
      type: "Boot",
      player: args.playerId as string,
      target: { id: args.unitId as string },
    };

    sender(action);

    return {
      content: [
        {
          type: "text",
          text: `Used boot ability of unit: ${args.unitId}`,
        },
      ],
    };
  },
};

/**
 * Withdraw a unit
 */
export const withdrawUnitTool: ToolDefinition = {
  name: "withdraw_unit",
  description: "Withdraw a unit from the field",
  inputSchema: {
    type: "object",
    properties: {
      playerId: {
        type: "string",
        description: "Your player ID",
      },
      unitId: {
        type: "string",
        description: "The ID of the unit to withdraw",
      },
    },
    required: ["playerId", "unitId"],
  },
  handler: async (args) => {
    const sender = ensureActionSender();
    const action: ClientAction = {
      type: "Withdrawal",
      player: args.playerId as string,
      target: { id: args.unitId as string },
    };

    sender(action);

    return {
      content: [
        {
          type: "text",
          text: `Withdrew unit: ${args.unitId}`,
        },
      ],
    };
  },
};

/**
 * Respond to a choice prompt
 */
export const respondToChoiceTool: ToolDefinition = {
  name: "respond_to_choice",
  description:
    "Respond to a choice prompt (block, intercept, card selection, etc.)",
  inputSchema: {
    type: "object",
    properties: {
      promptId: {
        type: "string",
        description: "The prompt ID from the choice message",
      },
      choiceIds: {
        type: "array",
        description:
          "Array of selected IDs, or null/empty to decline/cancel the choice",
        items: {
          type: "string",
        },
      },
    },
    required: ["promptId"],
  },
  handler: async (args) => {
    const sender = ensureActionSender();
    const choiceIds = (args.choiceIds as string[]) || [];
    const action: ClientAction = {
      type: "Choose",
      promptId: args.promptId as string,
      choice: choiceIds.length > 0 ? choiceIds : undefined,
    };

    sender(action);

    return {
      content: [
        {
          type: "text",
          text: choiceIds.length > 0
            ? `Responded to choice with: ${choiceIds.join(", ")}`
            : "Declined/cancelled choice",
        },
      ],
    };
  },
};

/**
 * End turn
 */
export const endTurnTool: ToolDefinition = {
  name: "end_turn",
  description: "End your turn",
  inputSchema: {
    type: "object",
    properties: {
      promptId: {
        type: "string",
        description: "The prompt ID from the continue message",
      },
      playerId: {
        type: "string",
        description: "Your player ID",
      },
    },
    required: ["promptId", "playerId"],
  },
  handler: async (args) => {
    const sender = ensureActionSender();
    const action: ClientAction = {
      type: "Continue",
      promptId: args.promptId as string,
      player: args.playerId as string,
    };

    sender(action);

    return {
      content: [
        {
          type: "text",
          text: "Ended turn",
        },
      ],
    };
  },
};

/**
 * Mulligan decision
 */
export const mulliganTool: ToolDefinition = {
  name: "mulligan",
  description: "Decide whether to keep or redraw your starting hand",
  inputSchema: {
    type: "object",
    properties: {
      playerId: {
        type: "string",
        description: "Your player ID",
      },
      keep: {
        type: "boolean",
        description: "true to keep the hand, false to redraw",
      },
    },
    required: ["playerId", "keep"],
  },
  handler: async (args) => {
    const sender = ensureActionSender();
    const action: ClientAction = {
      type: "Mulligan",
      action: (args.keep as boolean) ? "done" : "retry",
      player: args.playerId as string,
    };

    sender(action);

    return {
      content: [
        {
          type: "text",
          text: (args.keep as boolean) ? "Kept hand" : "Redrawing hand",
        },
      ],
    };
  },
};

export const actionTools = [
  summonUnitTool,
  evolveUnitTool,
  useJokerTool,
  setTriggerTool,
  attackTool,
  useBootAbilityTool,
  withdrawUnitTool,
  respondToChoiceTool,
  endTurnTool,
  mulliganTool,
];
