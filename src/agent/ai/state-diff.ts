/**
 * Game state diff calculation and formatting
 */

import type { GameState } from "../../types/game.ts";
import type { CatalogCard } from "../../schemas/catalog.ts";

/**
 * Format state diff as human-readable text
 */
export function formatStateDiff(
  prev: GameState,
  curr: GameState,
  catalogLookup: (id: string) => CatalogCard | undefined
): string {
  const lines: string[] = [];

  if (prev.game.round !== curr.game.round) {
    lines.push(`ラウンド: ${prev.game.round} → ${curr.game.round}`);
  }
  if (prev.game.turn !== curr.game.turn) {
    lines.push(`ターン: ${prev.game.turn} → ${curr.game.turn}`);
  }

  for (const [playerId, currPlayer] of Object.entries(curr.players)) {
    const prevPlayer = prev.players[playerId];
    if (!prevPlayer) continue;

    const label = playerId.length > 8 ? playerId.slice(0, 8) : playerId;

    if (prevPlayer.life.current !== currPlayer.life.current) {
      lines.push(`${label} ライフ: ${prevPlayer.life.current} → ${currPlayer.life.current}`);
    }
    if (prevPlayer.cp.current !== currPlayer.cp.current) {
      lines.push(`${label} CP: ${prevPlayer.cp.current} → ${currPlayer.cp.current}`);
    }
    if (prevPlayer.hand.length !== currPlayer.hand.length) {
      lines.push(`${label} 手札: ${prevPlayer.hand.length} → ${currPlayer.hand.length}枚`);
    }

    // Field changes
    const prevIds = new Set(prevPlayer.field.map((u) => u.id));
    const currIds = new Set(currPlayer.field.map((u) => u.id));

    for (const unit of prevPlayer.field) {
      if (!currIds.has(unit.id)) {
        const info = catalogLookup(unit.catalogId);
        lines.push(`${label} フィールド: -${info?.name ?? unit.catalogId}`);
      }
    }

    for (const unit of currPlayer.field) {
      if (!prevIds.has(unit.id)) {
        const info = catalogLookup(unit.catalogId);
        lines.push(`${label} フィールド: +${info?.name ?? unit.catalogId} (BP:${unit.bp})`);
      } else {
        const prevUnit = prevPlayer.field.find((u) => u.id === unit.id);
        if (prevUnit && (prevUnit.bp !== unit.bp || prevUnit.active !== unit.active)) {
          const info = catalogLookup(unit.catalogId);
          const changes: string[] = [];
          if (prevUnit.bp !== unit.bp) changes.push(`BP:${prevUnit.bp}→${unit.bp}`);
          if (prevUnit.active !== unit.active) changes.push(unit.active ? "行動可能" : "行動済み");
          lines.push(`${label} ${info?.name ?? unit.catalogId}: ${changes.join(", ")}`);
        }
      }
    }

    if (prevPlayer.joker.gauge !== currPlayer.joker.gauge) {
      lines.push(`${label} JOKERゲージ: ${prevPlayer.joker.gauge}% → ${currPlayer.joker.gauge}%`);
    }
  }

  return lines.join("\n");
}

/**
 * Summarize current situation for learning record
 */
export function summarizeSituation(
  gameState: GameState,
  myPlayerId: string
): string {
  const myPlayer = gameState.players[myPlayerId];
  const opponentId = Object.keys(gameState.players).find((id) => id !== myPlayerId);
  const opponent = opponentId ? gameState.players[opponentId] : null;

  const parts: string[] = [];
  parts.push(`R${gameState.game.round}T${gameState.game.turn}`);

  if (myPlayer) {
    parts.push(`自:L${myPlayer.life.current}CP${myPlayer.cp.current}F${myPlayer.field.length}`);
  }
  if (opponent) {
    parts.push(`敵:L${opponent.life.current}CP${opponent.cp.current}F${opponent.field.length}`);
  }

  return parts.join(" ");
}
