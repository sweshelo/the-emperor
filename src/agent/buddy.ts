/**
 * Buddy Mode Agent - Interactive agent that takes commands from the user
 * With unified AI support for analysis and advice
 */

import type { Agent, DecisionContext, ParsedAction } from "../types/agent.ts";
import type { IAtom } from "../../suit/types/game/card/index.ts";
import { type CatalogCard, isJokerCard } from "../schemas/catalog.ts";
import type { ICard, ChoicesMessage, GameState } from "../types/game.ts";
import { UnifiedAI, type UnifiedAIConfig, type LearningRecord } from "./unified-ai.ts";
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
  /** AI configuration (optional) */
  ai?: {
    apiKey: string;
    model?: string;
  };
  /** Enable automatic evaluation of user moves */
  autoEvaluate?: boolean;
  /** Path to save/load learning records */
  learningRecordsPath?: string;
}

/**
 * BuddyAgent - Allows user to control the agent via command line
 * With unified AI for analysis, advice, and evaluation
 */
export class BuddyAgent implements Agent {
  private catalogLookup: (id: string) => CatalogCard | undefined;
  private tui: TuiController;
  private ai: UnifiedAI | null = null;
  private autoEvaluate: boolean;
  private learningRecordsPath: string | null;
  private lastContext: DecisionContext | null = null;
  private config?: BuddyAgentConfig;
  private tuiStarted = false;

  constructor(
    private name: string,
    catalogLookup: (id: string) => CatalogCard | undefined,
    config?: BuddyAgentConfig
  ) {
    this.catalogLookup = catalogLookup;
    this.autoEvaluate = config?.autoEvaluate ?? false;
    this.learningRecordsPath = config?.learningRecordsPath ?? null;
    this.config = config;

    // TUI will be initialized lazily on first use
    this.tui = new TuiController();
  }

  /**
   * Start the TUI (called lazily on first use)
   */
  private ensureTuiStarted(): void {
    if (this.tuiStarted) return;
    this.tuiStarted = true;

    this.tui.start();

    // Initialize unified AI if API key provided
    if (this.config?.ai) {
      const aiConfig: UnifiedAIConfig = {
        apiKey: this.config.ai.apiKey,
        model: this.config.ai.model ?? "claude-3-5-haiku-20241022",
        debounceMs: 1500,
        onMessage: (message, type) => {
          const prefix = type === "analysis" ? "--- AI分析 ---"
            : type === "advice" ? "--- AIアドバイス ---"
            : "--- AI評価 ---";
          this.tui.addMessage("ai", prefix);
          this.tui.addLines("ai", message);
        },
      };

      this.ai = new UnifiedAI(aiConfig, this.catalogLookup);
      this.tui.addMessage("system", "AI分析を有効化しました");

      // Load existing learning records
      if (this.learningRecordsPath) {
        this.loadLearningRecords();
      }

      // Set up input callback for immediate comment processing
      this.tui.onInput((command, wasQueued) => {
        this.handleImmediateInput(command, wasQueued);
      });
    }
  }

  /**
   * Handle input immediately (for comments during opponent's turn)
   */
  private handleImmediateInput(input: string, wasQueued: boolean): void {
    if (!this.ai) return;

    // Only process immediately if the command was queued (decideAction is not waiting)
    if (!wasQueued) return;

    // Handle /comment command immediately
    if (input.startsWith("/comment ")) {
      const comment = input.slice("/comment ".length).trim();
      if (comment) {
        this.ai.addPilotComment(comment).catch((err) => {
          this.tui.addMessage("error", `コメント処理エラー: ${err}`);
        });
        this.tui.addMessage("user", `[パイロット] ${comment}`);
      } else {
        this.tui.addMessage("system", "Usage: /comment <your comment>");
      }
      this.tui.removeLastFromQueue();
      return;
    }

    // Handle /thread command immediately
    if (input === "/thread") {
      const thread = this.ai.getThread();
      this.tui.addMessage("ai", "--- スレッド履歴 ---");
      this.tui.addMessage("ai", `メッセージ数: ${thread.length}`);

      if (thread.length > 0) {
        this.tui.addMessage("ai", "最近のやり取り:");
        const recentMessages = thread.slice(-6);
        for (const msg of recentMessages) {
          const roleLabel = msg.role === "user" ? "[入力]" : "[AI]";
          const preview = msg.content.length > 100
            ? msg.content.slice(0, 100) + "..."
            : msg.content;
          this.tui.addMessage("ai", `  ${roleLabel} ${preview}`);
        }
      }
      this.tui.removeLastFromQueue();
      return;
    }

    // Handle /clear command immediately
    if (input === "/clear") {
      this.ai.clearThread();
      this.tui.addMessage("system", "スレッド履歴をクリアしました");
      this.tui.removeLastFromQueue();
      return;
    }

    // For non-command text that doesn't look like a game command,
    // treat as pilot comment
    const gameCommands = ["summon", "attack", "set", "boot", "withdraw", "override", "joker", "end", "choose", "decline", "state", "help"];
    const firstWord = input.toLowerCase().split(/\s+/)[0];
    if (firstWord && !input.startsWith("/") && !gameCommands.includes(firstWord)) {
      this.ai.addPilotComment(input).catch((err) => {
        this.tui.addMessage("error", `コメント処理エラー: ${err}`);
      });
      this.tui.addMessage("user", `[パイロット] ${input}`);
      this.tui.removeLastFromQueue();
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
        const info = this.catalogLookup(item.catalogId);
        this.tui.addMessage("system", `  [${item.id}] ${info?.name ?? item.catalogId} BP:${item.bp}`);
      } else if (isItemWithCatalogId(item)) {
        const info = this.catalogLookup(item.catalogId);
        this.tui.addMessage("system", `  [${item.id}] ${info?.name ?? item.catalogId}`);
      } else if (isItemWithName(item)) {
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

    // AI commands
    if (this.ai) {
      this.tui.addMessage("ai", "--- AI COMMANDS ---");
      this.tui.addMessage("ai", "/think                - 状況を詳しく分析");
      this.tui.addMessage("ai", "/advice <action>      - 特定アクションのアドバイス");
      this.tui.addMessage("ai", "/comment <text>       - AIへコメント");
      this.tui.addMessage("ai", "/thread               - スレッド履歴を表示");
      this.tui.addMessage("ai", "/clear                - スレッド履歴をクリア");
      this.tui.addMessage("ai", "/records              - 学習記録を表示");
      this.tui.addMessage("ai", "/save                 - 学習記録を保存");
      this.tui.addMessage("ai", "(テキスト入力でもAIへコメントできます)");
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
        return null;
    }
  }

  /**
   * Handle AI commands
   * Returns true if command was handled
   */
  private async handleAICommand(input: string, _context: DecisionContext): Promise<boolean> {
    if (!this.ai) return false;

    const parts = input.split(/\s+/);
    const command = parts[0]?.toLowerCase();

    switch (command) {
      case "/think": {
        this.tui.addMessage("ai", "状況を分析中...");
        try {
          await this.ai.requestAnalysis();
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
          await this.ai.requestAdvice(actionType);
        } catch (error) {
          this.tui.addMessage("error", `アドバイスエラー: ${error}`);
        }
        return true;
      }

      case "/comment": {
        const comment = parts.slice(1).join(" ");
        if (!comment) {
          this.tui.addMessage("system", "Usage: /comment <your comment>");
          return true;
        }
        this.tui.addMessage("user", `[パイロット] ${comment}`);
        try {
          await this.ai.addPilotComment(comment);
        } catch (error) {
          this.tui.addMessage("error", `コメント処理エラー: ${error}`);
        }
        return true;
      }

      case "/thread": {
        const thread = this.ai.getThread();
        this.tui.addMessage("ai", "--- スレッド履歴 ---");
        this.tui.addMessage("ai", `メッセージ数: ${thread.length}`);

        if (thread.length > 0) {
          this.tui.addMessage("ai", "最近のやり取り:");
          const recentMessages = thread.slice(-6);
          for (const msg of recentMessages) {
            const roleLabel = msg.role === "user" ? "[入力]" : "[AI]";
            const preview = msg.content.length > 100
              ? msg.content.slice(0, 100) + "..."
              : msg.content;
            this.tui.addMessage("ai", `  ${roleLabel} ${preview}`);
          }
        }
        return true;
      }

      case "/clear": {
        this.ai.clearThread();
        this.tui.addMessage("system", "スレッド履歴をクリアしました");
        return true;
      }

      case "/records": {
        const records = this.ai.getLearningRecords();
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
            this.tui.addMessage("ai", `    → ${record.reasoning.slice(0, 50)}...`);
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
    // Ensure TUI is started
    this.ensureTuiStarted();

    // Store context for AI
    this.lastContext = context;
    if (this.ai) {
      this.ai.setContext(context);
    }

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

      // Handle AI commands (starting with /)
      if (input.startsWith("/")) {
        const handled = await this.handleAICommand(input, context);
        if (handled) {
          continue;
        }
        this.tui.addMessage("error", `Unknown command: ${input.split(/\s+/)[0]}`);
        continue;
      }

      const action = this.parseCommand(input, context);
      if (action) {
        // Evaluate the action if auto-evaluate is enabled
        if (this.autoEvaluate && this.ai) {
          const description = this.describeAction(action, context);
          this.ai.evaluateAction(action.type, description).catch((err) => {
            this.tui.addMessage("error", `評価エラー: ${err}`);
          });
        }
        return action;
      }

      // Input is not a game command - treat as pilot comment if AI is enabled
      if (this.ai) {
        this.tui.addMessage("user", `[パイロット] ${input}`);
        this.ai.addPilotComment(input).catch((err) => {
          this.tui.addMessage("error", `コメント処理エラー: ${err}`);
        });
        continue;
      } else {
        this.tui.addMessage("error", `Unknown command: ${input.split(/\s+/)[0]}`);
        this.tui.addMessage("system", "Type 'help' for available commands");
      }
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
    // Ensure TUI is started
    this.ensureTuiStarted();

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
    if (!this.learningRecordsPath || !this.ai) return;

    try {
      const file = Bun.file(this.learningRecordsPath);
      if (file.size > 0) {
        file.text().then((text) => {
          const parsed: unknown = JSON.parse(text);
          if (Array.isArray(parsed)) {
            const validRecords = parsed.filter((item): item is LearningRecord => this.isLearningRecord(item));
            if (validRecords.length > 0) {
              this.ai?.loadRecords(validRecords);
              this.tui.addMessage("system", `${validRecords.length}件の学習記録を読み込みました`);
            }
          }
        }).catch(() => {
          // File doesn't exist or is empty
        });
      }
    } catch {
      // File doesn't exist
    }
  }

  /**
   * Save learning records to file
   */
  private async saveLearningRecords(): Promise<void> {
    if (!this.learningRecordsPath || !this.ai) {
      this.tui.addMessage("system", "保存パスが設定されていません");
      return;
    }

    try {
      const records = this.ai.getLearningRecords();
      await Bun.write(this.learningRecordsPath, JSON.stringify(records, null, 2));
      this.tui.addMessage("system", `学習記録を保存しました: ${this.learningRecordsPath}`);
    } catch (error) {
      this.tui.addMessage("error", `保存エラー: ${error}`);
    }
  }

  /**
   * Get unified AI (for external access)
   */
  getAI(): UnifiedAI | null {
    return this.ai;
  }

  /**
   * Get TUI controller (for external access)
   */
  getTui(): TuiController {
    return this.tui;
  }

  /**
   * Push game state update to AI
   * Call this when Sync message is received
   */
  pushGameStateUpdate(gameState: GameState): void {
    if (this.ai) {
      this.ai.pushGameStateUpdate(gameState, this.lastContext ?? undefined);
    }
  }

  /**
   * Push game event to AI
   * Call this when a game event (card effect, etc.) occurs
   */
  pushGameEvent(event: string): void {
    if (this.ai) {
      this.ai.pushGameEvent(event);
    }
  }

  /**
   * Cleanup TUI and save records
   */
  clearHistory(): void {
    // Save learning records before cleanup
    if (this.ai && this.learningRecordsPath) {
      this.saveLearningRecords().catch(() => {
        // Ignore errors during cleanup
      });
    }

    // Clear AI thread
    if (this.ai) {
      this.ai.clearThread();
    }

    // Stop TUI only if it was started
    if (this.tuiStarted) {
      this.tui.stop();
    }
  }
}
