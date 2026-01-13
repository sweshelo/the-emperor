/**
 * Claude API-based AI agent implementation
 */

import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type { DecisionContext, ParsedAction, AgentConfig, Agent } from "../types/agent.ts";
import type { IAtom } from "../../suit/types/game/card/index.ts";
import type { CatalogCard } from "../schemas/catalog.ts";
import { SYSTEM_PROMPT, buildDecisionPrompt, buildMulliganPrompt } from "./prompts.ts";
import { parseClaudeResponse } from "./actions.ts";

/**
 * Default configuration values
 */
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TOKENS = 1024;

/**
 * Required configuration with defaults applied
 */
interface ResolvedConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
}

/**
 * Claude API-based agent for playing CODE OF JOKER
 */
export class ClaudeAgent implements Agent {
  private client: Anthropic;
  private config: ResolvedConfig;
  private conversationHistory: MessageParam[] = [];
  private catalogLookup: (id: string) => CatalogCard | undefined;

  constructor(
    private name: string,
    config: AgentConfig,
    catalogLookup: (id: string) => CatalogCard | undefined
  ) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model ?? DEFAULT_MODEL,
      maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    };

    this.client = new Anthropic({
      apiKey: this.config.apiKey,
    });

    this.catalogLookup = catalogLookup;
  }

  /**
   * Get agent name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Decide the next action based on the current game context
   */
  async decideAction(context: DecisionContext): Promise<ParsedAction> {
    // Build the prompt
    const userPrompt = buildDecisionPrompt(context, this.catalogLookup);

    console.log("[ClaudeAgent] Requesting decision from Claude...");

    // Call Claude API
    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system: SYSTEM_PROMPT,
      messages: [
        ...this.conversationHistory,
        { role: "user", content: userPrompt },
      ],
    });

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
   * Decide mulligan (keep or redraw starting hand)
   */
  async decideMulligan(hand: IAtom[], playerId: string): Promise<ParsedAction> {
    const prompt = buildMulliganPrompt(hand, playerId, this.catalogLookup);

    console.log("[ClaudeAgent] Requesting mulligan decision...");

    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

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
   */
  private extractResponseText(content: Anthropic.ContentBlock[]): string {
    const textParts: string[] = [];

    for (const block of content) {
      if (block.type === "text") {
        textParts.push(block.text);
      }
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
