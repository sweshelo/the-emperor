/**
 * Zod schemas for catalog card validation
 */

import { z } from "zod";
import { cardTypeSchema } from "./mcp-args.ts";

// ============================================
// Catalog card schema
// ============================================

export const catalogCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  rarity: z.string(),
  cost: z.number(),
  color: z.number(),
  bp: z.tuple([z.number(), z.number(), z.number()]).optional(),
  ability: z.string(),
  type: cardTypeSchema,
  species: z.array(z.string()).optional(),
  gauge: z.string().optional(),
});

export type CatalogCard = z.infer<typeof catalogCardSchema>;

/**
 * Type guard to check if an item is a valid CatalogCard
 */
export function isValidCatalogCard(item: unknown): item is CatalogCard {
  return catalogCardSchema.safeParse(item).success;
}
