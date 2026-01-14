/**
 * Prompt templates and builders for Claude agent
 */

import type { DecisionContext } from "../types/agent.ts";
import type { IPlayer, ICard, ChoicesMessage } from "../types/game.ts";
import { type CatalogCard, isJokerCard } from "../schemas/catalog.ts";
import type { IAtom } from "../../suit/types/game/card/index.ts";
import { join } from "node:path";
import { readdirSync } from "node:fs";
import { encode } from "@toon-format/toon";
import { hasCardInfo } from "./utils/type-guards.ts";
import { COLOR_NAMES } from "./utils/formatters.ts";

/**
 * Directory containing documentation files for the system prompt
 */
const DOCS_DIR = join(import.meta.dir, "../data/docs");

/**
 * Load all documentation files from data/docs directory
 */
export async function loadSystemPromptDocs(): Promise<string> {
  const files = readdirSync(DOCS_DIR).filter((f) => f.endsWith(".md"));

  const contents: string[] = [];
  for (const file of files) {
    const filePath = join(DOCS_DIR, file);
    const content = await Bun.file(filePath).text();
    contents.push(content);
  }

  return contents.join("\n\n---\n\n");
}

/**
 * Build the complete system prompt by loading documentation
 */
export async function buildSystemPrompt(): Promise<string> {
  const docs = await loadSystemPromptDocs();

  return `You are an AI agent playing CODE OF JOKER, a Japanese digital card game.

${docs}

## Response Format

You MUST respond with a valid JSON object in the following format:
\`\`\`json
{
  "reasoning": "Brief explanation of your decision (1-2 sentences)",
  "action": {
    "type": "<action_type>",
    ...action_parameters
  }
}
\`\`\`
`;
}

/**
 * Structured card data for TOON encoding
 */
interface CardData {
  id: string;
  name: string;
  cost: number | string;
  color: string;
  bp?: string;
  ability?: string;
}

/**
 * Structured unit data for TOON encoding
 */
interface UnitData {
  id: string;
  name: string;
  bp: number;
  status: string;
  canBoot?: boolean;
}

/**
 * Convert card to structured data for TOON encoding
 */
function cardToData(card: ICard, catalogInfo?: CatalogCard): CardData {
  if (catalogInfo && isJokerCard(catalogInfo)) {
    return {
      id: card.id,
      name: catalogInfo.name,
      cost: catalogInfo.cost,
      color: "JOKER",
      ability: catalogInfo.ability || undefined,
    };
  }
  return {
    id: card.id,
    name: catalogInfo?.name ?? `Card#${card.catalogId}`,
    cost: catalogInfo?.cost ?? "?",
    color: COLOR_NAMES[catalogInfo?.color ?? 6] ?? "Unknown",
    bp: catalogInfo?.bp ? catalogInfo.bp.join("/") : undefined,
    ability: catalogInfo?.ability || undefined,
  };
}

/**
 * Convert unit to structured data for TOON encoding
 */
function unitToData(unit: IPlayer["field"][number], catalogInfo?: CatalogCard): UnitData {
  return {
    id: unit.id,
    name: catalogInfo?.name ?? `Unit#${unit.catalogId}`,
    bp: unit.bp,
    status: unit.active ? "Active" : "Exhausted",
    canBoot: unit.hasBootAbility && !unit.isBooted ? true : undefined,
  };
}

/**
 * Format player state for the prompt using TOON format for arrays
 */
function formatPlayerState(
  player: IPlayer,
  isMyPlayer: boolean,
  catalogLookup: (id: string) => CatalogCard | undefined
): string {
  const label = isMyPlayer ? "YOUR" : "OPPONENT'S";
  const lines: string[] = [`## ${label} STATE`];

  const resources = {
    life: `${player.life.current}/${player.life.max}`,
    cp: `${player.cp.current}/${player.cp.max}`,
    triggers: player.trigger.length,
    jokerGauge: player.joker.gauge,
  };
  lines.push(encode(resources));

  if (isMyPlayer && player.hand.length > 0) {
    lines.push(`### Hand (${player.hand.length} cards)`);
    const handData = player.hand
      .filter((atom): atom is ICard => hasCardInfo(atom))
      .map((card) => cardToData(card, catalogLookup(card.catalogId)));
    lines.push(encode({ cards: handData }));
  } else {
    lines.push(`### Hand: ${player.hand.length} cards`);
  }

  if (player.field.length > 0) {
    lines.push(`### Field (${player.field.length} units)`);
    const fieldData = player.field.map((unit) => unitToData(unit, catalogLookup(unit.catalogId)));
    lines.push(encode({ units: fieldData }));
  } else {
    lines.push(`### Field: Empty`);
  }

  if (player.joker.card.length > 0) {
    const jokerData = player.joker.card.map((j) => ({ chara: j.chara, cost: j.cost }));
    lines.push(`### JOKER`);
    lines.push(encode({ jokers: jokerData }));
  }

  return lines.join("\n");
}

/**
 * Format game state section of the prompt
 */
export function formatGameStatePrompt(
  context: DecisionContext,
  catalogLookup: (id: string) => CatalogCard | undefined
): string {
  const { gameState, myPlayerId } = context;
  const lines: string[] = [];

  lines.push(`# GAME STATE`);
  lines.push(`Round: ${gameState.game.round}, Turn: ${gameState.game.turn}`);
  lines.push("");

  const myPlayer = gameState.players[myPlayerId];
  if (myPlayer) {
    lines.push(formatPlayerState(myPlayer, true, catalogLookup));
    lines.push("");
  }

  const opponentId = Object.keys(gameState.players).find((id) => id !== myPlayerId);
  if (opponentId) {
    const opponent = gameState.players[opponentId];
    if (opponent) {
      lines.push(formatPlayerState(opponent, false, catalogLookup));
    }
  }

  return lines.join("\n");
}

/**
 * Format choice prompt section using TOON format
 */
export function formatChoicePrompt(choice: ChoicesMessage): string {
  const lines: string[] = [];

  lines.push(`# CURRENT CHOICE`);

  const choiceMeta = {
    title: choice.choices.title,
    type: choice.choices.type,
    promptId: choice.promptId,
    cancelable: choice.choices.isCancelable ?? false,
    selectCount: choice.choices.count,
  };
  lines.push(encode(choiceMeta));

  lines.push("");
  lines.push("## Available options");

  const items = choice.choices.items.map((item) => {
    if ("bp" in item) {
      return { id: item.id, catalogId: item.catalogId, bp: item.bp };
    } else if ("catalogId" in item) {
      return { id: item.id, catalogId: item.catalogId };
    } else if ("name" in item) {
      return { id: item.id, name: item.name };
    }
    return { id: "unknown" };
  });
  lines.push(encode({ options: items }));

  return lines.join("\n");
}

/**
 * Format available actions for the turn using TOON format
 */
export function formatAvailableActionsPrompt(
  context: DecisionContext,
  catalogLookup: (id: string) => CatalogCard | undefined
): string {
  const { gameState, choice, myPlayerId } = context;
  const lines: string[] = [];

  lines.push(`# AVAILABLE ACTIONS`);

  if (choice) {
    lines.push("");
    lines.push(`## respond_to_choice`);
    lines.push(`Respond to the current choice prompt.`);

    const params = {
      promptId: choice.promptId,
      choiceIds:
        choice.choices.type === "card" || choice.choices.type === "unit"
          ? "Array of selected item IDs (or empty to decline)"
          : choice.choices.type === "option"
            ? "Array with single option ID"
            : choice.choices.type === "block"
              ? "Array of unit IDs to block with (or empty to not block)"
              : "Array of IDs",
    };
    lines.push(encode(params));
    return lines.join("\n");
  }

  const myPlayer = gameState.players[myPlayerId];
  if (!myPlayer) {
    lines.push("No player state available");
    return lines.join("\n");
  }

  const playableUnits = myPlayer.hand.filter((atom): atom is ICard => {
    if (!hasCardInfo(atom)) return false;
    const info = catalogLookup(atom.catalogId);
    return info !== undefined && info.type === "unit" && info.cost <= myPlayer.cp.current;
  });

  if (playableUnits.length > 0) {
    lines.push("");
    lines.push(`## summon_unit`);
    lines.push(`Play a unit card from hand to field.`);
    const units = playableUnits
      .map((card) => {
        const info = catalogLookup(card.catalogId);
        return info ? { id: card.id, name: info.name, cost: info.cost } : null;
      })
      .filter((u): u is { id: string; name: string; cost: number } => u !== null);
    lines.push(encode({ playable: units }));
  }

  const attackableUnits = myPlayer.field.filter((unit) => unit.active);
  if (attackableUnits.length > 0) {
    lines.push("");
    lines.push(`## attack`);
    lines.push(`Attack with an active unit.`);
    const units = attackableUnits.map((unit) => {
      const info = catalogLookup(unit.catalogId);
      return { id: unit.id, name: info?.name ?? unit.catalogId, bp: unit.bp };
    });
    lines.push(encode({ attackable: units }));
  }

  const triggerCards = myPlayer.hand.filter((atom): atom is ICard => {
    if (!hasCardInfo(atom)) return false;
    const info = catalogLookup(atom.catalogId);
    return info !== undefined && (info.type === "trigger" || info.type === "intercept") && info.cost <= myPlayer.cp.current;
  });

  if (triggerCards.length > 0) {
    lines.push("");
    lines.push(`## set_trigger`);
    lines.push(`Set a trigger/intercept card face-down.`);
    const triggers = triggerCards
      .map((card) => {
        const info = catalogLookup(card.catalogId);
        return info ? { id: card.id, name: info.name, cost: info.cost } : null;
      })
      .filter((t): t is { id: string; name: string; cost: number } => t !== null);
    lines.push(encode({ settable: triggers }));
  }

  lines.push("");
  lines.push(`## end_turn`);
  lines.push(`End your turn and pass to opponent.`);

  return lines.join("\n");
}

/**
 * Build the complete user prompt for a decision
 */
export function buildDecisionPrompt(
  context: DecisionContext,
  catalogLookup: (id: string) => CatalogCard | undefined
): string {
  const parts: string[] = [];

  parts.push(formatGameStatePrompt(context, catalogLookup));
  parts.push("");

  if (context.choice) {
    parts.push(formatChoicePrompt(context.choice));
    parts.push("");
  }

  parts.push(formatAvailableActionsPrompt(context, catalogLookup));
  parts.push("");

  parts.push("What action do you take? Respond with JSON only.");

  return parts.join("\n");
}

/**
 * Build mulligan decision prompt using TOON format
 */
export function buildMulliganPrompt(
  hand: IAtom[],
  playerId: string,
  catalogLookup: (id: string) => CatalogCard | undefined
): string {
  const lines: string[] = [];

  lines.push("# MULLIGAN DECISION");
  lines.push("");
  lines.push("## Starting hand");

  const handData = hand
    .filter((atom): atom is ICard => hasCardInfo(atom))
    .map((card) => cardToData(card, catalogLookup(card.catalogId)));
  lines.push(encode({ cards: handData }));

  lines.push("");
  lines.push("Should you keep this hand or redraw?");
  lines.push("");
  lines.push("Respond with JSON:");
  lines.push("```json");
  lines.push("{");
  lines.push('  "reasoning": "Why you chose to keep or redraw",');
  lines.push('  "action": {');
  lines.push('    "type": "Mulligan",');
  lines.push(`    "player": "${playerId}",`);
  lines.push('    "action": "done" // or "retry" to redraw');
  lines.push("  }");
  lines.push("}");
  lines.push("```");

  return lines.join("\n");
}
