/**
 * Buddy Mode Agent - Interactive agent that takes commands from the user
 * With optional AI advisor for evaluation and advice
 */

import * as readline from "node:readline";
import type { Agent, DecisionContext, ParsedAction } from "../types/agent.ts";
import type { IAtom } from "../../suit/types/game/card/index.ts";
import type { CatalogCard } from "../schemas/catalog.ts";
import type { ICard, ChoicesMessage } from "../types/game.ts";
import { AIAdvisor, type AdvisorConfig, type LearningRecord } from "./advisor.ts";

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
 * BuddyAgent configuration
 */
export interface BuddyAgentConfig {
  /** AI advisor configuration (optional) */
  advisor?: AdvisorConfig;
  /** Enable automatic evaluation of user moves */
  autoEvaluate?: boolean;
  /** Path to save/load learning records */
  learningRecordsPath?: string;
}

/**
 * BuddyAgent - Allows user to control the agent via command line
 * With optional AI advisor for evaluation and advice
 */
export class BuddyAgent implements Agent {
  private catalogLookup: (id: string) => CatalogCard | undefined;
  private rl: readline.Interface | null = null;
  private advisor: AIAdvisor | null = null;
  private autoEvaluate: boolean;
  private learningRecordsPath: string | null;
  private lastContext: DecisionContext | null = null;

  constructor(
    private name: string,
    catalogLookup: (id: string) => CatalogCard | undefined,
    config?: BuddyAgentConfig
  ) {
    this.catalogLookup = catalogLookup;
    this.autoEvaluate = config?.autoEvaluate ?? false;
    this.learningRecordsPath = config?.learningRecordsPath ?? null;

    // Initialize AI advisor if API key provided
    if (config?.advisor) {
      this.advisor = new AIAdvisor(config.advisor, catalogLookup);
      console.log("[BuddyAgent] AIアドバイザーを有効化しました");

      // Load existing learning records
      if (this.learningRecordsPath) {
        this.loadLearningRecords();
      }
    }
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

    console.log("");
    console.log("  state                 - Redisplay game state");
    console.log("  help                  - Show this help");

    // AI advisor commands
    if (this.advisor) {
      console.log("");
      console.log("--- AI ADVISOR COMMANDS ---");
      console.log("  /think                - AI analyzes current situation");
      console.log("  /advice <action>      - Get advice for specific action");
      console.log("  /records              - Show learning records summary");
      console.log("  /save                 - Save learning records");
    }

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
   * Handle AI advisor commands
   * Returns true if command was handled
   */
  private async handleAdvisorCommand(input: string, context: DecisionContext): Promise<boolean> {
    if (!this.advisor) {
      return false;
    }

    const parts = input.split(/\s+/);
    const command = parts[0]?.toLowerCase();

    switch (command) {
      case "/think": {
        console.log("\n[AI] 状況を分析中...\n");
        try {
          const analysis = await this.advisor.think(context);
          console.log("--- AI分析結果 ---");
          console.log(analysis);
          console.log("-".repeat(30));
        } catch (error) {
          console.error("[AI] 分析エラー:", error);
        }
        return true;
      }

      case "/advice": {
        const actionType = parts.slice(1).join(" ");
        if (!actionType) {
          console.log("Usage: /advice <action_type>");
          console.log("Example: /advice summon, /advice attack, /advice end");
          return true;
        }
        console.log(`\n[AI] 「${actionType}」についてアドバイス中...\n`);
        try {
          const advice = await this.advisor.getAdviceFor(context, actionType);
          console.log("--- AIアドバイス ---");
          console.log(advice);
          console.log("-".repeat(30));
        } catch (error) {
          console.error("[AI] アドバイスエラー:", error);
        }
        return true;
      }

      case "/records": {
        const records = this.advisor.getLearningRecords();
        console.log("\n--- 学習記録サマリー ---");
        console.log(`総記録数: ${records.length}`);

        if (records.length > 0) {
          const goodMoves = records.filter((r) => r.score > 0).length;
          const badMoves = records.filter((r) => r.score < 0).length;
          console.log(`好手: ${goodMoves}, 悪手: ${badMoves}, 普通: ${records.length - goodMoves - badMoves}`);

          console.log("\n最近の記録:");
          const recentRecords = records.slice(-5);
          for (const record of recentRecords) {
            const scoreIcon = record.score > 0 ? "◎" : record.score < 0 ? "×" : "○";
            console.log(`  ${scoreIcon} ${record.situation} - ${record.userAction}`);
            console.log(`    → ${record.reasoning}`);
          }
        }
        console.log("-".repeat(30));
        return true;
      }

      case "/save": {
        await this.saveLearningRecords();
        return true;
      }

      default:
        return false;
    }
  }

  /**
   * Main decision loop - display state and wait for user command
   */
  async decideAction(context: DecisionContext): Promise<ParsedAction> {
    // Store context for evaluation
    this.lastContext = context;

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

      // Handle AI advisor commands
      if (input.startsWith("/")) {
        const handled = await this.handleAdvisorCommand(input, context);
        if (handled) {
          continue;
        }
      }

      const action = this.parseCommand(input, context);
      if (action) {
        // Evaluate the action if auto-evaluate is enabled
        if (this.autoEvaluate && this.advisor) {
          this.evaluateUserAction(context, action).catch((err) => {
            console.error("[AI] 評価エラー:", err);
          });
        }
        return action;
      }
    }
  }

  /**
   * Evaluate user's action asynchronously
   */
  private async evaluateUserAction(context: DecisionContext, action: ParsedAction): Promise<void> {
    if (!this.advisor) return;

    const actionDescription = this.describeAction(action, context);
    const result = await this.advisor.evaluateAndRecord(context, action.type, actionDescription);

    if (result.recorded) {
      console.log(`\n[AI評価] ${result.evaluation} (記録済み)`);
    }
  }

  /**
   * Type guard for payload with target ID
   */
  private hasTargetWithId(payload: unknown): payload is { target: { id: string } } {
    if (typeof payload !== "object" || payload === null) {
      return false;
    }
    if (!("target" in payload)) {
      return false;
    }
    const target: unknown = payload.target;
    if (typeof target !== "object" || target === null) {
      return false;
    }
    if (!("id" in target)) {
      return false;
    }
    return typeof target.id === "string";
  }

  /**
   * Describe an action in human-readable form
   */
  private describeAction(action: ParsedAction, context: DecisionContext): string {
    const payload = action.payload;

    switch (action.type) {
      case "UnitDrive": {
        if (this.hasTargetWithId(payload)) {
          const myPlayer = context.gameState.players[context.myPlayerId];
          const card = myPlayer?.hand.find((c) => c.id === payload.target.id);
          if (card && hasCardInfo(card)) {
            const info = this.catalogLookup(card.catalogId);
            return `${info?.name ?? card.catalogId}を召喚`;
          }
        }
        return "ユニット召喚";
      }

      case "Attack": {
        if (this.hasTargetWithId(payload)) {
          const myPlayer = context.gameState.players[context.myPlayerId];
          const unit = myPlayer?.field.find((u) => u.id === payload.target.id);
          if (unit) {
            const info = this.catalogLookup(unit.catalogId);
            return `${info?.name ?? unit.catalogId}(BP${unit.bp})でアタック`;
          }
        }
        return "アタック";
      }

      case "TriggerSet":
        return "トリガーセット";

      case "Continue":
        return "ターン終了";

      case "Choose":
        return "選択肢を選択";

      default:
        return action.type;
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
   * Type guard for LearningRecord
   */
  private isLearningRecord(value: unknown): value is LearningRecord {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    return (
      "timestamp" in value &&
      "gameRound" in value &&
      "gameTurn" in value &&
      "situation" in value &&
      "userAction" in value &&
      "evaluation" in value &&
      "score" in value &&
      "reasoning" in value &&
      typeof value.timestamp === "number" &&
      typeof value.gameRound === "number" &&
      typeof value.gameTurn === "number" &&
      typeof value.situation === "string" &&
      typeof value.userAction === "string" &&
      typeof value.evaluation === "string" &&
      typeof value.score === "number" &&
      typeof value.reasoning === "string"
    );
  }

  /**
   * Load learning records from file
   */
  private loadLearningRecords(): void {
    if (!this.learningRecordsPath || !this.advisor) return;

    try {
      const file = Bun.file(this.learningRecordsPath);
      if (file.size > 0) {
        file.text().then((text) => {
          const parsed: unknown = JSON.parse(text);
          if (Array.isArray(parsed)) {
            const validRecords = parsed.filter((item): item is LearningRecord => this.isLearningRecord(item));
            if (validRecords.length > 0) {
              this.advisor?.loadRecords(validRecords);
            }
          }
        }).catch(() => {
          // File doesn't exist or is empty, start fresh
        });
      }
    } catch {
      // File doesn't exist, start fresh
    }
  }

  /**
   * Save learning records to file
   */
  private async saveLearningRecords(): Promise<void> {
    if (!this.learningRecordsPath || !this.advisor) {
      console.log("[BuddyAgent] 保存パスが設定されていません");
      return;
    }

    try {
      const records = this.advisor.getLearningRecords();
      await Bun.write(this.learningRecordsPath, JSON.stringify(records, null, 2));
      console.log(`[BuddyAgent] 学習記録を保存しました: ${this.learningRecordsPath}`);
    } catch (error) {
      console.error("[BuddyAgent] 保存エラー:", error);
    }
  }

  /**
   * Get AI advisor (for external access)
   */
  getAdvisor(): AIAdvisor | null {
    return this.advisor;
  }

  /**
   * Cleanup readline interface and save records
   */
  clearHistory(): void {
    // Save learning records before cleanup
    if (this.advisor && this.learningRecordsPath) {
      this.saveLearningRecords().catch((err) => {
        console.error("[BuddyAgent] 終了時の保存エラー:", err);
      });
    }

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }
}
