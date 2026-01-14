/**
 * Unified AI Service for Buddy Mode
 * All AI interactions happen in a single conversation thread
 */

import type { GameState } from "../types/game.ts";
import type { DecisionContext, ProposedAction } from "../types/agent.ts";
import type { ThreadMessage, UnifiedAIConfig, LearningRecord } from "../types/ai.ts";
import type { CatalogCard } from "../schemas/catalog.ts";
import { executeTool } from "./ai/tools.ts";
import { loadGameRules } from "./ai/system-prompt.ts";
import { formatStateDiff, summarizeSituation } from "./ai/state-diff.ts";
import { APIClient } from "./ai/api-client.ts";

// Re-export types for backward compatibility
export type { ThreadMessage, UnifiedAIConfig, LearningRecord };

/**
 * UnifiedAI - Single thread for all AI interactions
 */
export class UnifiedAI {
  private apiClient: APIClient;
  private debounceMs: number;
  private thread: ThreadMessage[] = [];
  private pendingEvents: string[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private catalogLookup: (id: string) => CatalogCard | undefined;
  private previousState: GameState | null = null;
  private currentContext: DecisionContext | null = null;
  private onMessage: ((message: string, type: "analysis" | "advice" | "evaluation") => void) | null = null;
  private isProcessing = false;
  private gameRules = "";
  private rulesLoaded = false;
  private learningRecords: LearningRecord[] = [];
  private pendingAction: ProposedAction | null = null;
  private onActionProposed: ((action: ProposedAction) => void) | null = null;
  private onProcessingChange: ((isProcessing: boolean, reason?: string) => void) | null = null;

  constructor(
    config: UnifiedAIConfig,
    catalogLookup: (id: string) => CatalogCard | undefined
  ) {
    this.apiClient = new APIClient({
      apiKey: config.apiKey,
      model: config.model ?? "claude-3-5-haiku-20241022",
    });
    this.debounceMs = config.debounceMs ?? 1500;
    this.catalogLookup = catalogLookup;
    this.onMessage = config.onMessage ?? null;
    this.onActionProposed = config.onActionProposed ?? null;
    this.onProcessingChange = config.onProcessingChange ?? null;

    loadGameRules()
      .then((rules) => {
        this.gameRules = rules;
        this.rulesLoaded = true;
      })
      .catch((err) => {
        console.error("[UnifiedAI] Failed to load game rules:", err);
      });
  }

  /**
   * Execute a tool call
   */
  private executeToolCall(toolName: string, toolInput: unknown): string {
    const result = executeTool(toolName, toolInput, {
      currentContext: this.currentContext,
      catalogLookup: this.catalogLookup,
      onActionProposed: (action) => {
        this.pendingAction = action;
        this.onActionProposed?.(action);
      },
    });

    if (typeof result === "string") {
      return result;
    }

    if (result.proposedAction) {
      this.pendingAction = result.proposedAction;
    }
    return result.message;
  }

  /**
   * Send a message to the AI and get a response
   */
  private async sendMessage(userContent: string): Promise<string> {
    const responseText = await this.apiClient.sendMessage(
      this.thread,
      userContent,
      this.gameRules,
      this.executeToolCall.bind(this)
    );

    this.thread.push({
      role: "user",
      content: userContent,
      timestamp: Date.now(),
    });

    this.thread.push({
      role: "assistant",
      content: responseText,
      timestamp: Date.now(),
    });

    return responseText;
  }

  /**
   * Set processing state and notify via callback
   */
  private setProcessing(processing: boolean, reason?: string): void {
    this.isProcessing = processing;
    this.onProcessingChange?.(processing, reason);
  }

  // ============ Public API ============

  pushGameStateUpdate(gameState: GameState, context?: DecisionContext): void {
    if (context) {
      this.currentContext = context;
    }

    if (this.previousState) {
      const diff = formatStateDiff(this.previousState, gameState, this.catalogLookup);
      if (diff) {
        this.pendingEvents.push(`[状態変化]\n${diff}`);
        this.scheduleAnalysis();
      }
    }
    this.previousState = structuredClone(gameState);
  }

  pushGameEvent(event: string): void {
    this.pendingEvents.push(`[ゲームイベント] ${event}`);
    this.scheduleAnalysis();
  }

  async addPilotComment(comment: string): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const context = this.pendingEvents.length > 0
      ? this.pendingEvents.join("\n\n") + "\n\n"
      : "";
    this.pendingEvents = [];

    const message = `${context}[パイロット] ${comment}`;

    while (this.isProcessing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.setProcessing(true, "応答中...");
    try {
      const response = await this.sendMessage(message);
      this.onMessage?.(response, "analysis");
    } catch (error) {
      console.error("[UnifiedAI] Comment response error:", error);
    } finally {
      this.setProcessing(false);
    }
  }

  async requestAnalysis(): Promise<string> {
    if (!this.currentContext) {
      return "ゲーム状態がまだ取得されていません";
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const pendingContext = this.pendingEvents.length > 0
      ? this.pendingEvents.join("\n\n") + "\n\n"
      : "";
    this.pendingEvents = [];

    const message = `${pendingContext}[パイロットの要求] 現在の状況を詳しく分析してください。
以下の観点から教えてください:
1. 現在の盤面の優劣
2. 相手が取りうる行動の予測
3. 推奨される行動とその理由
4. 注意すべきリスク`;

    this.setProcessing(true, "状況を分析中...");
    try {
      const response = await this.sendMessage(message);
      this.onMessage?.(response, "advice");
      return response;
    } catch (error) {
      console.error("[UnifiedAI] Analysis error:", error);
      return "分析中にエラーが発生しました";
    } finally {
      this.setProcessing(false);
    }
  }

  async requestAdvice(actionType: string): Promise<string> {
    if (!this.currentContext) {
      return "ゲーム状態がまだ取得されていません";
    }

    const message = `[パイロットの質問] 「${actionType}」についてアドバイスをください。
メリット・デメリットを教えてください。`;

    this.setProcessing(true, "アドバイス中...");
    try {
      const response = await this.sendMessage(message);
      this.onMessage?.(response, "advice");
      return response;
    } catch (error) {
      console.error("[UnifiedAI] Advice error:", error);
      return "アドバイス中にエラーが発生しました";
    } finally {
      this.setProcessing(false);
    }
  }

  async evaluateAction(
    actionType: string,
    actionDescription: string
  ): Promise<{ evaluation: string; recorded: boolean }> {
    if (!this.currentContext) {
      return { evaluation: "評価できませんでした", recorded: false };
    }

    while (this.isProcessing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.setProcessing(true, "行動を評価中...");
    try {
      const message = `[行動評価依頼]
プレイヤーが選択した行動:
- 種類: ${actionType}
- 詳細: ${actionDescription}

この行動を評価してください。以下のJSON形式で回答の最後に含めてください:
\`\`\`json
{"score": <-1|0|1>, "isNotable": <true|false>}
\`\`\`
score: -1=悪手, 0=普通, 1=好手
isNotable: 学習価値があるか`;

      const response = await this.sendMessage(message);

      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      let score = 0;
      let isNotable = false;
      if (jsonMatch?.[1]) {
        try {
          const parsed: unknown = JSON.parse(jsonMatch[1]);
          if (typeof parsed === "object" && parsed !== null) {
            if ("score" in parsed && typeof parsed.score === "number") {
              score = parsed.score;
            }
            if ("isNotable" in parsed && typeof parsed.isNotable === "boolean") {
              isNotable = parsed.isNotable;
            }
          }
        } catch {
          // Ignore parse errors
        }
      }

      if (isNotable) {
        const record: LearningRecord = {
          timestamp: Date.now(),
          gameRound: this.currentContext.gameState.game.round,
          gameTurn: this.currentContext.gameState.game.turn,
          situation: summarizeSituation(this.currentContext.gameState, this.currentContext.myPlayerId),
          userAction: `${actionType}: ${actionDescription}`,
          evaluation: score > 0 ? "好手" : score < 0 ? "悪手" : "普通",
          score,
          reasoning: response.replace(/```json[\s\S]*?```/, "").trim(),
        };
        this.learningRecords.push(record);
        this.onMessage?.(response, "evaluation");
        return { evaluation: response, recorded: true };
      }

      this.onMessage?.(response, "evaluation");
      return { evaluation: response, recorded: false };
    } catch (error) {
      console.error("[UnifiedAI] Evaluation error:", error);
      return { evaluation: "評価できませんでした", recorded: false };
    } finally {
      this.setProcessing(false);
    }
  }

  setContext(context: DecisionContext): void {
    this.currentContext = context;
  }

  getThread(): ThreadMessage[] {
    return [...this.thread];
  }

  clearThread(): void {
    this.thread = [];
    this.pendingEvents = [];
    this.previousState = null;
    this.currentContext = null;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  getLearningRecords(): LearningRecord[] {
    return [...this.learningRecords];
  }

  loadRecords(records: LearningRecord[]): void {
    this.learningRecords = records;
  }

  areRulesLoaded(): boolean {
    return this.rulesLoaded;
  }

  // ============ Action Proposal API ============

  hasPendingAction(): boolean {
    return this.pendingAction !== null && this.pendingAction.status === "pending";
  }

  getPendingAction(): ProposedAction | null {
    return this.pendingAction;
  }

  confirmPendingAction(): ProposedAction | null {
    if (!this.pendingAction || this.pendingAction.status !== "pending") {
      return null;
    }
    this.pendingAction.status = "approved";
    const action = this.pendingAction;
    this.pendingAction = null;
    return action;
  }

  rejectPendingAction(reason?: string): void {
    if (!this.pendingAction) return;
    this.pendingAction.status = "rejected";
    if (reason) {
      this.pendingEvents.push(`[パイロット] アクション提案を却下: ${reason}`);
    }
    this.pendingAction = null;
  }

  async requestActionFromInstruction(instruction: string): Promise<void> {
    if (!this.currentContext) {
      throw new Error("ゲーム状態がまだ取得されていません");
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const pendingContext = this.pendingEvents.length > 0
      ? this.pendingEvents.join("\n\n") + "\n\n"
      : "";
    this.pendingEvents = [];

    const message = `${pendingContext}[パイロットの指示] ${instruction}

現在のゲーム状態と実行可能なアクションを確認し、パイロットの指示に沿ったアクションを propose_action ツールで提案してください。

提案前に以下を確認してください:
1. get_available_actions で実行可能なアクションを確認
2. 指示された内容が実行可能か
3. 戦略的に妥当か

指示に沿ったアクションが実行できない場合は、その理由を説明してください。`;

    while (this.isProcessing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.setProcessing(true, "指示を解釈中...");
    try {
      const response = await this.sendMessage(message);
      this.onMessage?.(response, "analysis");
    } catch (error) {
      console.error("[UnifiedAI] Action request error:", error);
      throw error;
    } finally {
      this.setProcessing(false);
    }
  }

  // ============ Private helpers ============

  private scheduleAnalysis(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.executeAutoAnalysis().catch((err) => {
        console.error("[UnifiedAI] Auto-analysis error:", err);
      });
    }, this.debounceMs);
  }

  private async executeAutoAnalysis(): Promise<void> {
    if (this.pendingEvents.length === 0 || this.isProcessing) {
      return;
    }

    const content = this.pendingEvents.join("\n\n");
    this.pendingEvents = [];

    this.setProcessing(true, "リアルタイム分析中...");
    try {
      const response = await this.sendMessage(content);
      this.onMessage?.(response, "analysis");
    } catch (error) {
      console.error("[UnifiedAI] Auto-analysis error:", error);
    } finally {
      this.setProcessing(false);
    }
  }
}
