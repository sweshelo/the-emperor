/**
 * Anthropic API client wrapper for UnifiedAI
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ThreadMessage } from "../../types/ai.ts";
import { AI_TOOLS } from "./tools.ts";
import { getSystemPrompt } from "./system-prompt.ts";

/**
 * Configuration for APIClient
 */
export interface APIClientConfig {
  apiKey: string;
  model?: string;
}

/**
 * Tool execution callback type
 */
export type ToolExecutor = (toolName: string, toolInput: unknown) => string;

/**
 * API client for Claude interactions
 */
export class APIClient {
  private client: Anthropic;
  private model: string;

  constructor(config: APIClientConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model ?? "claude-3-5-haiku-20241022";
  }

  /**
   * Send a message and handle tool use loop
   */
  async sendMessage(
    thread: ThreadMessage[],
    userContent: string,
    gameRules: string,
    executeToolCall: ToolExecutor
  ): Promise<string> {
    const apiMessages: Anthropic.MessageParam[] = thread.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    apiMessages.push({ role: "user", content: userContent });

    let response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: getSystemPrompt(gameRules),
      tools: AI_TOOLS,
      messages: apiMessages,
    });

    while (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        const result = executeToolCall(toolUse.name, toolUse.input);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      apiMessages.push({
        role: "assistant",
        content: response.content,
      });

      apiMessages.push({
        role: "user",
        content: toolResults,
      });

      response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: getSystemPrompt(gameRules),
        tools: AI_TOOLS,
        messages: apiMessages,
      });
    }

    return this.extractText(response.content);
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
}
