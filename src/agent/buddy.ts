/**
 * Buddy Mode Agent - Interactive agent that takes commands from the user
 * With unified AI support for analysis and advice
 */

import type { Agent, DecisionContext, ParsedAction } from "../types/agent.ts";
import type { IAtom } from "../../suit/types/game/card/index.ts";
import type { CatalogCard } from "../schemas/catalog.ts";
import type { GameState } from "../types/game.ts";
import type { LearningRecord } from "../types/ai.ts";
import { UnifiedAI, type UnifiedAIConfig } from "./unified-ai.ts";
import { TuiController } from "./buddy-tui.tsx";
import { parseCommand } from "./commands/parser.ts";
import { handleAICommand, handleImmediateInput } from "./commands/ai-handler.ts";
import { displayGameState, displayChoice, displayHelp } from "./display/game-state.ts";
import { hasCardInfo, hasTargetWithId } from "./utils/type-guards.ts";
import { getCardDisplayInfo } from "./utils/formatters.ts";

/**
 * BuddyAgent configuration
 */
export interface BuddyAgentConfig {
  ai?: {
    apiKey: string;
    model?: string;
  };
  autoEvaluate?: boolean;
  learningRecordsPath?: string;
}

/**
 * BuddyAgent - Allows user to control the agent via command line
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
    this.tui = new TuiController();
  }

  private ensureTuiStarted(): void {
    if (this.tuiStarted) return;
    this.tuiStarted = true;

    this.tui.start();

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
        onProcessingChange: (isProcessing, reason) => {
          this.tui.setInputEnabled(!isProcessing, reason);
        },
      };

      this.ai = new UnifiedAI(aiConfig, this.catalogLookup);
      this.tui.addMessage("system", "AI分析を有効化しました");

      if (this.learningRecordsPath) {
        this.loadLearningRecords();
      }

      this.tui.onInput((command, wasQueued) => {
        handleImmediateInput(command, wasQueued, this.ai, this.tui);
      });
    }
  }

  getName(): string {
    return this.name;
  }

  async decideAction(context: DecisionContext): Promise<ParsedAction> {
    this.ensureTuiStarted();

    this.lastContext = context;
    if (this.ai) {
      this.ai.setContext(context);
    }

    displayGameState(context, this.tui, this.catalogLookup);

    if (context.choice) {
      displayChoice(context.choice, this.tui, this.catalogLookup);
    }

    displayHelp(context, this.tui, this.ai !== null);

    while (true) {
      const input = await this.tui.readLine("\n> ");

      if (input === "state") {
        displayGameState(context, this.tui, this.catalogLookup);
        if (context.choice) {
          displayChoice(context.choice, this.tui, this.catalogLookup);
        }
        continue;
      }

      if (input === "help") {
        displayHelp(context, this.tui, this.ai !== null);
        continue;
      }

      if (!input) {
        continue;
      }

      if (input.startsWith("/")) {
        const result = await handleAICommand(input, context, this.ai, this.tui);
        if (typeof result === "object" && "shouldExecute" in result) {
          return result.action;
        }
        if (result === true) {
          continue;
        }
        this.tui.addMessage("error", `Unknown command: ${input.split(/\s+/)[0]}`);
        continue;
      }

      const action = parseCommand(input, context, this.tui);
      if (action) {
        if (this.autoEvaluate && this.ai) {
          const description = this.describeAction(action, context);
          this.ai.evaluateAction(action.type, description).catch((err) => {
            this.tui.addMessage("error", `評価エラー: ${err}`);
          });
        }
        return action;
      }

      if (this.ai) {
        this.tui.addMessage("user", `[パイロット] ${input}`);
        try {
          await this.ai.addPilotComment(input);
        } catch (err) {
          this.tui.addMessage("error", `コメント処理エラー: ${err}`);
        }
        continue;
      } else {
        this.tui.addMessage("error", `Unknown command: ${input.split(/\s+/)[0]}`);
        this.tui.addMessage("system", "Type 'help' for available commands");
      }
    }
  }

  private describeAction(action: ParsedAction, context: DecisionContext): string {
    const payload = action.payload;

    switch (action.type) {
      case "UnitDrive": {
        if (hasTargetWithId(payload)) {
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
        if (hasTargetWithId(payload)) {
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

  async decideMulligan(hand: IAtom[], playerId: string): Promise<ParsedAction> {
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
      const input = await this.tui.readLine(">");
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

  getAI(): UnifiedAI | null {
    return this.ai;
  }

  getTui(): TuiController {
    return this.tui;
  }

  pushGameStateUpdate(gameState: GameState): void {
    if (this.ai) {
      this.ai.pushGameStateUpdate(gameState, this.lastContext ?? undefined);
    }
  }

  pushGameEvent(event: string): void {
    if (this.ai) {
      this.ai.pushGameEvent(event);
    }
  }

  clearHistory(): void {
    if (this.ai && this.learningRecordsPath) {
      this.saveLearningRecords().catch(() => {
        // Ignore errors during cleanup
      });
    }

    if (this.ai) {
      this.ai.clearThread();
    }

    if (this.tuiStarted) {
      this.tui.stop();
    }
  }
}
