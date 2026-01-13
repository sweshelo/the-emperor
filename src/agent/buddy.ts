/**
 * Buddy Mode Agent - Interactive agent that takes commands from the user
 * With optional AI advisor for evaluation and advice
 */

import type { Agent, DecisionContext, ParsedAction } from "../types/agent.ts";
import type { IAtom } from "../../suit/types/game/card/index.ts";
import { type CatalogCard, isJokerCard } from "../schemas/catalog.ts";
import type { ICard, ChoicesMessage } from "../types/game.ts";
import { AIAdvisor, type AdvisorConfig, type LearningRecord } from "./advisor.ts";
import { TuiController } from "./buddy-tui.tsx";

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
 * Get display info from catalog card (handles both regular and JOKER cards)
 */
function getCardDisplayInfo(card: CatalogCard | undefined): { bp: string; color: string } {
  if (!card) {
    return { bp: "", color: "?" };
  }
  if (isJokerCard(card)) {
    return { bp: "", color: "JOKER" };
  }
  const bp = card.bp ? ` BP:${card.bp.join("/")}` : "";
  const color = COLOR_NAMES[card.color] ?? "?";
  return { bp, color };
}

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
  private tui: TuiController;
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

    // Initialize TUI
    this.tui = new TuiController();
    this.tui.start();

    // Initialize AI advisor if API key provided
    if (config?.advisor) {
      this.advisor = new AIAdvisor(config.advisor, catalogLookup);
      this.tui.addMessage("system", "AIアドバイザーを有効化しました");

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

    // Update game status in header
    this.tui.setGameStatus(`Round ${gameState.game.round}, Turn ${gameState.game.turn}`);

    this.tui.addMessage("game", "=".repeat(50));
    this.tui.addMessage("game", `GAME STATE - Round ${gameState.game.round}, Turn ${gameState.game.turn}`);

    // Opponent state
    if (opponent) {
      this.tui.addMessage("game", "--- OPPONENT ---");
      this.tui.addMessage("game", `Life: ${opponent.life.current}/${opponent.life.max} | CP: ${opponent.cp.current}/${opponent.cp.max}`);
      this.tui.addMessage("game", `Hand: ${opponent.hand.length} cards | Triggers: ${opponent.trigger.length}`);

      if (opponent.field.length > 0) {
        this.tui.addMessage("game", "Field:");
        for (const unit of opponent.field) {
          const info = this.catalogLookup(unit.catalogId);
          const status = unit.active ? "Active" : "Exhausted";
          this.tui.addMessage("game", `  [${unit.id}] ${info?.name ?? unit.catalogId} BP:${unit.bp} (${status})`);
        }
      } else {
        this.tui.addMessage("game", "Field: Empty");
      }
    }

    // My state
    if (myPlayer) {
      this.tui.addMessage("game", "--- YOUR STATE ---");
      this.tui.addMessage("game", `Life: ${myPlayer.life.current}/${myPlayer.life.max} | CP: ${myPlayer.cp.current}/${myPlayer.cp.max}`);

      if (myPlayer.hand.length > 0) {
        this.tui.addMessage("game", "Hand:");
        for (const atom of myPlayer.hand) {
          if (hasCardInfo(atom)) {
            const info = this.catalogLookup(atom.catalogId);
            const { bp, color } = getCardDisplayInfo(info);
            this.tui.addMessage("game", `  [${atom.id}] ${info?.name ?? atom.catalogId} (Cost:${info?.cost ?? "?"}${bp}) [${color}]`);
          }
        }
      } else {
        this.tui.addMessage("game", "Hand: Empty");
      }

      if (myPlayer.field.length > 0) {
        this.tui.addMessage("game", "Field:");
        for (const unit of myPlayer.field) {
          const info = this.catalogLookup(unit.catalogId);
          const status = unit.active ? "Active" : "Exhausted";
          const boot = unit.hasBootAbility && !unit.isBooted ? " [Boot Available]" : "";
          this.tui.addMessage("game", `  [${unit.id}] ${info?.name ?? unit.catalogId} BP:${unit.bp} (${status})${boot}`);
        }
      } else {
        this.tui.addMessage("game", "Field: Empty");
      }

      if (myPlayer.trigger.length > 0) {
        this.tui.addMessage("game", `Triggers set: ${myPlayer.trigger.length}`);
      }

      if (myPlayer.joker.card.length > 0) {
        const jokerInfo = myPlayer.joker.card.map((j) => `${j.chara}(${j.cost})`).join(", ");
        this.tui.addMessage("game", `JOKER: ${jokerInfo} | Gauge: ${myPlayer.joker.gauge}%`);
      }
    }

    this.tui.addMessage("game", "=".repeat(50));
  }

  /**
   * Display current choice options
   */
  private displayChoice(choice: ChoicesMessage): void {
    this.tui.addMessage("system", "--- CHOICE REQUIRED ---");
    this.tui.addMessage("system", `${choice.choices.title}`);
    this.tui.addMessage("system", `Type: ${choice.choices.type} | PromptID: ${choice.promptId}`);

    if (choice.choices.isCancelable) {
      this.tui.addMessage("system", "(Can be cancelled - enter empty to decline)");
    }

    if (choice.choices.count !== undefined) {
      this.tui.addMessage("system", `Select up to ${choice.choices.count} item(s)`);
    }

    this.tui.addMessage("system", "Options:");
    for (const item of choice.choices.items) {
      if (isItemWithBp(item)) {
        // It's a unit
        const info = this.catalogLookup(item.catalogId);
        this.tui.addMessage("system", `  [${item.id}] ${info?.name ?? item.catalogId} BP:${item.bp}`);
      } else if (isItemWithCatalogId(item)) {
        // It's a card
        const info = this.catalogLookup(item.catalogId);
        this.tui.addMessage("system", `  [${item.id}] ${info?.name ?? item.catalogId}`);
      } else if (isItemWithName(item)) {
        // It's an option
        this.tui.addMessage("system", `  [${item.id}] ${item.name}`);
      }
    }
  }

  /**
   * Display available commands
   */
  private displayHelp(context: DecisionContext): void {
    this.tui.addMessage("system", "--- AVAILABLE COMMANDS ---");

    if (context.choice) {
      this.tui.addMessage("system", "choose <id1> [id2] ... - Select option(s) from the choice");
      this.tui.addMessage("system", "decline               - Decline/cancel the choice (if cancelable)");
    } else {
      this.tui.addMessage("system", "summon <card_id>      - Summon a unit from hand");
      this.tui.addMessage("system", "attack <unit_id>      - Attack with a unit");
      this.tui.addMessage("system", "set <card_id>         - Set a trigger/intercept card");
      this.tui.addMessage("system", "boot <unit_id>        - Use unit's boot ability");
      this.tui.addMessage("system", "withdraw <unit_id>    - Withdraw a unit from field");
      this.tui.addMessage("system", "override <src> <tgt>  - Override card onto target");
      this.tui.addMessage("system", "joker <joker_id>      - Use JOKER ability");
      this.tui.addMessage("system", "end                   - End your turn");
    }

    this.tui.addMessage("system", "state                 - Redisplay game state");
    this.tui.addMessage("system", "help                  - Show this help");

    // AI advisor commands
    if (this.advisor) {
      this.tui.addMessage("ai", "--- AI ADVISOR COMMANDS ---");
      this.tui.addMessage("ai", "/think                - AI analyzes current situation");
      this.tui.addMessage("ai", "/advice <action>      - Get advice for specific action");
      this.tui.addMessage("ai", "/records              - Show learning records summary");
      this.tui.addMessage("ai", "/save                 - Save learning records");
    }
  }

  /**
   * Read a line from TUI
   */
  private async readLine(prompt: string): Promise<string> {
    return this.tui.readLine(prompt);
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
          this.tui.addMessage("error", "Usage: summon <card_id>");
          return null;
        }
        const summonCardId = args[0];
        if (summonCardId === undefined) {
          this.tui.addMessage("error", "Usage: summon <card_id>");
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
          this.tui.addMessage("error", "Usage: attack <unit_id>");
          return null;
        }
        const unitId = args[0];
        if (unitId === undefined) {
          this.tui.addMessage("error", "Usage: attack <unit_id>");
          return null;
        }
        const myPlayer = context.gameState.players[myPlayerId];
        const unit = myPlayer?.field.find((u) => u.id === unitId);
        if (!unit) {
          this.tui.addMessage("error", `Unit not found: ${unitId}`);
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
          this.tui.addMessage("error", "Usage: set <card_id>");
          return null;
        }
        const cardId = args[0];
        if (cardId === undefined) {
          this.tui.addMessage("error", "Usage: set <card_id>");
          return null;
        }
        const myPlayerForSet = context.gameState.players[myPlayerId];
        const card = myPlayerForSet?.hand.find((a) => a.id === cardId);
        if (!card || !hasCardInfo(card)) {
          this.tui.addMessage("error", `Card not found: ${cardId}`);
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
          this.tui.addMessage("error", "Usage: boot <unit_id>");
          return null;
        }
        const bootUnitId = args[0];
        if (bootUnitId === undefined) {
          this.tui.addMessage("error", "Usage: boot <unit_id>");
          return null;
        }
        const myPlayerForBoot = context.gameState.players[myPlayerId];
        const bootUnit = myPlayerForBoot?.field.find((u) => u.id === bootUnitId);
        if (!bootUnit) {
          this.tui.addMessage("error", `Unit not found: ${bootUnitId}`);
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
          this.tui.addMessage("error", "Usage: withdraw <unit_id>");
          return null;
        }
        const withdrawUnitId = args[0];
        if (withdrawUnitId === undefined) {
          this.tui.addMessage("error", "Usage: withdraw <unit_id>");
          return null;
        }
        const myPlayerForWithdraw = context.gameState.players[myPlayerId];
        const withdrawUnit = myPlayerForWithdraw?.field.find((u) => u.id === withdrawUnitId);
        if (!withdrawUnit) {
          this.tui.addMessage("error", `Unit not found: ${withdrawUnitId}`);
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
          this.tui.addMessage("error", "Usage: override <source_card_id> <target_card_id>");
          return null;
        }
        const srcId = args[0];
        const tgtId = args[1];
        if (srcId === undefined || tgtId === undefined) {
          this.tui.addMessage("error", "Usage: override <source_card_id> <target_card_id>");
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
          this.tui.addMessage("error", "Usage: joker <joker_id>");
          return null;
        }
        const jokerId = args[0];
        if (jokerId === undefined) {
          this.tui.addMessage("error", "Usage: joker <joker_id>");
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
          this.tui.addMessage("error", "No choice prompt active");
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
          this.tui.addMessage("error", "No choice prompt active");
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
        this.tui.addMessage("error", `Unknown command: ${command}`);
        this.tui.addMessage("system", "Type 'help' for available commands");
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
        this.tui.addMessage("ai", "状況を分析中...");
        try {
          const analysis = await this.advisor.think(context);
          this.tui.addMessage("ai", "--- AI分析結果 ---");
          this.tui.addLines("ai", analysis);
        } catch (error) {
          this.tui.addMessage("error", `分析エラー: ${error}`);
        }
        return true;
      }

      case "/advice": {
        const actionType = parts.slice(1).join(" ");
        if (!actionType) {
          this.tui.addMessage("system", "Usage: /advice <action_type>");
          this.tui.addMessage("system", "Example: /advice summon, /advice attack, /advice end");
          return true;
        }
        this.tui.addMessage("ai", `「${actionType}」についてアドバイス中...`);
        try {
          const advice = await this.advisor.getAdviceFor(context, actionType);
          this.tui.addMessage("ai", "--- AIアドバイス ---");
          this.tui.addLines("ai", advice);
        } catch (error) {
          this.tui.addMessage("error", `アドバイスエラー: ${error}`);
        }
        return true;
      }

      case "/records": {
        const records = this.advisor.getLearningRecords();
        this.tui.addMessage("ai", "--- 学習記録サマリー ---");
        this.tui.addMessage("ai", `総記録数: ${records.length}`);

        if (records.length > 0) {
          const goodMoves = records.filter((r) => r.score > 0).length;
          const badMoves = records.filter((r) => r.score < 0).length;
          this.tui.addMessage("ai", `好手: ${goodMoves}, 悪手: ${badMoves}, 普通: ${records.length - goodMoves - badMoves}`);

          this.tui.addMessage("ai", "最近の記録:");
          const recentRecords = records.slice(-5);
          for (const record of recentRecords) {
            const scoreIcon = record.score > 0 ? "◎" : record.score < 0 ? "×" : "○";
            this.tui.addMessage("ai", `  ${scoreIcon} ${record.situation} - ${record.userAction}`);
            this.tui.addMessage("ai", `    → ${record.reasoning}`);
          }
        }
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
            this.tui.addMessage("error", `評価エラー: ${err}`);
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
      this.tui.addMessage("ai", `[評価] ${result.evaluation} (記録済み)`);
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
    this.tui.setGameStatus("Mulligan Phase");
    this.tui.addMessage("game", "=".repeat(50));
    this.tui.addMessage("game", "MULLIGAN DECISION");
    this.tui.addMessage("game", "=".repeat(50));
    this.tui.addMessage("game", "Your starting hand:");

    for (const atom of hand) {
      if (hasCardInfo(atom)) {
        const info = this.catalogLookup(atom.catalogId);
        const { bp, color } = getCardDisplayInfo(info);
        this.tui.addMessage("game", `  [${atom.id}] ${info?.name ?? atom.catalogId} (Cost:${info?.cost ?? "?"}${bp}) [${color}]`);
      }
    }

    this.tui.addMessage("system", "Commands: 'keep' to keep this hand, 'redraw' to mulligan");

    while (true) {
      const input = await this.readLine(">");
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

      this.tui.addMessage("error", "Please enter 'keep' or 'redraw'");
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
      this.tui.addMessage("system", "保存パスが設定されていません");
      return;
    }

    try {
      const records = this.advisor.getLearningRecords();
      await Bun.write(this.learningRecordsPath, JSON.stringify(records, null, 2));
      this.tui.addMessage("system", `学習記録を保存しました: ${this.learningRecordsPath}`);
    } catch (error) {
      this.tui.addMessage("error", `保存エラー: ${error}`);
    }
  }

  /**
   * Get AI advisor (for external access)
   */
  getAdvisor(): AIAdvisor | null {
    return this.advisor;
  }

  /**
   * Get TUI controller (for external access)
   */
  getTui(): TuiController {
    return this.tui;
  }

  /**
   * Cleanup TUI and save records
   */
  clearHistory(): void {
    // Save learning records before cleanup
    if (this.advisor && this.learningRecordsPath) {
      this.saveLearningRecords().catch(() => {
        // Ignore errors during cleanup
      });
    }

    // Stop TUI
    this.tui.stop();
  }
}
