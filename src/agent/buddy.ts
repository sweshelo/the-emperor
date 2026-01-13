/**
 * Buddy Mode Agent - Interactive agent that takes commands from the user
 */

import * as readline from "node:readline";
import type { Agent, DecisionContext, ParsedAction } from "../types/agent.ts";
import type { IAtom } from "../../suit/types/game/card/index.ts";
import type { CatalogCard } from "../schemas/catalog.ts";
import type { ICard, ChoicesMessage } from "../types/game.ts";

/**
 * Type guard to check if an IAtom has catalogId (is actually an ICard)
 */
function hasCardInfo(atom: IAtom): atom is ICard {
  return "catalogId" in atom && "lv" in atom;
}

/**
 * Type guard for choice item with catalogId
 */
interface ItemWithCatalogId {
  id: string;
  catalogId: string;
}

interface ItemWithBp extends ItemWithCatalogId {
  bp: number;
}

interface ItemWithName {
  id: string;
  name: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isItemWithCatalogId(item: unknown): item is ItemWithCatalogId {
  if (!isRecord(item)) return false;
  return "id" in item && "catalogId" in item && typeof item.catalogId === "string";
}

function isItemWithBp(item: unknown): item is ItemWithBp {
  if (!isRecord(item)) return false;
  return isItemWithCatalogId(item) && "bp" in item && typeof item.bp === "number";
}

function isItemWithName(item: unknown): item is ItemWithName {
  if (!isRecord(item)) return false;
  return "id" in item && "name" in item && typeof item.name === "string";
}

/**
 * Color names for display
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
 * BuddyAgent - Allows user to control the agent via command line
 */
export class BuddyAgent implements Agent {
  private catalogLookup: (id: string) => CatalogCard | undefined;
  private rl: readline.Interface | null = null;

  constructor(
    private name: string,
    catalogLookup: (id: string) => CatalogCard | undefined
  ) {
    this.catalogLookup = catalogLookup;
  }

  getName(): string {
    return this.name;
  }

  /**
   * Display game state in a readable format
   */
  private displayGameState(context: DecisionContext): void {
    const { gameState, myPlayerId } = context;
    const myPlayer = gameState.players[myPlayerId];
    const opponentId = Object.keys(gameState.players).find((id) => id !== myPlayerId);
    const opponent = opponentId ? gameState.players[opponentId] : null;

    console.log("\n" + "=".repeat(60));
    console.log(`  GAME STATE - Round ${gameState.game.round}, Turn ${gameState.game.turn}`);
    console.log("=".repeat(60));

    // Opponent state
    if (opponent) {
      console.log("\n--- OPPONENT ---");
      console.log(`  Life: ${opponent.life.current}/${opponent.life.max} | CP: ${opponent.cp.current}/${opponent.cp.max}`);
      console.log(`  Hand: ${opponent.hand.length} cards | Triggers: ${opponent.trigger.length}`);

      if (opponent.field.length > 0) {
        console.log("  Field:");
        for (const unit of opponent.field) {
          const info = this.catalogLookup(unit.catalogId);
          const status = unit.active ? "Active" : "Exhausted";
          console.log(`    [${unit.id}] ${info?.name ?? unit.catalogId} BP:${unit.bp} (${status})`);
        }
      } else {
        console.log("  Field: Empty");
      }
    }

    // My state
    if (myPlayer) {
      console.log("\n--- YOUR STATE ---");
      console.log(`  Life: ${myPlayer.life.current}/${myPlayer.life.max} | CP: ${myPlayer.cp.current}/${myPlayer.cp.max}`);

      if (myPlayer.hand.length > 0) {
        console.log("  Hand:");
        for (const atom of myPlayer.hand) {
          if (hasCardInfo(atom)) {
            const info = this.catalogLookup(atom.catalogId);
            const bp = info?.bp ? ` BP:${info.bp.join("/")}` : "";
            const color = COLOR_NAMES[info?.color ?? 6] ?? "?";
            console.log(`    [${atom.id}] ${info?.name ?? atom.catalogId} (Cost:${info?.cost ?? "?"}${bp}) [${color}]`);
          }
        }
      } else {
        console.log("  Hand: Empty");
      }

      if (myPlayer.field.length > 0) {
        console.log("  Field:");
        for (const unit of myPlayer.field) {
          const info = this.catalogLookup(unit.catalogId);
          const status = unit.active ? "Active" : "Exhausted";
          const boot = unit.hasBootAbility && !unit.isBooted ? " [Boot Available]" : "";
          console.log(`    [${unit.id}] ${info?.name ?? unit.catalogId} BP:${unit.bp} (${status})${boot}`);
        }
      } else {
        console.log("  Field: Empty");
      }

      if (myPlayer.trigger.length > 0) {
        console.log(`  Triggers set: ${myPlayer.trigger.length}`);
      }

      if (myPlayer.joker.card.length > 0) {
        const jokerInfo = myPlayer.joker.card.map((j) => `${j.chara}(${j.cost})`).join(", ");
        console.log(`  JOKER: ${jokerInfo} | Gauge: ${myPlayer.joker.gauge}%`);
      }
    }

    console.log("=".repeat(60));
  }

  /**
   * Display current choice options
   */
  private displayChoice(choice: ChoicesMessage): void {
    console.log("\n--- CHOICE REQUIRED ---");
    console.log(`  ${choice.choices.title}`);
    console.log(`  Type: ${choice.choices.type} | PromptID: ${choice.promptId}`);

    if (choice.choices.isCancelable) {
      console.log("  (Can be cancelled - enter empty to decline)");
    }

    if (choice.choices.count !== undefined) {
      console.log(`  Select up to ${choice.choices.count} item(s)`);
    }

    console.log("  Options:");
    for (const item of choice.choices.items) {
      if (isItemWithBp(item)) {
        // It's a unit
        const info = this.catalogLookup(item.catalogId);
        console.log(`    [${item.id}] ${info?.name ?? item.catalogId} BP:${item.bp}`);
      } else if (isItemWithCatalogId(item)) {
        // It's a card
        const info = this.catalogLookup(item.catalogId);
        console.log(`    [${item.id}] ${info?.name ?? item.catalogId}`);
      } else if (isItemWithName(item)) {
        // It's an option
        console.log(`    [${item.id}] ${item.name}`);
      }
    }
  }

  /**
   * Display available commands
   */
  private displayHelp(context: DecisionContext): void {
    console.log("\n--- AVAILABLE COMMANDS ---");

    if (context.choice) {
      console.log("  choose <id1> [id2] ... - Select option(s) from the choice");
      console.log("  decline               - Decline/cancel the choice (if cancelable)");
    } else {
      console.log("  summon <card_id>      - Summon a unit from hand");
      console.log("  attack <unit_id>      - Attack with a unit");
      console.log("  set <card_id>         - Set a trigger/intercept card");
      console.log("  boot <unit_id>        - Use unit's boot ability");
      console.log("  withdraw <unit_id>    - Withdraw a unit from field");
      console.log("  override <src> <tgt>  - Override card onto target");
      console.log("  joker <joker_id>      - Use JOKER ability");
      console.log("  end                   - End your turn");
    }

    console.log("  state                 - Redisplay game state");
    console.log("  help                  - Show this help");
    console.log("-".repeat(30));
  }

  /**
   * Read a line from stdin
   */
  private async readLine(prompt: string): Promise<string> {
    if (!this.rl) {
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
    }

    return new Promise((resolve) => {
      this.rl?.question(prompt, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * Parse user command and return action
   */
  private parseCommand(input: string, context: DecisionContext): ParsedAction | null {
    const parts = input.toLowerCase().split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);
    const { myPlayerId, choice } = context;

    switch (command) {
      case "summon": {
        if (args.length < 1) {
          console.log("Usage: summon <card_id>");
          return null;
        }
        const summonCardId = args[0];
        if (summonCardId === undefined) {
          console.log("Usage: summon <card_id>");
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
          console.log("Usage: attack <unit_id>");
          return null;
        }
        const unitId = args[0];
        if (unitId === undefined) {
          console.log("Usage: attack <unit_id>");
          return null;
        }
        const myPlayer = context.gameState.players[myPlayerId];
        const unit = myPlayer?.field.find((u) => u.id === unitId);
        if (!unit) {
          console.log(`Unit not found: ${unitId}`);
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
          console.log("Usage: set <card_id>");
          return null;
        }
        const cardId = args[0];
        if (cardId === undefined) {
          console.log("Usage: set <card_id>");
          return null;
        }
        const myPlayerForSet = context.gameState.players[myPlayerId];
        const card = myPlayerForSet?.hand.find((a) => a.id === cardId);
        if (!card || !hasCardInfo(card)) {
          console.log(`Card not found: ${cardId}`);
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
          console.log("Usage: boot <unit_id>");
          return null;
        }
        const bootUnitId = args[0];
        if (bootUnitId === undefined) {
          console.log("Usage: boot <unit_id>");
          return null;
        }
        const myPlayerForBoot = context.gameState.players[myPlayerId];
        const bootUnit = myPlayerForBoot?.field.find((u) => u.id === bootUnitId);
        if (!bootUnit) {
          console.log(`Unit not found: ${bootUnitId}`);
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
          console.log("Usage: withdraw <unit_id>");
          return null;
        }
        const withdrawUnitId = args[0];
        if (withdrawUnitId === undefined) {
          console.log("Usage: withdraw <unit_id>");
          return null;
        }
        const myPlayerForWithdraw = context.gameState.players[myPlayerId];
        const withdrawUnit = myPlayerForWithdraw?.field.find((u) => u.id === withdrawUnitId);
        if (!withdrawUnit) {
          console.log(`Unit not found: ${withdrawUnitId}`);
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
          console.log("Usage: override <source_card_id> <target_card_id>");
          return null;
        }
        const srcId = args[0];
        const tgtId = args[1];
        if (srcId === undefined || tgtId === undefined) {
          console.log("Usage: override <source_card_id> <target_card_id>");
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
          console.log("Usage: joker <joker_id>");
          return null;
        }
        const jokerId = args[0];
        if (jokerId === undefined) {
          console.log("Usage: joker <joker_id>");
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
        // End turn requires a choice prompt - this should be called in response to a choice
        // For now, we'll attempt to end turn by looking for an end turn choice
        if (choice) {
          return {
            type: "Continue",
            payload: {
              type: "Continue",
              promptId: choice.promptId,
              player: myPlayerId,
            },
          };
        }
        // If no choice is active, we cannot end turn via Continue
        console.log("Cannot end turn without an active prompt. Wait for your turn or use a different action.");
        return null;
      }

      case "choose": {
        if (!choice) {
          console.log("No choice prompt active");
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
          console.log("No choice prompt active");
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
        console.log(`Unknown command: ${command}`);
        console.log("Type 'help' for available commands");
        return null;
    }
  }

  /**
   * Main decision loop - display state and wait for user command
   */
  async decideAction(context: DecisionContext): Promise<ParsedAction> {
    // Display game state
    this.displayGameState(context);

    // Display choice if active
    if (context.choice) {
      this.displayChoice(context.choice);
    }

    // Display help
    this.displayHelp(context);

    // Read and parse commands until we get a valid action
    while (true) {
      const input = await this.readLine("\n> ");

      if (input === "state") {
        this.displayGameState(context);
        if (context.choice) {
          this.displayChoice(context.choice);
        }
        continue;
      }

      if (input === "help") {
        this.displayHelp(context);
        continue;
      }

      if (!input) {
        continue;
      }

      const action = this.parseCommand(input, context);
      if (action) {
        return action;
      }
    }
  }

  /**
   * Mulligan decision - ask user to keep or redraw
   */
  async decideMulligan(hand: IAtom[], playerId: string): Promise<ParsedAction> {
    console.log("\n" + "=".repeat(60));
    console.log("  MULLIGAN DECISION");
    console.log("=".repeat(60));
    console.log("\nYour starting hand:");

    for (const atom of hand) {
      if (hasCardInfo(atom)) {
        const info = this.catalogLookup(atom.catalogId);
        const bp = info?.bp ? ` BP:${info.bp.join("/")}` : "";
        const color = COLOR_NAMES[info?.color ?? 6] ?? "?";
        console.log(`  [${atom.id}] ${info?.name ?? atom.catalogId} (Cost:${info?.cost ?? "?"}${bp}) [${color}]`);
      }
    }

    console.log("\nCommands: 'keep' to keep this hand, 'redraw' to mulligan");

    while (true) {
      const input = await this.readLine("\n> ");
      const command = input.toLowerCase();

      if (command === "keep" || command === "done") {
        return {
          type: "Mulligan",
          payload: {
            type: "Mulligan",
            player: playerId,
            action: "done",
          },
        };
      }

      if (command === "redraw" || command === "retry") {
        return {
          type: "Mulligan",
          payload: {
            type: "Mulligan",
            player: playerId,
            action: "retry",
          },
        };
      }

      console.log("Please enter 'keep' or 'redraw'");
    }
  }

  /**
   * Cleanup readline interface
   */
  clearHistory(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }
}
