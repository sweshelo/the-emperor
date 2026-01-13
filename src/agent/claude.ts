/**
 * Claude API-based AI agent implementation
 */

import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type { DecisionContext, ParsedAction, AgentConfig, Agent, ModelType } from "../types/agent.ts";
import type { IAtom } from "../../suit/types/game/card/index.ts";
import type { CatalogCard } from "../schemas/catalog.ts";
import { buildSystemPrompt, buildDecisionPrompt, buildMulliganPrompt } from "./prompts.ts";
import { parseClaudeResponse } from "./actions.ts";

/**
 * Model presets for different modes
 */
const MODEL_PRESETS = {
  light: "claude-3-5-haiku-20241022",
  think: "claude-sonnet-4-20250514",
} as const;

/**
 * Default configuration values
 */
const DEFAULT_MODEL_TYPE: ModelType = "light";
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_THINKING_BUDGET = 5000;

/**
 * Required configuration with defaults applied
 */
interface ResolvedConfig {
  apiKey: string;
  modelType: ModelType;
  model: string;
  maxTokens: number;
  thinkingBudget: number;
}

/**
 * Claude API-based agent for playing CODE OF JOKER
 */
export class ClaudeAgent implements Agent {
  private client: Anthropic;
  private config: ResolvedConfig;
  private conversationHistory: MessageParam[] = [];
  private catalogLookup: (id: string) => CatalogCard | undefined;
  private systemPromptCache: string | null = null;

  constructor(
    private name: string,
    config: AgentConfig,
    catalogLookup: (id: string) => CatalogCard | undefined
  ) {
    const modelType = config.modelType ?? DEFAULT_MODEL_TYPE;
    this.config = {
      apiKey: config.apiKey,
      modelType,
      model: config.model ?? MODEL_PRESETS[modelType],
      maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
      thinkingBudget: config.thinkingBudget ?? DEFAULT_THINKING_BUDGET,
    };

    this.client = new Anthropic({
      apiKey: this.config.apiKey,
    });

    this.catalogLookup = catalogLookup;

    console.log(`[ClaudeAgent] Initialized with model: ${this.config.model} (${this.config.modelType} mode)`);
  }

  /**
   * Get agent name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get system prompt (loads from files on first call, then caches)
   */
  private async getSystemPrompt(): Promise<string> {
    if (this.systemPromptCache === null) {
      console.log("[ClaudeAgent] Loading system prompt from documentation files...");
      this.systemPromptCache = await buildSystemPrompt();
    }
    return this.systemPromptCache;
  }

  /**
   * Decide the next action based on the current game context
   */
  async decideAction(context: DecisionContext): Promise<ParsedAction> {
    // Build the prompt
    const userPrompt = buildDecisionPrompt(context, this.catalogLookup);
    const systemPrompt = await this.getSystemPrompt();

    console.log(`[ClaudeAgent] Requesting decision from Claude (${this.config.modelType} mode)...`);

    // Call Claude API with or without extended thinking
    const response = await this.callClaude(systemPrompt, userPrompt);

    // Extract text from response
    const responseText = this.extractResponseText(response.content);
    console.log("[ClaudeAgent] Claude response:", responseText.slice(0, 200));

    // Parse the response
    const action = parseClaudeResponse(responseText);

    // Update conversation history (keep last few exchanges for context)
    this.updateConversationHistory(userPrompt, responseText);

    console.log(`[ClaudeAgent] Decided action: ${action.type}`);
    return action;
  }

  /**
   * Call Claude API with appropriate parameters based on model type
   */
  private async callClaude(systemPrompt: string, userPrompt: string): Promise<Anthropic.Message> {
    const messages: MessageParam[] = [
      ...this.conversationHistory,
      { role: "user", content: userPrompt },
    ];

    if (this.config.modelType === "think") {
      // Extended thinking mode
      return await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens + this.config.thinkingBudget,
        thinking: {
          type: "enabled",
          budget_tokens: this.config.thinkingBudget,
        },
        messages,
        system: systemPrompt,
      });
    } else {
      // Light mode (no extended thinking)
      return await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        system: systemPrompt,
        messages,
      });
    }
  }

  /**
   * Decide mulligan (keep or redraw starting hand)
   */
  async decideMulligan(hand: IAtom[], playerId: string): Promise<ParsedAction> {
    const prompt = buildMulliganPrompt(hand, playerId, this.catalogLookup);
    const systemPrompt = await this.getSystemPrompt();

    console.log(`[ClaudeAgent] Requesting mulligan decision (${this.config.modelType} mode)...`);

    // Temporarily clear history for mulligan (it's a fresh decision)
    const savedHistory = this.conversationHistory;
    this.conversationHistory = [];

    const response = await this.callClaude(systemPrompt, prompt);

    // Restore history
    this.conversationHistory = savedHistory;

    const responseText = this.extractResponseText(response.content);
    console.log("[ClaudeAgent] Mulligan response:", responseText.slice(0, 200));

    const action = parseClaudeResponse(responseText);
    console.log(`[ClaudeAgent] Mulligan decision: ${action.type}`);

    return action;
  }

  /**
   * Clear conversation history (e.g., when starting a new game)
   */
  clearHistory(): void {
    this.conversationHistory = [];
    console.log("[ClaudeAgent] Conversation history cleared");
  }

  /**
   * Extract text content from Claude's response
   * Handles both regular text blocks and thinking blocks (for extended thinking mode)
   */
  private extractResponseText(content: Anthropic.ContentBlock[]): string {
    const textParts: string[] = [];

    for (const block of content) {
      if (block.type === "text") {
        textParts.push(block.text);
      }
      // Skip "thinking" blocks - they contain the model's reasoning but not the final answer
    }

    if (textParts.length === 0) {
      throw new Error("No text content in Claude response");
    }

    return textParts.join("\n");
  }

  /**
   * Update conversation history, keeping only recent exchanges
   */
  private updateConversationHistory(userPrompt: string, assistantResponse: string): void {
    this.conversationHistory.push(
      { role: "user", content: userPrompt },
      { role: "assistant", content: assistantResponse }
    );

    // Keep only last 6 messages (3 exchanges) to manage context size
    const maxHistory = 6;
    if (this.conversationHistory.length > maxHistory) {
      this.conversationHistory = this.conversationHistory.slice(-maxHistory);
    }
  }
}
