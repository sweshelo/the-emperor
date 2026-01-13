/**
 * Card catalog access
 */

import catalogData from "../../suit/catalog/catalog.json";

export interface CatalogCard {
  id: string;
  name: string;
  rarity: string;
  cost: number;
  color: number;
  bp?: [number, number, number];
  ability: string;
  type: "unit" | "trigger" | "intercept" | "advanced_unit" | "virus" | "joker";
  species?: string[];
  gauge?: string;
}

/**
 * Catalog service for accessing card information
 */
export class CatalogService {
  private catalog: Map<string, CatalogCard>;

  constructor() {
    this.catalog = new Map();
    this.loadCatalog();
  }

  /**
   * Load catalog data
   */
  private loadCatalog(): void {
    try {
      if (!catalogData) {
        console.error("[Catalog] Catalog data is not available");
        return;
      }

      if (!Array.isArray(catalogData)) {
        console.error("[Catalog] Catalog data is not an array");
        return;
      }

      for (const item of catalogData) {
        if (!this.isValidCatalogCard(item)) {
          console.warn(`[Catalog] Skipping invalid card entry:`, item);
          continue;
        }
        this.catalog.set(item.id, item);
      }
      console.log(`[Catalog] Loaded ${this.catalog.size} cards`);
    } catch (error) {
      console.error("[Catalog] Failed to load catalog data:", error);
    }
  }

  /**
   * Validate if an item has required CatalogCard fields
   */
  private isValidCatalogCard(item: unknown): item is CatalogCard {
    if (typeof item !== "object" || item === null) {
      return false;
    }
    return (
      "id" in item &&
      typeof item.id === "string" &&
      "name" in item &&
      typeof item.name === "string" &&
      "rarity" in item &&
      typeof item.rarity === "string" &&
      "cost" in item &&
      typeof item.cost === "number" &&
      "color" in item &&
      typeof item.color === "number" &&
      "ability" in item &&
      typeof item.ability === "string" &&
      "type" in item &&
      typeof item.type === "string"
    );
  }

  /**
   * Get a card by catalog ID
   */
  getCard(catalogId: string): CatalogCard | undefined {
    return this.catalog.get(catalogId);
  }

  /**
   * Search cards by name (partial match)
   */
  searchByName(query: string): CatalogCard[] {
    const results: CatalogCard[] = [];
    const lowerQuery = query.toLowerCase();

    for (const card of this.catalog.values()) {
      if (card.name.toLowerCase().includes(lowerQuery)) {
        results.push(card);
      }
    }

    return results;
  }

  /**
   * Search cards by ability text
   */
  searchByAbility(query: string): CatalogCard[] {
    const results: CatalogCard[] = [];
    const lowerQuery = query.toLowerCase();

    for (const card of this.catalog.values()) {
      if (card.ability.toLowerCase().includes(lowerQuery)) {
        results.push(card);
      }
    }

    return results;
  }

  /**
   * Get cards by color
   */
  getCardsByColor(color: number): CatalogCard[] {
    const results: CatalogCard[] = [];

    for (const card of this.catalog.values()) {
      if (card.color === color) {
        results.push(card);
      }
    }

    return results;
  }

  /**
   * Get cards by type
   */
  getCardsByType(type: CatalogCard["type"]): CatalogCard[] {
    const results: CatalogCard[] = [];

    for (const card of this.catalog.values()) {
      if (card.type === type) {
        results.push(card);
      }
    }

    return results;
  }

  /**
   * Get cards by cost
   */
  getCardsByCost(cost: number): CatalogCard[] {
    const results: CatalogCard[] = [];

    for (const card of this.catalog.values()) {
      if (card.cost === cost) {
        results.push(card);
      }
    }

    return results;
  }

  /**
   * Get cards by cost range
   */
  getCardsByCostRange(minCost: number, maxCost: number): CatalogCard[] {
    const results: CatalogCard[] = [];

    for (const card of this.catalog.values()) {
      if (card.cost >= minCost && card.cost <= maxCost) {
        results.push(card);
      }
    }

    return results;
  }

  /**
   * Get cards by species
   */
  getCardsBySpecies(species: string): CatalogCard[] {
    const results: CatalogCard[] = [];

    for (const card of this.catalog.values()) {
      if (card.species && card.species.includes(species)) {
        results.push(card);
      }
    }

    return results;
  }

  /**
   * Get all cards
   */
  getAllCards(): CatalogCard[] {
    return Array.from(this.catalog.values());
  }

  /**
   * Get total number of cards
   */
  getCardCount(): number {
    return this.catalog.size;
  }
}

// Singleton instance
export const catalogService = new CatalogService();
