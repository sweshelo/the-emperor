/**
 * Unified AI Service for Buddy Mode
 * All AI interactions happen in a single conversation thread
 */

import Anthropic from "@anthropic-ai/sdk";
import type { GameState, ICard } from "../types/game.ts";
import type { DecisionContext, ParsedAction, ProposedAction } from "../types/agent.ts";
import type { CatalogCard } from "../schemas/catalog.ts";
import type { IAtom } from "../../suit/types/game/card/index.ts";
import { isJokerCard } from "../schemas/catalog.ts";
import { formatGameStatePrompt, formatChoicePrompt, formatAvailableActionsPrompt } from "./prompts.ts";

/**
 * Type guard to check if an IAtom has catalogId (is actually an ICard)
 */
function hasCardInfo(atom: IAtom): atom is ICard {
  return "catalogId" in atom && "lv" in atom;
}

/**
 * Message in the unified AI thread
 */
export interface ThreadMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

/**
 * Configuration for UnifiedAI
 */
export interface UnifiedAIConfig {
  apiKey: string;
  model?: string;
  debounceMs?: number;
  onMessage?: (message: string, type: "analysis" | "advice" | "evaluation") => void;
  onActionProposed?: (action: ProposedAction) => void;
  /** Called when AI processing state changes (true = processing started, false = processing ended) */
  onProcessingChange?: (isProcessing: boolean, reason?: string) => void;
}

/**
 * Tool input types
 */
interface LookupCardInput {
  catalogId: string;
}

/**
 * Type guard for lookup_card input
 */
function isLookupCardInput(input: unknown): input is LookupCardInput {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  return "catalogId" in input && typeof input.catalogId === "string";
}

/**
 * Input type for propose_action tool
 */
interface ProposeActionInput {
  actionType: string;
  parameters: Record<string, unknown>;
  reasoning: string;
}

/**
 * Type guard for propose_action input
 */
function isProposeActionInput(input: unknown): input is ProposeActionInput {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  if (!("actionType" in input) || typeof input.actionType !== "string") {
    return false;
  }
  if (!("parameters" in input) || typeof input.parameters !== "object" || input.parameters === null) {
    return false;
  }
  if (!("reasoning" in input) || typeof input.reasoning !== "string") {
    return false;
  }
  return true;
}

/**
 * Learning record entry
 */
export interface LearningRecord {
  timestamp: number;
  gameRound: number;
  gameTurn: number;
  situation: string;
  userAction: string;
  evaluation: string;
  score: number;
  reasoning: string;
}

/**
 * UnifiedAI - Single thread for all AI interactions
 */
export class UnifiedAI {
  private client: Anthropic;
  private model: string;
  private debounceMs: number;
  private thread: ThreadMessage[] = [];
  private pendingEvents: string[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private catalogLookup: (id: string) => CatalogCard | undefined;
  private previousState: GameState | null = null;
  private currentState: GameState | null = null;
  private currentContext: DecisionContext | null = null;
  private onMessage: ((message: string, type: "analysis" | "advice" | "evaluation") => void) | null = null;
  private isProcessing = false;
  private gameRules = "";
  private rulesLoaded = false;
  private learningRecords: LearningRecord[] = [];
  private pendingAction: ProposedAction | null = null;
  private onActionProposed: ((action: ProposedAction) => void) | null = null;
  private onProcessingChange: ((isProcessing: boolean, reason?: string) => void) | null = null;

  /**
   * Tool definitions for the AI
   */
  private readonly tools: Anthropic.Tool[] = [
    {
      name: "lookup_card",
      description: "カタログIDからカード情報を取得します。カード名、コスト、BP、能力テキストなどが分かります。",
      input_schema: {
        type: "object",
        properties: {
          catalogId: {
            type: "string",
            description: "カタログID (例: 1-2-001, PR-028)",
          },
        },
        required: ["catalogId"],
      },
    },
    {
      name: "get_game_state",
      description: "現在のゲーム状態の詳細を取得します。",
      input_schema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "get_available_actions",
      description: "現在実行可能なアクションの一覧を取得します。",
      input_schema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "propose_action",
      description: "パイロットの指示に基づいてアクションを提案します。パイロットの承認後に実行されます。",
      input_schema: {
        type: "object",
        properties: {
          actionType: {
            type: "string",
            description: "アクションの種類: summon (ユニット召喚), attack (攻撃), set_trigger (トリガーセット), boot (ブート能力), withdraw (撤退), joker (JOKER使用), end_turn (ターン終了), choose (選択)",
          },
          parameters: {
            type: "object",
            description: "アクションのパラメータ。actionTypeに応じて必要なパラメータが異なります。summon: {cardId}, attack: {unitId}, set_trigger: {cardId}, boot: {unitId}, withdraw: {unitId}, joker: {jokerId}, choose: {choiceIds: string[]}",
          },
          reasoning: {
            type: "string",
            description: "このアクションを提案する理由の説明",
          },
        },
        required: ["actionType", "parameters", "reasoning"],
      },
    },
  ];

  constructor(
    config: UnifiedAIConfig,
    catalogLookup: (id: string) => CatalogCard | undefined
  ) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
    this.model = config.model ?? "claude-3-5-haiku-20241022";
    this.debounceMs = config.debounceMs ?? 1500;
    this.catalogLookup = catalogLookup;
    this.onMessage = config.onMessage ?? null;
    this.onActionProposed = config.onActionProposed ?? null;
    this.onProcessingChange = config.onProcessingChange ?? null;

    // Load game rules
    this.loadGameRules().catch((err) => {
      console.error("[UnifiedAI] Failed to load game rules:", err);
    });
  }

  /**
   * Load game rules from file
   */
  private async loadGameRules(): Promise<void> {
    try {
      const file = Bun.file("./src/data/docs/game-rules.md");
      this.gameRules = await file.text();
      this.rulesLoaded = true;
    } catch {
      this.gameRules = "";
    }
  }

  /**
   * Get system prompt
   */
  private getSystemPrompt(): string {
    const basePrompt = `あなたはCODE OF JOKERの対戦サポートAIです。
プレイヤー（パイロット）の相棒として、ゲームを一緒に戦います。

## あなたの役割
- ゲームの状態変化を観察し、何が起きたか解説
- パイロットからの質問やコメントに応答
- 戦略的なアドバイスを提供
- パイロットの判断を評価し、学習を支援
- パイロットの指示に基づいてアクションを提案

## 応答スタイル
- 簡潔に（1-3文程度）
- 日本語で
- パイロットのコメントを踏まえて分析を調整

## ツールの使用
- カード情報が必要な場合は lookup_card を使用
- ゲーム状態の詳細が必要な場合は get_game_state を使用
- 可能なアクションを確認する場合は get_available_actions を使用
- パイロットからアクション実行の指示があった場合は propose_action を使用

## アクション提案について（重要）
パイロットから「攻撃して」「このカードを召喚して」などのアクション実行の指示があった場合:
1. まず get_available_actions で実行可能なアクションを確認
2. 指示された内容が実行可能か検証
3. propose_action ツールでアクションを提案

**重要な制約**:
- 自発的にアクションを提案しないでください
- パイロットから明示的な指示（「〜して」「〜を実行」など）があった場合のみ propose_action を使用
- 通常の会話や分析では propose_action を使用しない
- 提案したアクションはパイロットの承認後に実行されます`;

    if (this.gameRules) {
      return `${basePrompt}\n\n## ゲームルール\n${this.gameRules}`;
    }
    return basePrompt;
  }

  /**
   * Execute a tool call
   */
  private executeTool(toolName: string, toolInput: unknown): string {
    switch (toolName) {
      case "lookup_card": {
        if (!isLookupCardInput(toolInput)) {
          return "エラー: catalogIdが必要です";
        }
        const card = this.catalogLookup(toolInput.catalogId);
        if (!card) {
          return `カード ${toolInput.catalogId} が見つかりませんでした`;
        }
        return this.formatCardInfo(card);
      }

      case "get_game_state": {
        if (!this.currentContext) {
          return "ゲーム状態がまだ取得されていません";
        }
        return formatGameStatePrompt(this.currentContext, this.catalogLookup);
      }

      case "get_available_actions": {
        if (!this.currentContext) {
          return "ゲーム状態がまだ取得されていません";
        }
        const actions = formatAvailableActionsPrompt(this.currentContext, this.catalogLookup);
        const choice = this.currentContext.choice
          ? formatChoicePrompt(this.currentContext.choice)
          : "";
        return actions + (choice ? "\n\n" + choice : "");
      }

      case "propose_action": {
        if (!isProposeActionInput(toolInput)) {
          return "エラー: actionType, parameters, reasoning が必要です";
        }
        if (!this.currentContext) {
          return "エラー: ゲーム状態がまだ取得されていません";
        }

        const parsedAction = this.buildParsedAction(toolInput.actionType, toolInput.parameters);
        if (!parsedAction) {
          return `エラー: アクションを構築できませんでした (actionType: ${toolInput.actionType})`;
        }

        const description = this.describeActionForProposal(toolInput.actionType, toolInput.parameters);
        const proposedAction: ProposedAction = {
          id: `proposal_${Date.now()}`,
          action: parsedAction,
          description,
          reasoning: toolInput.reasoning,
          timestamp: Date.now(),
          status: "pending",
        };

        this.pendingAction = proposedAction;
        this.onActionProposed?.(proposedAction);

        return `アクションを提案しました: ${description}\n理由: ${toolInput.reasoning}\n\nパイロットの承認を待っています...`;
      }

      default:
        return `Unknown tool: ${toolName}`;
    }
  }

  /**
   * Format card info for display
   */
  private formatCardInfo(card: CatalogCard): string {
    if (isJokerCard(card)) {
      return `[JOKER] ${card.name}\n効果: ${card.ability}`;
    }
    // Regular card
    const lines = [
      `[${card.id}] ${card.name}`,
      `種類: ${card.type} / 色: ${this.getColorName(card.color)}`,
      `コスト: ${card.cost}`,
    ];
    if (card.bp) {
      lines.push(`BP: ${card.bp.join("/")}`);
    }
    if (card.ability) {
      lines.push(`能力: ${card.ability}`);
    }
    return lines.join("\n");
  }

  /**
   * Get color name
   */
  private getColorName(color: number): string {
    const names: Record<number, string> = {
      1: "赤", 2: "黄", 3: "青", 4: "緑", 5: "紫", 6: "無",
    };
    return names[color] ?? "不明";
  }

  /**
   * Build ParsedAction from action type and parameters
   */
  private buildParsedAction(actionType: string, parameters: Record<string, unknown>): ParsedAction | null {
    const playerId = this.currentContext?.myPlayerId;
    if (!playerId) return null;

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
        // Find card in hand to get catalogId
        const myPlayer = this.currentContext?.gameState.players[playerId];
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
        const promptId = this.currentContext?.choice?.promptId;
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
  private describeActionForProposal(actionType: string, parameters: Record<string, unknown>): string {
    const playerId = this.currentContext?.myPlayerId;
    const myPlayer = playerId ? this.currentContext?.gameState.players[playerId] : null;

    switch (actionType) {
      case "summon": {
        const cardId = typeof parameters.cardId === "string" ? parameters.cardId : null;
        if (cardId && myPlayer) {
          const card = myPlayer.hand.find((c) => c.id === cardId);
          if (card && hasCardInfo(card)) {
            const info = this.catalogLookup(card.catalogId);
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
            const info = this.catalogLookup(unit.catalogId);
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
            const info = this.catalogLookup(card.catalogId);
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
            const info = this.catalogLookup(unit.catalogId);
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
            const info = this.catalogLookup(unit.catalogId);
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

  /**
   * Send a message to the AI and get a response
   */
  private async sendMessage(userContent: string): Promise<string> {
    // Add user message to thread
    this.thread.push({
      role: "user",
      content: userContent,
      timestamp: Date.now(),
    });

    // Build API messages
    const apiMessages: Anthropic.MessageParam[] = this.thread.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Call API with tool support
    let response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: this.getSystemPrompt(),
      tools: this.tools,
      messages: apiMessages,
    });

    // Handle tool use loop
    while (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        const result = this.executeTool(toolUse.name, toolUse.input);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      // Add assistant's tool use to messages
      apiMessages.push({
        role: "assistant",
        content: response.content,
      });

      // Add tool results
      apiMessages.push({
        role: "user",
        content: toolResults,
      });

      // Continue conversation
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: this.getSystemPrompt(),
        tools: this.tools,
        messages: apiMessages,
      });
    }

    // Extract response text
    const responseText = this.extractText(response.content);

    // Add assistant response to thread
    this.thread.push({
      role: "assistant",
      content: responseText,
      timestamp: Date.now(),
    });

    return responseText;
  }

  /**
   * Extract text from Claude response
   */
  private extractText(content: Anthropic.ContentBlock[]): string {
    return content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");
  }

  /**
   * Set processing state and notify via callback
   */
  private setProcessing(processing: boolean, reason?: string): void {
    this.isProcessing = processing;
    this.onProcessingChange?.(processing, reason);
  }

  // ============ Public API ============

  /**
   * Push game state update (triggers debounced analysis)
   */
  pushGameStateUpdate(gameState: GameState, context?: DecisionContext): void {
    if (context) {
      this.currentContext = context;
    }

    if (this.previousState) {
      const diff = this.formatStateDiff(this.previousState, gameState);
      if (diff) {
        this.pendingEvents.push(`[状態変化]\n${diff}`);
        this.scheduleAnalysis();
      }
    }
    this.previousState = structuredClone(gameState);
    this.currentState = gameState;
  }

  /**
   * Push a game event
   */
  pushGameEvent(event: string): void {
    this.pendingEvents.push(`[ゲームイベント] ${event}`);
    this.scheduleAnalysis();
  }

  /**
   * Add pilot comment (triggers immediate response)
   * User comments are never debounced - they are always processed immediately
   */
  async addPilotComment(comment: string): Promise<void> {
    // Cancel pending auto-analysis
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Combine pending events with the comment
    const context = this.pendingEvents.length > 0
      ? this.pendingEvents.join("\n\n") + "\n\n"
      : "";
    this.pendingEvents = [];

    const message = `${context}[パイロット] ${comment}`;

    // Wait for any ongoing processing to complete
    // User comments are never dropped - they wait and execute
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

  /**
   * Request strategic analysis (/think command)
   */
  async requestAnalysis(): Promise<string> {
    if (!this.currentContext) {
      return "ゲーム状態がまだ取得されていません";
    }

    // Cancel pending auto-analysis
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

  /**
   * Request advice for specific action (/advice command)
   */
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

  /**
   * Evaluate a user action
   */
  async evaluateAction(
    actionType: string,
    actionDescription: string
  ): Promise<{ evaluation: string; recorded: boolean }> {
    if (!this.currentContext) {
      return { evaluation: "評価できませんでした", recorded: false };
    }

    // Wait for any ongoing processing to complete
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

      // Parse JSON from response
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

      // Record if notable
      if (isNotable) {
        const record: LearningRecord = {
          timestamp: Date.now(),
          gameRound: this.currentContext.gameState.game.round,
          gameTurn: this.currentContext.gameState.game.turn,
          situation: this.summarizeSituation(),
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

  /**
   * Set current decision context
   */
  setContext(context: DecisionContext): void {
    this.currentContext = context;
  }

  /**
   * Get thread history
   */
  getThread(): ThreadMessage[] {
    return [...this.thread];
  }

  /**
   * Clear thread
   */
  clearThread(): void {
    this.thread = [];
    this.pendingEvents = [];
    this.previousState = null;
    this.currentState = null;
    this.currentContext = null;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Get learning records
   */
  getLearningRecords(): LearningRecord[] {
    return [...this.learningRecords];
  }

  /**
   * Load learning records
   */
  loadRecords(records: LearningRecord[]): void {
    this.learningRecords = records;
  }

  /**
   * Check if rules are loaded
   */
  areRulesLoaded(): boolean {
    return this.rulesLoaded;
  }

  // ============ Action Proposal API ============

  /**
   * Check if there's a pending action proposal
   */
  hasPendingAction(): boolean {
    return this.pendingAction !== null && this.pendingAction.status === "pending";
  }

  /**
   * Get the current pending action proposal
   */
  getPendingAction(): ProposedAction | null {
    return this.pendingAction;
  }

  /**
   * Confirm and return the pending action for execution
   */
  confirmPendingAction(): ProposedAction | null {
    if (!this.pendingAction || this.pendingAction.status !== "pending") {
      return null;
    }
    this.pendingAction.status = "approved";
    const action = this.pendingAction;
    this.pendingAction = null;
    return action;
  }

  /**
   * Reject the pending action
   */
  rejectPendingAction(reason?: string): void {
    if (!this.pendingAction) return;
    this.pendingAction.status = "rejected";
    if (reason) {
      this.pendingEvents.push(`[パイロット] アクション提案を却下: ${reason}`);
    }
    this.pendingAction = null;
  }

  /**
   * Request AI to interpret pilot instruction and propose action
   */
  async requestActionFromInstruction(instruction: string): Promise<void> {
    if (!this.currentContext) {
      throw new Error("ゲーム状態がまだ取得されていません");
    }

    // Cancel pending auto-analysis
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

    // Wait for any ongoing processing to complete
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

  /**
   * Schedule debounced auto-analysis
   */
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

  /**
   * Execute automatic analysis of pending events
   */
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

  /**
   * Format state diff as human-readable text
   */
  private formatStateDiff(prev: GameState, curr: GameState): string {
    const lines: string[] = [];

    if (prev.game.round !== curr.game.round) {
      lines.push(`ラウンド: ${prev.game.round} → ${curr.game.round}`);
    }
    if (prev.game.turn !== curr.game.turn) {
      lines.push(`ターン: ${prev.game.turn} → ${curr.game.turn}`);
    }

    for (const [playerId, currPlayer] of Object.entries(curr.players)) {
      const prevPlayer = prev.players[playerId];
      if (!prevPlayer) continue;

      const label = playerId.length > 8 ? playerId.slice(0, 8) : playerId;

      if (prevPlayer.life.current !== currPlayer.life.current) {
        lines.push(`${label} ライフ: ${prevPlayer.life.current} → ${currPlayer.life.current}`);
      }
      if (prevPlayer.cp.current !== currPlayer.cp.current) {
        lines.push(`${label} CP: ${prevPlayer.cp.current} → ${currPlayer.cp.current}`);
      }
      if (prevPlayer.hand.length !== currPlayer.hand.length) {
        lines.push(`${label} 手札: ${prevPlayer.hand.length} → ${currPlayer.hand.length}枚`);
      }

      // Field changes
      const prevIds = new Set(prevPlayer.field.map((u) => u.id));
      const currIds = new Set(currPlayer.field.map((u) => u.id));

      for (const unit of prevPlayer.field) {
        if (!currIds.has(unit.id)) {
          const info = this.catalogLookup(unit.catalogId);
          lines.push(`${label} フィールド: -${info?.name ?? unit.catalogId}`);
        }
      }

      for (const unit of currPlayer.field) {
        if (!prevIds.has(unit.id)) {
          const info = this.catalogLookup(unit.catalogId);
          lines.push(`${label} フィールド: +${info?.name ?? unit.catalogId} (BP:${unit.bp})`);
        } else {
          const prevUnit = prevPlayer.field.find((u) => u.id === unit.id);
          if (prevUnit && (prevUnit.bp !== unit.bp || prevUnit.active !== unit.active)) {
            const info = this.catalogLookup(unit.catalogId);
            const changes: string[] = [];
            if (prevUnit.bp !== unit.bp) changes.push(`BP:${prevUnit.bp}→${unit.bp}`);
            if (prevUnit.active !== unit.active) changes.push(unit.active ? "行動可能" : "行動済み");
            lines.push(`${label} ${info?.name ?? unit.catalogId}: ${changes.join(", ")}`);
          }
        }
      }

      if (prevPlayer.joker.gauge !== currPlayer.joker.gauge) {
        lines.push(`${label} JOKERゲージ: ${prevPlayer.joker.gauge}% → ${currPlayer.joker.gauge}%`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Summarize current situation for learning record
   */
  private summarizeSituation(): string {
    if (!this.currentContext) return "不明";

    const { gameState, myPlayerId } = this.currentContext;
    const myPlayer = gameState.players[myPlayerId];
    const opponentId = Object.keys(gameState.players).find((id) => id !== myPlayerId);
    const opponent = opponentId ? gameState.players[opponentId] : null;

    const parts: string[] = [];
    parts.push(`R${gameState.game.round}T${gameState.game.turn}`);

    if (myPlayer) {
      parts.push(`自:L${myPlayer.life.current}CP${myPlayer.cp.current}F${myPlayer.field.length}`);
    }
    if (opponent) {
      parts.push(`敵:L${opponent.life.current}CP${opponent.cp.current}F${opponent.field.length}`);
    }

    return parts.join(" ");
  }
}
