/**
 * Common type guards for agent module
 */

import type { IAtom } from "../../../suit/types/game/card/index.ts";
import type { ICard } from "../../types/game.ts";
import type { LookupCardInput, ProposeActionInput } from "../../types/ai.ts";

/**
 * Type guard to check if an IAtom has catalogId (is actually an ICard)
 */
export function hasCardInfo(atom: IAtom): atom is ICard {
  return "catalogId" in atom && "lv" in atom;
}

/**
 * Type guard for generic record objects
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Type guard for lookup_card input
 */
export function isLookupCardInput(input: unknown): input is LookupCardInput {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  return "catalogId" in input && typeof input.catalogId === "string";
}

/**
 * Type guard for propose_action input
 */
export function isProposeActionInput(input: unknown): input is ProposeActionInput {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  if (!("actionType" in input) || typeof input.actionType !== "string") {
    return false;
  }
  if (!("parameters" in input) || typeof input.parameters !== "object" || input.parameters === null) {
    return false;
  }
  if (!("reasoning" in input) || typeof input.reasoning !== "string") {
    return false;
  }
  return true;
}

/**
 * Type guard for choice item with catalogId
 */
export interface ItemWithCatalogId {
  id: string;
  catalogId: string;
}

export interface ItemWithBp extends ItemWithCatalogId {
  bp: number;
}

export interface ItemWithName {
  id: string;
  name: string;
}

export function isItemWithCatalogId(item: unknown): item is ItemWithCatalogId {
  if (!isRecord(item)) return false;
  return "id" in item && "catalogId" in item && typeof item.catalogId === "string";
}

export function isItemWithBp(item: unknown): item is ItemWithBp {
  if (!isRecord(item)) return false;
  return isItemWithCatalogId(item) && "bp" in item && typeof item.bp === "number";
}

export function isItemWithName(item: unknown): item is ItemWithName {
  if (!isRecord(item)) return false;
  return "id" in item && "name" in item && typeof item.name === "string";
}

/**
 * Type guard for payload with target ID
 */
export function hasTargetWithId(payload: unknown): payload is { target: { id: string } } {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }
  if (!("target" in payload)) {
    return false;
  }
  const target: unknown = payload.target;
  if (typeof target !== "object" || target === null) {
    return false;
  }
  if (!("id" in target)) {
    return false;
  }
  return typeof target.id === "string";
}
