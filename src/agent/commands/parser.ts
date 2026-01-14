/**
 * Command parser for buddy mode
 */

import type { DecisionContext, ParsedAction } from "../../types/agent.ts";
import type { TuiController } from "../buddy-tui.tsx";
import { hasCardInfo } from "../utils/type-guards.ts";

/**
 * Parse user command and return action
 */
export function parseCommand(
  input: string,
  context: DecisionContext,
  tui: TuiController
): ParsedAction | null {
  const parts = input.toLowerCase().split(/\s+/);
  const command = parts[0];
  const args = parts.slice(1);
  const { myPlayerId, choice, gameState } = context;

  switch (command) {
    case "summon": {
      if (args.length < 1) {
        tui.addMessage("error", "Usage: summon <card_id>");
        return null;
      }
      const summonCardId = args[0];
      if (summonCardId === undefined) {
        tui.addMessage("error", "Usage: summon <card_id>");
        return null;
      }
      return {
        type: "UnitDrive",
        payload: {
          type: "UnitDrive",
          player: myPlayerId,
          target: { id: summonCardId },
        },
      };
    }

    case "attack": {
      if (args.length < 1) {
        tui.addMessage("error", "Usage: attack <unit_id>");
        return null;
      }
      const unitId = args[0];
      if (unitId === undefined) {
        tui.addMessage("error", "Usage: attack <unit_id>");
        return null;
      }
      const myPlayer = gameState.players[myPlayerId];
      const unit = myPlayer?.field.find((u) => u.id === unitId);
      if (!unit) {
        tui.addMessage("error", `Unit not found: ${unitId}`);
        return null;
      }
      return {
        type: "Attack",
        payload: {
          type: "Attack",
          player: myPlayerId,
          target: { id: unit.id },
        },
      };
    }

    case "set": {
      if (args.length < 1) {
        tui.addMessage("error", "Usage: set <card_id>");
        return null;
      }
      const cardId = args[0];
      if (cardId === undefined) {
        tui.addMessage("error", "Usage: set <card_id>");
        return null;
      }
      const myPlayerForSet = gameState.players[myPlayerId];
      const card = myPlayerForSet?.hand.find((a) => a.id === cardId);
      if (!card || !hasCardInfo(card)) {
        tui.addMessage("error", `Card not found: ${cardId}`);
        return null;
      }
      return {
        type: "TriggerSet",
        payload: {
          type: "TriggerSet",
          player: myPlayerId,
          target: { id: card.id, catalogId: card.catalogId },
        },
      };
    }

    case "boot": {
      if (args.length < 1) {
        tui.addMessage("error", "Usage: boot <unit_id>");
        return null;
      }
      const bootUnitId = args[0];
      if (bootUnitId === undefined) {
        tui.addMessage("error", "Usage: boot <unit_id>");
        return null;
      }
      const myPlayerForBoot = gameState.players[myPlayerId];
      const bootUnit = myPlayerForBoot?.field.find((u) => u.id === bootUnitId);
      if (!bootUnit) {
        tui.addMessage("error", `Unit not found: ${bootUnitId}`);
        return null;
      }
      return {
        type: "Boot",
        payload: {
          type: "Boot",
          player: myPlayerId,
          target: { id: bootUnit.id },
        },
      };
    }

    case "withdraw": {
      if (args.length < 1) {
        tui.addMessage("error", "Usage: withdraw <unit_id>");
        return null;
      }
      const withdrawUnitId = args[0];
      if (withdrawUnitId === undefined) {
        tui.addMessage("error", "Usage: withdraw <unit_id>");
        return null;
      }
      const myPlayerForWithdraw = gameState.players[myPlayerId];
      const withdrawUnit = myPlayerForWithdraw?.field.find((u) => u.id === withdrawUnitId);
      if (!withdrawUnit) {
        tui.addMessage("error", `Unit not found: ${withdrawUnitId}`);
        return null;
      }
      return {
        type: "Withdrawal",
        payload: {
          type: "Withdrawal",
          player: myPlayerId,
          target: { id: withdrawUnit.id },
        },
      };
    }

    case "override": {
      if (args.length < 2) {
        tui.addMessage("error", "Usage: override <source_card_id> <target_card_id>");
        return null;
      }
      const srcId = args[0];
      const tgtId = args[1];
      if (srcId === undefined || tgtId === undefined) {
        tui.addMessage("error", "Usage: override <source_card_id> <target_card_id>");
        return null;
      }
      return {
        type: "Override",
        payload: {
          type: "Override",
          player: myPlayerId,
          target: { id: srcId },
          parent: { id: tgtId },
        },
      };
    }

    case "joker": {
      if (args.length < 1) {
        tui.addMessage("error", "Usage: joker <joker_id>");
        return null;
      }
      const jokerId = args[0];
      if (jokerId === undefined) {
        tui.addMessage("error", "Usage: joker <joker_id>");
        return null;
      }
      return {
        type: "JokerDrive",
        payload: {
          type: "JokerDrive",
          player: myPlayerId,
          target: { id: jokerId },
        },
      };
    }

    case "end": {
      return {
        type: "TurnEnd",
        payload: {
          type: "TurnEnd",
        },
      };
    }

    case "choose": {
      if (!choice) {
        tui.addMessage("error", "No choice prompt active");
        return null;
      }
      const selectedIds: string[] = args.filter((arg): arg is string => typeof arg === "string");
      return {
        type: "Choose",
        payload: {
          type: "Choose",
          promptId: choice.promptId,
          choice: selectedIds.length > 0 ? selectedIds : undefined,
        },
      };
    }

    case "decline": {
      if (!choice) {
        tui.addMessage("error", "No choice prompt active");
        return null;
      }
      return {
        type: "Choose",
        payload: {
          type: "Choose",
          promptId: choice.promptId,
          choice: undefined,
        },
      };
    }

    case "state":
    case "help":
      return null; // These are handled separately

    default:
      return null;
  }
}
