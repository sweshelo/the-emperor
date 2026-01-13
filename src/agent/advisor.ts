/**
 * AI Advisor Service for Buddy Mode
 * Provides AI-powered evaluation and advice for user decisions
 */

import Anthropic from "@anthropic-ai/sdk";
import type { DecisionContext } from "../types/agent.ts";
import type { CatalogCard } from "../schemas/catalog.ts";
import { formatGameStatePrompt, formatChoicePrompt, formatAvailableActionsPrompt } from "./prompts.ts";

/**
 * Configuration for AI Advisor
 */
export interface AdvisorConfig {
  apiKey: string;
  model?: string;
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
  score: number; // -1 (bad), 0 (neutral), 1 (good)
  reasoning: string;
}

/**
 * AI Advisor class for evaluating moves and providing advice
 */
export class AIAdvisor {
  private client: Anthropic;
  private model: string;
  private learningRecords: LearningRecord[] = [];
  private catalogLookup: (id: string) => CatalogCard | undefined;

  constructor(
    config: AdvisorConfig,
    catalogLookup: (id: string) => CatalogCard | undefined
  ) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
    this.model = config.model ?? "claude-sonnet-4-20250514";
    this.catalogLookup = catalogLookup;
  }

  /**
   * Think about the current game situation and provide analysis
   */
  async think(context: DecisionContext): Promise<string> {
    const gameStatePrompt = formatGameStatePrompt(context, this.catalogLookup);
    const choicePrompt = context.choice ? formatChoicePrompt(context.choice) : "";
    const actionsPrompt = formatAvailableActionsPrompt(context, this.catalogLookup);

    const prompt = `あなたはCODE OF JOKERのアドバイザーです。現在のゲーム状況を分析し、日本語でアドバイスを提供してください。

${gameStatePrompt}

${choicePrompt}

${actionsPrompt}

以下の観点から状況を分析してください:
1. 現在の盤面の優劣
2. 相手が取りうる行動の予測
3. 推奨される行動とその理由
4. 注意すべきリスク

分析結果を簡潔に日本語で説明してください。`;

    console.log("[Advisor] AI分析中...");

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = this.extractText(response.content);
    console.log("[Advisor] 分析完了");
    return text;
  }

  /**
   * Evaluate a user's action and record if valuable
   */
  async evaluateAndRecord(
    context: DecisionContext,
    actionType: string,
    actionDescription: string
  ): Promise<{ evaluation: string; recorded: boolean }> {
    const gameStatePrompt = formatGameStatePrompt(context, this.catalogLookup);

    const prompt = `あなたはCODE OF JOKERの対戦分析者です。

${gameStatePrompt}

プレイヤーが選択した行動:
- 種類: ${actionType}
- 詳細: ${actionDescription}

この行動を評価してください。以下のJSON形式で回答してください:
\`\`\`json
{
  "score": <-1, 0, or 1>,
  "evaluation": "<短い評価（良い/普通/悪い）>",
  "reasoning": "<評価の理由（1-2文）>",
  "isNotable": <true or false>
}
\`\`\`

score: -1=悪手, 0=普通, 1=好手
isNotable: 学習価値のある判断かどうか（定石、テクニック、珍しい状況での判断など）`;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      });

      const text = this.extractText(response.content);
      const parsed = this.parseEvaluationResponse(text);

      // Record if notable
      if (parsed.isNotable) {
        const record: LearningRecord = {
          timestamp: Date.now(),
          gameRound: context.gameState.game.round,
          gameTurn: context.gameState.game.turn,
          situation: this.summarizeSituation(context),
          userAction: `${actionType}: ${actionDescription}`,
          evaluation: parsed.evaluation,
          score: parsed.score,
          reasoning: parsed.reasoning,
        };
        this.learningRecords.push(record);
        console.log(`[Advisor] 学習記録を追加: ${parsed.evaluation}`);
        return { evaluation: parsed.reasoning, recorded: true };
      }

      return { evaluation: parsed.reasoning, recorded: false };
    } catch (error) {
      console.error("[Advisor] 評価エラー:", error);
      return { evaluation: "評価できませんでした", recorded: false };
    }
  }

  /**
   * Get specific advice for a potential action
   */
  async getAdviceFor(context: DecisionContext, actionType: string): Promise<string> {
    const gameStatePrompt = formatGameStatePrompt(context, this.catalogLookup);

    const prompt = `あなたはCODE OF JOKERのアドバイザーです。

${gameStatePrompt}

プレイヤーが「${actionType}」を検討しています。
この行動について、メリット・デメリットを含めて日本語でアドバイスしてください。`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    return this.extractText(response.content);
  }

  /**
   * Get all learning records
   */
  getLearningRecords(): LearningRecord[] {
    return [...this.learningRecords];
  }

  /**
   * Load learning records from saved data
   */
  loadRecords(records: LearningRecord[]): void {
    this.learningRecords = records;
    console.log(`[Advisor] ${records.length}件の学習記録を読み込みました`);
  }

  /**
   * Clear learning records
   */
  clearRecords(): void {
    this.learningRecords = [];
  }

  /**
   * Extract text from Claude response
   */
  private extractText(content: Anthropic.ContentBlock[]): string {
    const textParts: string[] = [];
    for (const block of content) {
      if (block.type === "text") {
        textParts.push(block.text);
      }
    }
    return textParts.join("\n");
  }

  /**
   * Type guard for evaluation response
   */
  private isEvaluationResponse(value: unknown): value is {
    score: number;
    evaluation: string;
    reasoning: string;
    isNotable: boolean;
  } {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    return (
      "score" in value &&
      "evaluation" in value &&
      "reasoning" in value &&
      "isNotable" in value &&
      typeof value.score === "number" &&
      typeof value.evaluation === "string" &&
      typeof value.reasoning === "string" &&
      typeof value.isNotable === "boolean"
    );
  }

  /**
   * Parse evaluation response JSON
   */
  private parseEvaluationResponse(text: string): {
    score: number;
    evaluation: string;
    reasoning: string;
    isNotable: boolean;
  } {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonContent = jsonMatch?.[1];
    if (jsonContent) {
      try {
        const parsed: unknown = JSON.parse(jsonContent);
        if (this.isEvaluationResponse(parsed)) {
          return {
            score: parsed.score,
            evaluation: parsed.evaluation,
            reasoning: parsed.reasoning,
            isNotable: parsed.isNotable,
          };
        }
      } catch {
        // Parse error, return defaults
      }
    }
    return { score: 0, evaluation: "不明", reasoning: text, isNotable: false };
  }

  /**
   * Summarize game situation for record
   */
  private summarizeSituation(context: DecisionContext): string {
    const { gameState, myPlayerId } = context;
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
