/**
 * Game state display utilities for buddy mode
 */

import type { DecisionContext } from "../../types/agent.ts";
import type { ChoicesMessage } from "../../types/game.ts";
import type { CatalogCard } from "../../schemas/catalog.ts";
import type { TuiController } from "../buddy-tui.tsx";
import { hasCardInfo, isItemWithBp, isItemWithCatalogId, isItemWithName } from "../utils/type-guards.ts";
import { getCardDisplayInfo } from "../utils/formatters.ts";

/**
 * Display game state in a readable format
 */
export function displayGameState(
  context: DecisionContext,
  tui: TuiController,
  catalogLookup: (id: string) => CatalogCard | undefined
): void {
  const { gameState, myPlayerId } = context;
  const myPlayer = gameState.players[myPlayerId];
  const opponentId = Object.keys(gameState.players).find((id) => id !== myPlayerId);
  const opponent = opponentId ? gameState.players[opponentId] : null;

  // Update game status in header
  tui.setGameStatus(`Round ${gameState.game.round}, Turn ${gameState.game.turn}`);

  tui.addMessage("game", "=".repeat(50));
  tui.addMessage("game", `GAME STATE - Round ${gameState.game.round}, Turn ${gameState.game.turn}`);

  // Opponent state
  if (opponent) {
    tui.addMessage("game", "--- OPPONENT ---");
    tui.addMessage("game", `Life: ${opponent.life.current}/${opponent.life.max} | CP: ${opponent.cp.current}/${opponent.cp.max}`);
    tui.addMessage("game", `Hand: ${opponent.hand.length} cards | Triggers: ${opponent.trigger.length}`);

    if (opponent.field.length > 0) {
      tui.addMessage("game", "Field:");
      for (const unit of opponent.field) {
        const info = catalogLookup(unit.catalogId);
        const status = unit.active ? "Active" : "Exhausted";
        tui.addMessage("game", `  [${unit.id}] ${info?.name ?? unit.catalogId} BP:${unit.bp} (${status})`);
      }
    } else {
      tui.addMessage("game", "Field: Empty");
    }
  }

  // My state
  if (myPlayer) {
    tui.addMessage("game", "--- YOUR STATE ---");
    tui.addMessage("game", `Life: ${myPlayer.life.current}/${myPlayer.life.max} | CP: ${myPlayer.cp.current}/${myPlayer.cp.max}`);

    if (myPlayer.hand.length > 0) {
      tui.addMessage("game", "Hand:");
      for (const atom of myPlayer.hand) {
        if (hasCardInfo(atom)) {
          const info = catalogLookup(atom.catalogId);
          const { bp, color } = getCardDisplayInfo(info);
          tui.addMessage("game", `  [${atom.id}] ${info?.name ?? atom.catalogId} (Cost:${info?.cost ?? "?"}${bp}) [${color}]`);
        }
      }
    } else {
      tui.addMessage("game", "Hand: Empty");
    }

    if (myPlayer.field.length > 0) {
      tui.addMessage("game", "Field:");
      for (const unit of myPlayer.field) {
        const info = catalogLookup(unit.catalogId);
        const status = unit.active ? "Active" : "Exhausted";
        const boot = unit.hasBootAbility && !unit.isBooted ? " [Boot Available]" : "";
        tui.addMessage("game", `  [${unit.id}] ${info?.name ?? unit.catalogId} BP:${unit.bp} (${status})${boot}`);
      }
    } else {
      tui.addMessage("game", "Field: Empty");
    }

    if (myPlayer.trigger.length > 0) {
      tui.addMessage("game", `Triggers set: ${myPlayer.trigger.length}`);
    }

    if (myPlayer.joker.card.length > 0) {
      const jokerInfo = myPlayer.joker.card.map((j) => `${j.chara}(${j.cost})`).join(", ");
      tui.addMessage("game", `JOKER: ${jokerInfo} | Gauge: ${myPlayer.joker.gauge}%`);
    }
  }

  tui.addMessage("game", "=".repeat(50));
}

/**
 * Display current choice options
 */
export function displayChoice(
  choice: ChoicesMessage,
  tui: TuiController,
  catalogLookup: (id: string) => CatalogCard | undefined
): void {
  tui.addMessage("system", "--- CHOICE REQUIRED ---");
  tui.addMessage("system", `${choice.choices.title}`);
  tui.addMessage("system", `Type: ${choice.choices.type} | PromptID: ${choice.promptId}`);

  if (choice.choices.isCancelable) {
    tui.addMessage("system", "(Can be cancelled - enter empty to decline)");
  }

  if (choice.choices.count !== undefined) {
    tui.addMessage("system", `Select up to ${choice.choices.count} item(s)`);
  }

  tui.addMessage("system", "Options:");
  for (const item of choice.choices.items) {
    if (isItemWithBp(item)) {
      const info = catalogLookup(item.catalogId);
      tui.addMessage("system", `  [${item.id}] ${info?.name ?? item.catalogId} BP:${item.bp}`);
    } else if (isItemWithCatalogId(item)) {
      const info = catalogLookup(item.catalogId);
      tui.addMessage("system", `  [${item.id}] ${info?.name ?? item.catalogId}`);
    } else if (isItemWithName(item)) {
      tui.addMessage("system", `  [${item.id}] ${item.name}`);
    }
  }
}

/**
 * Display available commands
 */
export function displayHelp(
  context: DecisionContext,
  tui: TuiController,
  hasAi: boolean
): void {
  tui.addMessage("system", "--- AVAILABLE COMMANDS ---");

  if (context.choice) {
    tui.addMessage("system", "choose <id1> [id2] ... - Select option(s) from the choice");
    tui.addMessage("system", "decline               - Decline/cancel the choice (if cancelable)");
  } else {
    tui.addMessage("system", "summon <card_id>      - Summon a unit from hand");
    tui.addMessage("system", "attack <unit_id>      - Attack with a unit");
    tui.addMessage("system", "set <card_id>         - Set a trigger/intercept card");
    tui.addMessage("system", "boot <unit_id>        - Use unit's boot ability");
    tui.addMessage("system", "withdraw <unit_id>    - Withdraw a unit from field");
    tui.addMessage("system", "override <src> <tgt>  - Override card onto target");
    tui.addMessage("system", "joker <joker_id>      - Use JOKER ability");
    tui.addMessage("system", "end                   - End your turn");
  }

  tui.addMessage("system", "state                 - Redisplay game state");
  tui.addMessage("system", "help                  - Show this help");

  // AI commands
  if (hasAi) {
    tui.addMessage("ai", "--- AI COMMANDS ---");
    tui.addMessage("ai", "/do <指示>            - AIにアクションを指示");
    tui.addMessage("ai", "/confirm (/yes)       - 提案されたアクションを実行");
    tui.addMessage("ai", "/reject [理由] (/no)  - 提案を却下");
    tui.addMessage("ai", "/think                - 状況を詳しく分析");
    tui.addMessage("ai", "/advice <action>      - 特定アクションのアドバイス");
    tui.addMessage("ai", "/comment <text>       - AIへコメント");
    tui.addMessage("ai", "/thread               - スレッド履歴を表示");
    tui.addMessage("ai", "/clear                - スレッド履歴をクリア");
    tui.addMessage("ai", "/records              - 学習記録を表示");
    tui.addMessage("ai", "/save                 - 学習記録を保存");
    tui.addMessage("ai", "(テキスト入力でもAIへコメントできます)");
  }
}
