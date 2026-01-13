/**
 * Zod schemas for MCP tool argument validation
 */

import { z } from "zod";

// ============================================
// Primitive argument schemas
// ============================================

/**
 * Parse string argument from unknown input
 */
export function parseString(
  args: Record<string, unknown>,
  key: string
): string {
  const result = z.string().safeParse(args[key]);
  if (!result.success) {
    throw new Error(`Expected ${key} to be a string`);
  }
  return result.data;
}

/**
 * Parse boolean argument from unknown input
 */
export function parseBoolean(
  args: Record<string, unknown>,
  key: string
): boolean {
  const result = z.boolean().safeParse(args[key]);
  if (!result.success) {
    throw new Error(`Expected ${key} to be a boolean`);
  }
  return result.data;
}

/**
 * Parse number argument from unknown input
 */
export function parseNumber(
  args: Record<string, unknown>,
  key: string
): number {
  const result = z.number().safeParse(args[key]);
  if (!result.success) {
    throw new Error(`Expected ${key} to be a number`);
  }
  return result.data;
}

/**
 * Parse optional number argument with default value
 */
export function parseOptionalNumber(
  args: Record<string, unknown>,
  key: string,
  defaultValue: number
): number {
  const value = args[key];
  if (value === undefined || value === null) return defaultValue;
  const result = z.number().safeParse(value);
  if (!result.success) {
    throw new Error(`Expected ${key} to be a number`);
  }
  return result.data;
}

/**
 * Parse optional string array argument
 */
export function parseOptionalStringArray(
  args: Record<string, unknown>,
  key: string
): string[] | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  const result = z.array(z.string()).safeParse(value);
  if (!result.success) {
    throw new Error(`Expected ${key} to be a string array`);
  }
  return result.data;
}

/**
 * Parse optional object argument
 */
export function parseOptionalObject(
  args: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  const result = z.record(z.string(), z.unknown()).safeParse(value);
  if (!result.success) {
    throw new Error(`Expected ${key} to be an object`);
  }
  return result.data;
}

// ============================================
// Plain object type guard (for deep merge)
// ============================================

/**
 * Type guard to check if a value is a plain object (not an array)
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// ============================================
// Card type schema
// ============================================

export const cardTypeSchema = z.enum([
  "unit",
  "trigger",
  "intercept",
  "advanced_unit",
  "virus",
  "joker",
]);

export type CardType = z.infer<typeof cardTypeSchema>;

/**
 * Parse card type argument
 */
export function parseCardType(
  args: Record<string, unknown>,
  key: string
): CardType {
  const value = args[key];
  if (typeof value !== "string") {
    throw new Error(`Expected ${key} to be a string`);
  }
  const result = cardTypeSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Invalid card type: ${value}. Must be one of: unit, trigger, intercept, advanced_unit, virus, joker`
    );
  }
  return result.data;
}
