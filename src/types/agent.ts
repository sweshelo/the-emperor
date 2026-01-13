/**
 * Agent-related type definitions
 */

import type { GameState, ChoicesMessage, McpClientPayload } from "./game.ts";

/**
 * Agent operating mode
 */
export type AgentMode = "autonomous" | "buddy";

/**
 * Mode-specific configuration
 */
export interface ModeConfig {
  /** Operating mode */
  mode: AgentMode;
  /** Show detailed game state in buddy mode */
  verbose?: boolean;
}

/**
 * Context provided to the agent for decision making
 */
export interface DecisionContext {
  /** Current game state */
  gameState: GameState;
  /** Current choice prompt (if any) */
  choice: ChoicesMessage | null;
  /** Player ID of this agent */
  myPlayerId: string;
}

/**
 * Parsed action from agent's decision
 */
export interface ParsedAction {
  /** Action type (e.g., "UnitDrive", "Attack", "Choose") */
  type: string;
  /** Action payload to send to server */
  payload: McpClientPayload;
}

/**
 * Model type for Claude agent
 */
export type ModelType = "light" | "think";

/**
 * Agent configuration
 */
export interface AgentConfig {
  /** Anthropic API key */
  apiKey: string;
  /** Model type: "light" for fast responses, "think" for extended thinking */
  modelType?: ModelType;
  /** Custom model override (if not using modelType presets) */
  model?: string;
  /** Maximum tokens for response (defaults to 1024) */
  maxTokens?: number;
  /** Budget tokens for extended thinking (only used with "think" modelType) */
  thinkingBudget?: number;
}

/**
 * Agent interface for decision making
 */
export interface Agent {
  /**
   * Decide the next action based on the decision context
   */
  decideAction(context: DecisionContext): Promise<ParsedAction>;

  /**
   * Decide mulligan (keep or redraw starting hand)
   */
  decideMulligan?(hand: import("../../suit/types/game/card/index.ts").IAtom[], playerId: string): Promise<ParsedAction>;

  /**
   * Get agent name
   */
  getName(): string;

  /**
   * Clear any internal state (e.g., conversation history)
   */
  clearHistory?(): void;
}

/**
 * Available action that can be taken
 */
export interface AvailableAction {
  /** Action type */
  type: string;
  /** Human-readable description */
  description: string;
  /** Required parameters */
  parameters: Record<string, string>;
}

/**
 * Card with catalog information for display
 */
export interface CardWithCatalogInfo {
  /** Runtime card ID */
  id: string;
  /** Catalog ID for lookup */
  catalogId: string;
  /** Card name from catalog */
  name?: string;
  /** Card cost */
  cost?: number;
  /** Card ability text */
  ability?: string;
  /** Battle power (for units) */
  bp?: number[];
}
