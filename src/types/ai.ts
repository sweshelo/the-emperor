/**
 * AI-related type definitions
 */

import type { ProposedAction } from "./agent.ts";

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
 * Message type for TUI log display
 */
export interface TuiMessage {
  type: "system" | "game" | "user" | "error" | "ai";
  content: string;
  timestamp?: number;
}

/**
 * Tool input types for AI
 */
export interface LookupCardInput {
  catalogId: string;
}

/**
 * Input type for propose_action tool
 */
export interface ProposeActionInput {
  actionType: string;
  parameters: Record<string, unknown>;
  reasoning: string;
}
