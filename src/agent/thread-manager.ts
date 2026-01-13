/**
 * Thread Manager for AI Analysis
 * Manages conversation thread with debounced API calls
 */

import Anthropic from "@anthropic-ai/sdk";
import type { GameState } from "../types/game.ts";
import type { CatalogCard } from "../schemas/catalog.ts";

/**
 * Message in the AI thread
 */
export interface ThreadMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

/**
 * Sync diff result
 */
export interface SyncDiff {
  round: { from: number; to: number } | null;
  turn: { from: number; to: number } | null;
  players: {
    [playerId: string]: PlayerDiff;
  };
}

/**
 * Player state diff
 */
export interface PlayerDiff {
  life?: { from: number; to: number };
  cp?: { from: number; to: number };
  handCount?: { from: number; to: number };
  fieldChanges?: FieldChange[];
  triggerCount?: { from: number; to: number };
  jokerGauge?: { from: number; to: number };
}

/**
 * Field change entry
 */
export interface FieldChange {
  type: "added" | "removed" | "modified";
  unitId: string;
  unitName?: string;
  bp?: { from?: number; to?: number };
  active?: { from?: boolean; to?: boolean };
}

/**
 * Configuration for ThreadManager
 */
export interface ThreadManagerConfig {
  apiKey: string;
  model?: string;
  debounceMs?: number;
  systemPrompt?: string;
  onAnalysis?: (analysis: string) => void;
}

/**
 * ThreadManager - Manages AI conversation thread with debounced analysis
 */
export class ThreadManager {
  private client: Anthropic;
  private model: string;
  private debounceMs: number;
  private systemPrompt: string;
  private thread: ThreadMessage[] = [];
  private pendingMessages: string[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private catalogLookup: (id: string) => CatalogCard | undefined;
  private previousState: GameState | null = null;
  private onAnalysis: ((analysis: string) => void) | null = null;
  private isAnalyzing = false;

  constructor(
    config: ThreadManagerConfig,
    catalogLookup: (id: string) => CatalogCard | undefined
  ) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
    this.model = config.model ?? "claude-3-5-haiku-20241022";
    this.debounceMs = config.debounceMs ?? 1000;
    this.systemPrompt = config.systemPrompt ?? this.getDefaultSystemPrompt();
    this.catalogLookup = catalogLookup;
    this.onAnalysis = config.onAnalysis ?? null;
  }

  /**
   * Get default system prompt for game analysis
   */
  private getDefaultSystemPrompt(): string {
    return `あなたはCODE OF JOKERの対戦実況・分析AIです。
ゲームの状態変化を観察し、何が起きたかを簡潔に日本語で解説してください。

注意点：
- カード効果やゲームの流れを分かりやすく説明
- 戦略的な観点からのコメントも適宜追加
- パイロット（プレイヤー）からのコメントがあれば、それを踏まえて分析を修正
- 簡潔に、1-3文程度で回答`;
  }

  /**
   * Push a game event to the pending messages
   */
  pushGameEvent(event: string): void {
    this.pendingMessages.push(`[ゲームイベント] ${event}`);
    this.scheduleAnalysis();
  }

  /**
   * Push a Sync diff to the pending messages
   */
  pushSyncDiff(newState: GameState): void {
    if (this.previousState) {
      const diff = this.calculateDiff(this.previousState, newState);
      const diffText = this.formatDiff(diff);
      if (diffText) {
        this.pendingMessages.push(`[状態変化]\n${diffText}`);
        this.scheduleAnalysis();
      }
    }
    this.previousState = structuredClone(newState);
  }

  /**
   * Add a pilot comment to the thread
   */
  addPilotComment(comment: string): void {
    const message: ThreadMessage = {
      role: "user",
      content: `[パイロットコメント] ${comment}`,
      timestamp: Date.now(),
    };
    this.thread.push(message);

    // Schedule analysis to respond to the comment
    this.pendingMessages.push(`パイロットからのコメント: ${comment}`);
    this.scheduleAnalysis();
  }

  /**
   * Schedule analysis with debounce
   */
  private scheduleAnalysis(): void {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new timer
    this.debounceTimer = setTimeout(() => {
      this.executeAnalysis().catch((err) => {
        console.error("[ThreadManager] Analysis error:", err);
      });
    }, this.debounceMs);
  }

  /**
   * Execute analysis by calling the API
   */
  private async executeAnalysis(): Promise<void> {
    if (this.pendingMessages.length === 0 || this.isAnalyzing) {
      return;
    }

    this.isAnalyzing = true;

    try {
      // Combine pending messages into a single user message
      const combinedContent = this.pendingMessages.join("\n\n");
      this.pendingMessages = [];

      // Add to thread
      const userMessage: ThreadMessage = {
        role: "user",
        content: combinedContent,
        timestamp: Date.now(),
      };
      this.thread.push(userMessage);

      // Build messages for API call
      const apiMessages = this.thread.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      // Call API
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 256,
        system: this.systemPrompt,
        messages: apiMessages,
      });

      // Extract response text
      const responseText = this.extractText(response.content);

      // Add assistant response to thread
      const assistantMessage: ThreadMessage = {
        role: "assistant",
        content: responseText,
        timestamp: Date.now(),
      };
      this.thread.push(assistantMessage);

      // Notify callback
      if (this.onAnalysis) {
        this.onAnalysis(responseText);
      }
    } finally {
      this.isAnalyzing = false;
    }
  }

  /**
   * Calculate diff between two game states
   */
  private calculateDiff(prev: GameState, curr: GameState): SyncDiff {
    const diff: SyncDiff = {
      round: prev.game.round !== curr.game.round
        ? { from: prev.game.round, to: curr.game.round }
        : null,
      turn: prev.game.turn !== curr.game.turn
        ? { from: prev.game.turn, to: curr.game.turn }
        : null,
      players: {},
    };

    // Compare each player
    for (const playerId of Object.keys(curr.players)) {
      const prevPlayer = prev.players[playerId];
      const currPlayer = curr.players[playerId];

      if (!prevPlayer || !currPlayer) continue;

      const playerDiff: PlayerDiff = {};

      // Life
      if (prevPlayer.life.current !== currPlayer.life.current) {
        playerDiff.life = {
          from: prevPlayer.life.current,
          to: currPlayer.life.current,
        };
      }

      // CP
      if (prevPlayer.cp.current !== currPlayer.cp.current) {
        playerDiff.cp = {
          from: prevPlayer.cp.current,
          to: currPlayer.cp.current,
        };
      }

      // Hand count
      if (prevPlayer.hand.length !== currPlayer.hand.length) {
        playerDiff.handCount = {
          from: prevPlayer.hand.length,
          to: currPlayer.hand.length,
        };
      }

      // Field changes
      const fieldChanges = this.calculateFieldChanges(prevPlayer.field, currPlayer.field);
      if (fieldChanges.length > 0) {
        playerDiff.fieldChanges = fieldChanges;
      }

      // Trigger count
      if (prevPlayer.trigger.length !== currPlayer.trigger.length) {
        playerDiff.triggerCount = {
          from: prevPlayer.trigger.length,
          to: currPlayer.trigger.length,
        };
      }

      // Joker gauge
      if (prevPlayer.joker.gauge !== currPlayer.joker.gauge) {
        playerDiff.jokerGauge = {
          from: prevPlayer.joker.gauge,
          to: currPlayer.joker.gauge,
        };
      }

      // Only add if there are changes
      if (Object.keys(playerDiff).length > 0) {
        diff.players[playerId] = playerDiff;
      }
    }

    return diff;
  }

  /**
   * Calculate field unit changes
   */
  private calculateFieldChanges(
    prevField: GameState["players"][string]["field"],
    currField: GameState["players"][string]["field"]
  ): FieldChange[] {
    const changes: FieldChange[] = [];
    const prevIds = new Set(prevField.map((u) => u.id));
    const currIds = new Set(currField.map((u) => u.id));

    // Removed units
    for (const unit of prevField) {
      if (!currIds.has(unit.id)) {
        const info = this.catalogLookup(unit.catalogId);
        changes.push({
          type: "removed",
          unitId: unit.id,
          unitName: info?.name ?? unit.catalogId,
        });
      }
    }

    // Added or modified units
    for (const currUnit of currField) {
      if (!prevIds.has(currUnit.id)) {
        const info = this.catalogLookup(currUnit.catalogId);
        changes.push({
          type: "added",
          unitId: currUnit.id,
          unitName: info?.name ?? currUnit.catalogId,
          bp: { to: currUnit.bp },
        });
      } else {
        // Check for modifications
        const prevUnit = prevField.find((u) => u.id === currUnit.id);
        if (prevUnit) {
          const modified =
            prevUnit.bp !== currUnit.bp || prevUnit.active !== currUnit.active;

          if (modified) {
            const info = this.catalogLookup(currUnit.catalogId);
            changes.push({
              type: "modified",
              unitId: currUnit.id,
              unitName: info?.name ?? currUnit.catalogId,
              bp:
                prevUnit.bp !== currUnit.bp
                  ? { from: prevUnit.bp, to: currUnit.bp }
                  : undefined,
              active:
                prevUnit.active !== currUnit.active
                  ? { from: prevUnit.active, to: currUnit.active }
                  : undefined,
            });
          }
        }
      }
    }

    return changes;
  }

  /**
   * Format diff as human-readable text
   */
  private formatDiff(diff: SyncDiff): string {
    const lines: string[] = [];

    if (diff.round) {
      lines.push(`ラウンド: ${diff.round.from} → ${diff.round.to}`);
    }
    if (diff.turn) {
      lines.push(`ターン: ${diff.turn.from} → ${diff.turn.to}`);
    }

    for (const [playerId, playerDiff] of Object.entries(diff.players)) {
      const playerLabel = playerId.length > 8 ? playerId.slice(0, 8) : playerId;

      if (playerDiff.life) {
        lines.push(`${playerLabel} ライフ: ${playerDiff.life.from} → ${playerDiff.life.to}`);
      }
      if (playerDiff.cp) {
        lines.push(`${playerLabel} CP: ${playerDiff.cp.from} → ${playerDiff.cp.to}`);
      }
      if (playerDiff.handCount) {
        lines.push(`${playerLabel} 手札: ${playerDiff.handCount.from} → ${playerDiff.handCount.to}枚`);
      }
      if (playerDiff.fieldChanges) {
        for (const change of playerDiff.fieldChanges) {
          switch (change.type) {
            case "added":
              lines.push(`${playerLabel} フィールド: +${change.unitName} (BP:${change.bp?.to})`);
              break;
            case "removed":
              lines.push(`${playerLabel} フィールド: -${change.unitName}`);
              break;
            case "modified": {
              const mods: string[] = [];
              if (change.bp) mods.push(`BP:${change.bp.from}→${change.bp.to}`);
              if (change.active !== undefined) {
                mods.push(change.active.to ? "行動可能" : "行動済み");
              }
              lines.push(`${playerLabel} ${change.unitName}: ${mods.join(", ")}`);
              break;
            }
          }
        }
      }
      if (playerDiff.triggerCount) {
        lines.push(`${playerLabel} トリガー: ${playerDiff.triggerCount.from} → ${playerDiff.triggerCount.to}枚`);
      }
      if (playerDiff.jokerGauge) {
        lines.push(`${playerLabel} JOKERゲージ: ${playerDiff.jokerGauge.from}% → ${playerDiff.jokerGauge.to}%`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Extract text from Claude response
   */
  private extractText(content: Anthropic.ContentBlock[]): string {
    const textParts: string[] = [];
    for (const block of content) {
      if (block.type === "text") {
        textParts.push(block.text);
      }
    }
    return textParts.join("\n");
  }

  /**
   * Get current thread
   */
  getThread(): ThreadMessage[] {
    return [...this.thread];
  }

  /**
   * Clear thread
   */
  clearThread(): void {
    this.thread = [];
    this.pendingMessages = [];
    this.previousState = null;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Set analysis callback
   */
  setOnAnalysis(callback: (analysis: string) => void): void {
    this.onAnalysis = callback;
  }

  /**
   * Check if currently analyzing
   */
  isCurrentlyAnalyzing(): boolean {
    return this.isAnalyzing;
  }

  /**
   * Get pending message count
   */
  getPendingCount(): number {
    return this.pendingMessages.length;
  }
}
