/**
 * Common formatters for agent module
 */

import { type CatalogCard, isJokerCard } from "../../schemas/catalog.ts";

/**
 * Color ID to name mapping
 */
export const COLOR_NAMES: Record<number, string> = {
  1: "Red",
  2: "Yellow",
  3: "Blue",
  4: "Green",
  5: "Purple",
  6: "Colorless",
};

/**
 * Japanese color names
 */
export const COLOR_NAMES_JP: Record<number, string> = {
  1: "赤",
  2: "黄",
  3: "青",
  4: "緑",
  5: "紫",
  6: "無",
};

/**
 * Get color name in specified language
 */
export function getColorName(color: number, japanese = false): string {
  const names = japanese ? COLOR_NAMES_JP : COLOR_NAMES;
  return names[color] ?? (japanese ? "不明" : "Unknown");
}

/**
 * Get display info from catalog card (handles both regular and JOKER cards)
 */
export function getCardDisplayInfo(card: CatalogCard | undefined): { bp: string; color: string } {
  if (!card) {
    return { bp: "", color: "?" };
  }
  if (isJokerCard(card)) {
    return { bp: "", color: "JOKER" };
  }
  const bp = card.bp ? ` BP:${card.bp.join("/")}` : "";
  const color = COLOR_NAMES[card.color] ?? "?";
  return { bp, color };
}

/**
 * Format card info for display (Japanese)
 */
export function formatCardInfoJp(card: CatalogCard): string {
  if (isJokerCard(card)) {
    return `[JOKER] ${card.name}\n効果: ${card.ability}`;
  }
  const lines = [
    `[${card.id}] ${card.name}`,
    `種類: ${card.type} / 色: ${getColorName(card.color, true)}`,
    `コスト: ${card.cost}`,
  ];
  if (card.bp) {
    lines.push(`BP: ${card.bp.join("/")}`);
  }
  if (card.ability) {
    lines.push(`能力: ${card.ability}`);
  }
  return lines.join("\n");
}
