/**
 * Action building utilities for AI
 */

import type { DecisionContext, ParsedAction } from "../../types/agent.ts";
import type { CatalogCard } from "../../schemas/catalog.ts";
import { hasCardInfo } from "../utils/type-guards.ts";

/**
 * Build ParsedAction from action type and parameters
 */
export function buildParsedAction(
  actionType: string,
  parameters: Record<string, unknown>,
  context: DecisionContext
): ParsedAction | null {
  const playerId = context.myPlayerId;

  switch (actionType) {
    case "summon": {
      const cardId = typeof parameters.cardId === "string" ? parameters.cardId : null;
      if (!cardId) return null;
      return {
        type: "UnitDrive",
        payload: { type: "UnitDrive", player: playerId, target: { id: cardId } },
      };
    }

    case "attack": {
      const unitId = typeof parameters.unitId === "string" ? parameters.unitId : null;
      if (!unitId) return null;
      return {
        type: "Attack",
        payload: { type: "Attack", player: playerId, target: { id: unitId } },
      };
    }

    case "set_trigger": {
      const cardId = typeof parameters.cardId === "string" ? parameters.cardId : null;
      if (!cardId) return null;
      const myPlayer = context.gameState.players[playerId];
      const card = myPlayer?.hand.find((c) => c.id === cardId);
      if (!card || !hasCardInfo(card)) return null;
      return {
        type: "TriggerSet",
        payload: {
          type: "TriggerSet",
          player: playerId,
          target: { id: cardId, catalogId: card.catalogId },
        },
      };
    }

    case "boot": {
      const unitId = typeof parameters.unitId === "string" ? parameters.unitId : null;
      if (!unitId) return null;
      return {
        type: "Boot",
        payload: { type: "Boot", player: playerId, target: { id: unitId } },
      };
    }

    case "withdraw": {
      const unitId = typeof parameters.unitId === "string" ? parameters.unitId : null;
      if (!unitId) return null;
      return {
        type: "Withdrawal",
        payload: { type: "Withdrawal", player: playerId, target: { id: unitId } },
      };
    }

    case "joker": {
      const jokerId = typeof parameters.jokerId === "string" ? parameters.jokerId : null;
      if (!jokerId) return null;
      return {
        type: "JokerDrive",
        payload: { type: "JokerDrive", player: playerId, target: { id: jokerId } },
      };
    }

    case "end_turn": {
      return {
        type: "TurnEnd",
        payload: { type: "TurnEnd" },
      };
    }

    case "choose": {
      const choiceIds = Array.isArray(parameters.choiceIds)
        ? parameters.choiceIds.filter((id): id is string => typeof id === "string")
        : [];
      const promptId = context.choice?.promptId;
      if (!promptId) return null;
      return {
        type: "Choose",
        payload: {
          type: "Choose",
          promptId,
          choice: choiceIds.length > 0 ? choiceIds : undefined,
        },
      };
    }

    default:
      return null;
  }
}

/**
 * Describe an action for proposal display
 */
export function describeActionForProposal(
  actionType: string,
  parameters: Record<string, unknown>,
  context: DecisionContext,
  catalogLookup: (id: string) => CatalogCard | undefined
): string {
  const playerId = context.myPlayerId;
  const myPlayer = context.gameState.players[playerId];

  switch (actionType) {
    case "summon": {
      const cardId = typeof parameters.cardId === "string" ? parameters.cardId : null;
      if (cardId && myPlayer) {
        const card = myPlayer.hand.find((c) => c.id === cardId);
        if (card && hasCardInfo(card)) {
          const info = catalogLookup(card.catalogId);
          return `召喚: ${info?.name ?? card.catalogId}`;
        }
      }
      return "ユニット召喚";
    }

    case "attack": {
      const unitId = typeof parameters.unitId === "string" ? parameters.unitId : null;
      if (unitId && myPlayer) {
        const unit = myPlayer.field.find((u) => u.id === unitId);
        if (unit) {
          const info = catalogLookup(unit.catalogId);
          return `攻撃: ${info?.name ?? unit.catalogId} (BP:${unit.bp})`;
        }
      }
      return "攻撃";
    }

    case "set_trigger": {
      const cardId = typeof parameters.cardId === "string" ? parameters.cardId : null;
      if (cardId && myPlayer) {
        const card = myPlayer.hand.find((c) => c.id === cardId);
        if (card && hasCardInfo(card)) {
          const info = catalogLookup(card.catalogId);
          return `トリガーセット: ${info?.name ?? card.catalogId}`;
        }
      }
      return "トリガーセット";
    }

    case "boot": {
      const unitId = typeof parameters.unitId === "string" ? parameters.unitId : null;
      if (unitId && myPlayer) {
        const unit = myPlayer.field.find((u) => u.id === unitId);
        if (unit) {
          const info = catalogLookup(unit.catalogId);
          return `ブート能力使用: ${info?.name ?? unit.catalogId}`;
        }
      }
      return "ブート能力使用";
    }

    case "withdraw": {
      const unitId = typeof parameters.unitId === "string" ? parameters.unitId : null;
      if (unitId && myPlayer) {
        const unit = myPlayer.field.find((u) => u.id === unitId);
        if (unit) {
          const info = catalogLookup(unit.catalogId);
          return `撤退: ${info?.name ?? unit.catalogId}`;
        }
      }
      return "撤退";
    }

    case "joker":
      return "JOKER使用";

    case "end_turn":
      return "ターン終了";

    case "choose": {
      const choiceIds = Array.isArray(parameters.choiceIds) ? parameters.choiceIds : [];
      return `選択: ${choiceIds.length}個選択`;
    }

    default:
      return actionType;
  }
}
