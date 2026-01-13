/**
 * Zod schemas for catalog card validation
 */

import { z } from "zod";
import { cardTypeSchema } from "./mcp-args.ts";

// ============================================
// Catalog card schema
// ============================================

/**
 * Schema for regular cards (unit, trigger, intercept, advanced_unit, virus)
 */
const regularCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  rarity: z.string(),
  cost: z.number(),
  color: z.number(),
  bp: z.tuple([z.number(), z.number(), z.number()]).optional(),
  ability: z.string(),
  type: z.enum(["unit", "trigger", "intercept", "advanced_unit", "virus"]),
  species: z.array(z.string()).optional(),
  originality: z.number().optional(),
  img: z.string().optional(),
  info: z.object({
    version: z.number(),
    number: z.number(),
  }).optional(),
});

/**
 * Schema for JOKER cards (no rarity, color, or bp)
 */
const jokerCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  cost: z.number(),
  ability: z.string(),
  type: z.literal("joker"),
  originality: z.number().optional(),
  img: z.string().optional(),
  info: z.object({
    version: z.number(),
    number: z.number(),
  }).optional(),
  gauge: z.string().optional(),
});

/**
 * Combined catalog card schema that accepts both regular cards and JOKER cards
 */
export const catalogCardSchema = z.union([regularCardSchema, jokerCardSchema]);

export type CatalogCard = z.infer<typeof catalogCardSchema>;

/**
 * Type guard to check if an item is a valid CatalogCard
 */
export function isValidCatalogCard(item: unknown): item is CatalogCard {
  return catalogCardSchema.safeParse(item).success;
}

/**
 * Type guard to check if a catalog card is a JOKER card
 */
export function isJokerCard(card: CatalogCard): card is z.infer<typeof jokerCardSchema> {
  return card.type === "joker";
}
