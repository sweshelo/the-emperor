/**
 * Zod schemas for API response validation
 */

import { z } from "zod";

// ============================================
// Sandbox API response schemas
// ============================================

export const sandboxStatusSchema = z.object({
  enabled: z.boolean(),
  roomId: z.string(),
  roomExists: z.boolean(),
  playerCount: z.number(),
});

export type SandboxStatus = z.infer<typeof sandboxStatusSchema>;

export const sandboxCreateResponseSchema = z.object({
  success: z.boolean(),
  roomId: z.string(),
});

export type SandboxCreateResponse = z.infer<typeof sandboxCreateResponseSchema>;

export const sandboxLoadStateResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  round: z.number(),
  turn: z.number(),
});

export type SandboxLoadStateResponse = z.infer<typeof sandboxLoadStateResponseSchema>;

export const sandboxStartResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  playerCount: z.number(),
});

export type SandboxStartResponse = z.infer<typeof sandboxStartResponseSchema>;

export const sandboxDestroyResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export type SandboxDestroyResponse = z.infer<typeof sandboxDestroyResponseSchema>;

/**
 * Parse and validate sandbox status response
 */
export function parseSandboxStatus(data: unknown): SandboxStatus {
  const result = sandboxStatusSchema.safeParse(data);
  if (!result.success) {
    throw new Error("Invalid sandbox status response");
  }
  return result.data;
}

/**
 * Parse and validate sandbox create response
 */
export function parseSandboxCreateResponse(data: unknown): SandboxCreateResponse {
  const result = sandboxCreateResponseSchema.safeParse(data);
  if (!result.success) {
    throw new Error("Invalid create room response");
  }
  return result.data;
}

/**
 * Parse and validate sandbox load state response
 */
export function parseSandboxLoadStateResponse(data: unknown): SandboxLoadStateResponse {
  const result = sandboxLoadStateResponseSchema.safeParse(data);
  if (!result.success) {
    throw new Error("Invalid load state response");
  }
  return result.data;
}

/**
 * Parse and validate sandbox start response
 */
export function parseSandboxStartResponse(data: unknown): SandboxStartResponse {
  const result = sandboxStartResponseSchema.safeParse(data);
  if (!result.success) {
    throw new Error("Invalid start game response");
  }
  return result.data;
}

/**
 * Parse and validate sandbox destroy response
 */
export function parseSandboxDestroyResponse(data: unknown): SandboxDestroyResponse {
  const result = sandboxDestroyResponseSchema.safeParse(data);
  if (!result.success) {
    throw new Error("Invalid destroy room response");
  }
  return result.data;
}

// ============================================
// WebSocket message type guard
// ============================================

// Import the actual ServerMessage type for the type guard
import type { ServerMessage, GameState, ChoicesMessage } from "../types/game.ts";

/**
 * Type guard to check if data has the shape of a ServerMessage
 * (has action and payload properties)
 */
export function isServerMessage(data: unknown): data is ServerMessage {
  if (typeof data !== "object" || data === null) return false;
  return "action" in data && "payload" in data;
}

// ============================================
// Server message payload schemas
// ============================================

/**
 * Schema for GameState (Sync payload body)
 * Validates minimum required structure - actual GameState has more properties
 */
export const gameStateSchema = z.object({
  rule: z.object({}).passthrough(),
  game: z.object({
    round: z.number(),
    turn: z.number(),
  }).passthrough(),
  players: z.record(z.string(), z.object({}).passthrough()),
});

/**
 * Type guard for GameState
 * Uses zod schema to validate, then narrows the type
 */
export function isValidGameState(data: unknown): data is GameState {
  return gameStateSchema.safeParse(data).success;
}

/**
 * Parse and validate GameState from Sync payload body
 * Returns the data if valid, null otherwise
 */
export function parseGameState(data: unknown): GameState | null {
  if (isValidGameState(data)) {
    return data;
  }
  return null;
}

/**
 * Schema for Choices payload
 */
export const choicesPayloadSchema = z.object({
  title: z.string(),
  isCancelable: z.boolean().optional(),
  type: z.enum(["card", "option", "intercept", "unit", "block"]),
  items: z.array(z.object({}).passthrough()),
  count: z.number().optional(),
});

/**
 * Type guard for Choices
 * Uses zod schema to validate, then narrows the type
 */
export function isValidChoices(data: unknown): data is ChoicesMessage["choices"] {
  return choicesPayloadSchema.safeParse(data).success;
}

/**
 * Parse and validate Choices from payload
 * Returns the data if valid, null otherwise
 */
export function parseChoices(data: unknown): ChoicesMessage["choices"] | null {
  if (isValidChoices(data)) {
    return data;
  }
  return null;
}
