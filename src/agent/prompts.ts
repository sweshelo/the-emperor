/**
 * Prompt templates and builders for Claude agent
 */

import type { DecisionContext } from "../types/agent.ts";
import type { IPlayer, IUnit, ICard, ChoicesMessage } from "../types/game.ts";
import type { CatalogCard } from "../schemas/catalog.ts";
import type { IAtom } from "../../suit/types/game/card/index.ts";
import { join } from "node:path";
import { readdirSync } from "node:fs";

/**
 * Type guard to check if an IAtom has catalogId (is actually an ICard)
 * Uses in operator for runtime property checking
 */
function hasCardInfo(atom: IAtom): atom is ICard {
  return "catalogId" in atom && "lv" in atom;
}

/**
 * Directory containing documentation files for the system prompt
 */
const DOCS_DIR = join(import.meta.dir, "../data/docs");

/**
 * Load all documentation files from data/docs directory
 * Returns concatenated content of all .md files
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
 * Color ID to name mapping
 */
const COLOR_NAMES: Record<number, string> = {
  1: "Red",
  2: "Yellow",
  3: "Blue",
  4: "Green",
  5: "Purple",
  6: "Colorless",
};

/**
 * Format a card for display in prompt
 */
function formatCard(card: ICard, catalogInfo?: CatalogCard): string {
  const name = catalogInfo?.name ?? `Card#${card.catalogId}`;
  const cost = catalogInfo?.cost ?? "?";
  const color = COLOR_NAMES[catalogInfo?.color ?? 6] ?? "Unknown";
  const ability = catalogInfo?.ability ?? "";
  const bp = catalogInfo?.bp ? `BP: ${catalogInfo.bp.join("/")}` : "";

  return `[${card.id}] ${name} (Cost: ${cost}, ${color}) ${bp} ${ability}`.trim();
}

/**
 * Format a unit for display in prompt
 */
function formatUnit(unit: IUnit, catalogInfo?: CatalogCard): string {
  const name = catalogInfo?.name ?? `Unit#${unit.catalogId}`;
  const currentBp = unit.bp;
  const active = unit.active ? "Active" : "Exhausted";
  const canBoot = unit.hasBootAbility && !unit.isBooted ? ", Can Boot" : "";

  return `[${unit.id}] ${name} (BP: ${currentBp}, ${active}${canBoot})`;
}

/**
 * Format player state for the prompt
 */
function formatPlayerState(
  player: IPlayer,
  isMyPlayer: boolean,
  catalogLookup: (id: string) => CatalogCard | undefined
): string {
  const label = isMyPlayer ? "YOUR" : "OPPONENT'S";
  const lines: string[] = [`## ${label} STATE`];

  // Resources
  lines.push(`- Life: ${player.life.current}/${player.life.max}`);
  lines.push(`- CP: ${player.cp.current}/${player.cp.max}`);

  // Hand (only show details for own hand)
  if (isMyPlayer && player.hand.length > 0) {
    lines.push(`- Hand (${player.hand.length} cards):`);
    for (const atom of player.hand) {
      if (hasCardInfo(atom)) {
        const info = catalogLookup(atom.catalogId);
        lines.push(`  ${formatCard(atom, info)}`);
      } else {
        lines.push(`  [${atom.id}] Unknown card`);
      }
    }
  } else {
    lines.push(`- Hand: ${player.hand.length} cards`);
  }

  // Field
  if (player.field.length > 0) {
    lines.push(`- Field (${player.field.length} units):`);
    for (const unit of player.field) {
      const info = catalogLookup(unit.catalogId);
      lines.push(`  ${formatUnit(unit, info)}`);
    }
  } else {
    lines.push(`- Field: Empty`);
  }

  // Triggers (only count for opponent)
  if (isMyPlayer && player.trigger.length > 0) {
    lines.push(`- Triggers set: ${player.trigger.length}`);
  } else if (player.trigger.length > 0) {
    lines.push(`- Triggers set: ${player.trigger.length}`);
  }

  // JOKER gauge
  if (player.joker.card.length > 0) {
    const jokerInfo = player.joker.card.map((j) => `${j.chara}: ${j.cost} gauge`).join(", ");
    lines.push(`- JOKER: ${jokerInfo} (Gauge: ${player.joker.gauge}%)`);
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

  // Game info
  lines.push(`# GAME STATE`);
  lines.push(`Round: ${gameState.game.round}, Turn: ${gameState.game.turn}`);
  lines.push("");

  // My state
  const myPlayer = gameState.players[myPlayerId];
  if (myPlayer) {
    lines.push(formatPlayerState(myPlayer, true, catalogLookup));
    lines.push("");
  }

  // Opponent state
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
 * Format choice prompt section
 */
export function formatChoicePrompt(choice: ChoicesMessage): string {
  const lines: string[] = [];

  lines.push(`# CURRENT CHOICE`);
  lines.push(`Title: ${choice.choices.title}`);
  lines.push(`Type: ${choice.choices.type}`);
  lines.push(`Prompt ID: ${choice.promptId}`);

  if (choice.choices.isCancelable) {
    lines.push(`(This choice can be cancelled/declined)`);
  }

  if (choice.choices.count !== undefined) {
    lines.push(`Select up to ${choice.choices.count} item(s)`);
  }

  lines.push("");
  lines.push("Available options:");

  for (const item of choice.choices.items) {
    if ("bp" in item) {
      // It's a unit
      const unit = item;
      lines.push(`- [${unit.id}] ${unit.catalogId} (BP: ${unit.bp})`);
    } else if ("catalogId" in item) {
      // It's a card
      const card = item;
      lines.push(`- [${card.id}] ${card.catalogId}`);
    } else if ("name" in item) {
      // It's an option
      lines.push(`- [${item.id}] ${item.name}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format available actions for the turn
 */
export function formatAvailableActionsPrompt(
  context: DecisionContext,
  catalogLookup: (id: string) => CatalogCard | undefined
): string {
  const { gameState, choice, myPlayerId } = context;
  const lines: string[] = [];

  lines.push(`# AVAILABLE ACTIONS`);

  // If there's a choice, the main action is to respond
  if (choice) {
    lines.push("");
    lines.push(`## respond_to_choice`);
    lines.push(`Respond to the current choice prompt.`);
    lines.push(`Parameters:`);
    lines.push(`- promptId: "${choice.promptId}"`);
    if (choice.choices.type === "card" || choice.choices.type === "unit") {
      lines.push(`- choiceIds: Array of selected item IDs (or empty to decline)`);
    } else if (choice.choices.type === "option") {
      lines.push(`- choiceIds: Array with single option ID`);
    } else if (choice.choices.type === "block") {
      lines.push(`- choiceIds: Array of unit IDs to block with (or empty to not block)`);
    }
    return lines.join("\n");
  }

  // Normal turn actions
  const myPlayer = gameState.players[myPlayerId];
  if (!myPlayer) {
    lines.push("No player state available");
    return lines.join("\n");
  }

  // Summon units from hand
  const playableUnits = myPlayer.hand.filter((atom): atom is ICard => {
    if (!hasCardInfo(atom)) return false;
    const info = catalogLookup(atom.catalogId);
    return info !== undefined && info.type === "unit" && info.cost <= myPlayer.cp.current;
  });

  if (playableUnits.length > 0) {
    lines.push("");
    lines.push(`## summon_unit`);
    lines.push(`Play a unit card from hand to field.`);
    lines.push(`Playable units:`);
    for (const card of playableUnits) {
      const info = catalogLookup(card.catalogId);
      if (info) {
        lines.push(`- [${card.id}] ${info.name} (Cost: ${info.cost})`);
      }
    }
  }

  // Attack with units
  const attackableUnits = myPlayer.field.filter((unit) => unit.active);
  if (attackableUnits.length > 0) {
    lines.push("");
    lines.push(`## attack`);
    lines.push(`Attack with an active unit.`);
    lines.push(`Units that can attack:`);
    for (const unit of attackableUnits) {
      const info = catalogLookup(unit.catalogId);
      lines.push(`- [${unit.id}] ${info?.name ?? unit.catalogId} (BP: ${unit.bp})`);
    }
  }

  // Set triggers
  const triggerCards = myPlayer.hand.filter((atom): atom is ICard => {
    if (!hasCardInfo(atom)) return false;
    const info = catalogLookup(atom.catalogId);
    return info !== undefined && (info.type === "trigger" || info.type === "intercept") && info.cost <= myPlayer.cp.current;
  });

  if (triggerCards.length > 0) {
    lines.push("");
    lines.push(`## set_trigger`);
    lines.push(`Set a trigger/intercept card face-down.`);
    lines.push(`Available:`);
    for (const card of triggerCards) {
      const info = catalogLookup(card.catalogId);
      if (info) {
        lines.push(`- [${card.id}] ${info.name} (Cost: ${info.cost})`);
      }
    }
  }

  // End turn is always available
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

  // Game state
  parts.push(formatGameStatePrompt(context, catalogLookup));
  parts.push("");

  // Current choice (if any)
  if (context.choice) {
    parts.push(formatChoicePrompt(context.choice));
    parts.push("");
  }

  // Available actions
  parts.push(formatAvailableActionsPrompt(context, catalogLookup));
  parts.push("");

  // Instruction
  parts.push("What action do you take? Respond with JSON only.");

  return parts.join("\n");
}

/**
 * Build mulligan decision prompt
 */
export function buildMulliganPrompt(
  hand: IAtom[],
  playerId: string,
  catalogLookup: (id: string) => CatalogCard | undefined
): string {
  const lines: string[] = [];

  lines.push("# MULLIGAN DECISION");
  lines.push("");
  lines.push("Your starting hand:");

  for (const atom of hand) {
    if (hasCardInfo(atom)) {
      const info = catalogLookup(atom.catalogId);
      lines.push(`- ${formatCard(atom, info)}`);
    } else {
      lines.push(`- [${atom.id}] Unknown card`);
    }
  }

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
