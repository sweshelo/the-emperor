/**
 * AI Tool definitions and execution
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { CatalogCard } from "../../schemas/catalog.ts";
import type { DecisionContext, ProposedAction } from "../../types/agent.ts";
import { formatGameStatePrompt, formatChoicePrompt, formatAvailableActionsPrompt } from "../prompts.ts";
import { isLookupCardInput, isProposeActionInput } from "../utils/type-guards.ts";
import { formatCardInfoJp } from "../utils/formatters.ts";
import { buildParsedAction, describeActionForProposal } from "./action-builder.ts";

/**
 * Tool definitions for the AI
 */
export const AI_TOOLS: Anthropic.Tool[] = [
  {
    name: "lookup_card",
    description: "カタログIDからカード情報を取得します。カード名、コスト、BP、能力テキストなどが分かります。",
    input_schema: {
      type: "object",
      properties: {
        catalogId: {
          type: "string",
          description: "カタログID (例: 1-2-001, PR-028)",
        },
      },
      required: ["catalogId"],
    },
  },
  {
    name: "get_game_state",
    description: "現在のゲーム状態の詳細を取得します。",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_available_actions",
    description: "現在実行可能なアクションの一覧を取得します。",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "propose_action",
    description: "パイロットの指示に基づいてアクションを提案します。パイロットの承認後に実行されます。",
    input_schema: {
      type: "object",
      properties: {
        actionType: {
          type: "string",
          description: "アクションの種類: summon (ユニット召喚), attack (攻撃), set_trigger (トリガーセット), boot (ブート能力), withdraw (撤退), joker (JOKER使用), end_turn (ターン終了), choose (選択)",
        },
        parameters: {
          type: "object",
          description: "アクションのパラメータ。actionTypeに応じて必要なパラメータが異なります。summon: {cardId}, attack: {unitId}, set_trigger: {cardId}, boot: {unitId}, withdraw: {unitId}, joker: {jokerId}, choose: {choiceIds: string[]}",
        },
        reasoning: {
          type: "string",
          description: "このアクションを提案する理由の説明",
        },
      },
      required: ["actionType", "parameters", "reasoning"],
    },
  },
];

/**
 * Context for tool execution
 */
export interface ToolExecutionContext {
  currentContext: DecisionContext | null;
  catalogLookup: (id: string) => CatalogCard | undefined;
  onActionProposed?: (action: ProposedAction) => void;
}

/**
 * Result of propose_action tool execution
 */
export interface ProposeActionResult {
  message: string;
  proposedAction: ProposedAction | null;
}

/**
 * Execute a tool call
 */
export function executeTool(
  toolName: string,
  toolInput: unknown,
  context: ToolExecutionContext
): string | ProposeActionResult {
  switch (toolName) {
    case "lookup_card": {
      if (!isLookupCardInput(toolInput)) {
        return "エラー: catalogIdが必要です";
      }
      const card = context.catalogLookup(toolInput.catalogId);
      if (!card) {
        return `カード ${toolInput.catalogId} が見つかりませんでした`;
      }
      return formatCardInfoJp(card);
    }

    case "get_game_state": {
      if (!context.currentContext) {
        return "ゲーム状態がまだ取得されていません";
      }
      return formatGameStatePrompt(context.currentContext, context.catalogLookup);
    }

    case "get_available_actions": {
      if (!context.currentContext) {
        return "ゲーム状態がまだ取得されていません";
      }
      const actions = formatAvailableActionsPrompt(context.currentContext, context.catalogLookup);
      const choice = context.currentContext.choice
        ? formatChoicePrompt(context.currentContext.choice)
        : "";
      return actions + (choice ? "\n\n" + choice : "");
    }

    case "propose_action": {
      if (!isProposeActionInput(toolInput)) {
        return "エラー: actionType, parameters, reasoning が必要です";
      }
      if (!context.currentContext) {
        return "エラー: ゲーム状態がまだ取得されていません";
      }

      const parsedAction = buildParsedAction(
        toolInput.actionType,
        toolInput.parameters,
        context.currentContext
      );
      if (!parsedAction) {
        return `エラー: アクションを構築できませんでした (actionType: ${toolInput.actionType})`;
      }

      const description = describeActionForProposal(
        toolInput.actionType,
        toolInput.parameters,
        context.currentContext,
        context.catalogLookup
      );

      const proposedAction: ProposedAction = {
        id: `proposal_${Date.now()}`,
        action: parsedAction,
        description,
        reasoning: toolInput.reasoning,
        timestamp: Date.now(),
        status: "pending",
      };

      context.onActionProposed?.(proposedAction);

      return {
        message: `アクションを提案しました: ${description}\n理由: ${toolInput.reasoning}\n\nパイロットの承認を待っています...`,
        proposedAction,
      };
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}
