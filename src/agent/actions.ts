/**
 * Action parsing and validation for Claude responses
 */

import { z } from "zod";
import type { ParsedAction } from "../types/agent.ts";
import type { McpClientPayload } from "../types/game.ts";

// ============================================
// Action schemas
// ============================================

/**
 * Schema for summon unit action
 */
const summonUnitActionSchema = z.object({
  type: z.literal("UnitDrive"),
  player: z.string(),
  target: z.object({
    id: z.string(),
  }),
});

/**
 * Schema for evolve unit action
 */
const evolveUnitActionSchema = z.object({
  type: z.literal("EvolveDrive"),
  player: z.string(),
  target: z.object({
    id: z.string(),
  }),
  source: z.object({
    id: z.string(),
  }),
});

/**
 * Schema for JOKER action
 */
const jokerDriveActionSchema = z.object({
  type: z.literal("JokerDrive"),
  player: z.string(),
  target: z.object({
    id: z.string(),
  }),
});

/**
 * Schema for trigger set action
 */
const triggerSetActionSchema = z.object({
  type: z.literal("TriggerSet"),
  player: z.string(),
  target: z.object({
    id: z.string(),
    catalogId: z.string(),
  }),
});

/**
 * Schema for attack action
 */
const attackActionSchema = z.object({
  type: z.literal("Attack"),
  player: z.string(),
  target: z.object({
    id: z.string(),
  }),
});

/**
 * Schema for boot ability action
 */
const bootActionSchema = z.object({
  type: z.literal("Boot"),
  player: z.string(),
  target: z.object({
    id: z.string(),
  }),
});

/**
 * Schema for withdrawal action
 */
const withdrawalActionSchema = z.object({
  type: z.literal("Withdrawal"),
  player: z.string(),
  target: z.object({
    id: z.string(),
  }),
});

/**
 * Schema for choose action (responding to prompts)
 * choice is string[] | undefined (required field but can be undefined)
 */
const chooseActionSchema = z.object({
  type: z.literal("Choose"),
  promptId: z.string(),
  choice: z.union([z.array(z.string()), z.undefined()]),
});

/**
 * Schema for continue/end turn action
 */
const continueActionSchema = z.object({
  type: z.literal("Continue"),
  promptId: z.string(),
  player: z.string(),
});

/**
 * Schema for mulligan action
 */
const mulliganActionSchema = z.object({
  type: z.literal("Mulligan"),
  player: z.string(),
  action: z.enum(["done", "retry"]),
});

/**
 * Union of all action schemas
 */
const actionPayloadSchema = z.discriminatedUnion("type", [
  summonUnitActionSchema,
  evolveUnitActionSchema,
  jokerDriveActionSchema,
  triggerSetActionSchema,
  attackActionSchema,
  bootActionSchema,
  withdrawalActionSchema,
  chooseActionSchema,
  continueActionSchema,
  mulliganActionSchema,
]);

/**
 * Schema for Claude's complete response
 */
const claudeResponseSchema = z.object({
  reasoning: z.string(),
  action: actionPayloadSchema,
});

// ============================================
// Parsing functions
// ============================================

/**
 * Extract JSON from Claude's response text
 * Claude may include markdown code blocks or additional text
 */
function extractJson(text: string): string {
  // Try to find JSON in code block first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const extracted = codeBlockMatch[1];
    if (extracted !== undefined) {
      return extracted.trim();
    }
  }

  // Try to find raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const extracted = jsonMatch[0];
    if (extracted !== undefined) {
      return extracted;
    }
  }

  throw new Error("No JSON found in response");
}

/**
 * Parse and validate Claude's response into a ParsedAction
 */
export function parseClaudeResponse(responseText: string): ParsedAction {
  // Extract JSON from response
  const jsonText = extractJson(responseText);

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Invalid JSON in response: ${jsonText.slice(0, 100)}...`);
  }

  // Validate with Zod schema
  const result = claudeResponseSchema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
    throw new Error(`Invalid action format: ${errors}`);
  }

  // Convert to ParsedAction - action type already validated by Zod
  const action = result.data.action;

  return {
    type: action.type,
    payload: action,
  };
}

/**
 * Validate a raw action object (for testing or direct input)
 */
export function validateAction(action: unknown): McpClientPayload {
  const result = actionPayloadSchema.safeParse(action);
  if (!result.success) {
    const errors = result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
    throw new Error(`Invalid action: ${errors}`);
  }
  return result.data;
}

/**
 * Check if a response indicates the agent wants to end turn
 */
export function isEndTurnAction(action: ParsedAction): boolean {
  return action.type === "Continue";
}

/**
 * Check if a response is a choice response
 */
export function isChoiceAction(action: ParsedAction): boolean {
  return action.type === "Choose";
}

/**
 * Check if a response is a mulligan decision
 */
export function isMulliganAction(action: ParsedAction): boolean {
  return action.type === "Mulligan";
}

// Export schemas for testing
export {
  claudeResponseSchema,
  actionPayloadSchema,
  summonUnitActionSchema,
  attackActionSchema,
  chooseActionSchema,
  mulliganActionSchema,
};
