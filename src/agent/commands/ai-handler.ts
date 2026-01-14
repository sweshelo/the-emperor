/**
 * AI command handler for buddy mode
 */

import type { DecisionContext, AICommandResult } from "../../types/agent.ts";
import type { UnifiedAI } from "../unified-ai.ts";
import type { TuiController } from "../buddy-tui.tsx";

/**
 * Handle AI commands (starting with /)
 * Returns AICommandResult: true = handled, false = not handled, or action to execute
 */
export async function handleAICommand(
  input: string,
  _context: DecisionContext,
  ai: UnifiedAI | null,
  tui: TuiController
): Promise<AICommandResult> {
  if (!ai) return false;

  const parts = input.split(/\s+/);
  const command = parts[0]?.toLowerCase();

  switch (command) {
    case "/think": {
      try {
        await ai.requestAnalysis();
      } catch (error) {
        tui.addMessage("error", `分析エラー: ${error}`);
      }
      return true;
    }

    case "/advice": {
      const actionType = parts.slice(1).join(" ");
      if (!actionType) {
        tui.addMessage("system", "Usage: /advice <action_type>");
        tui.addMessage("system", "Example: /advice summon, /advice attack, /advice end");
        return true;
      }
      try {
        await ai.requestAdvice(actionType);
      } catch (error) {
        tui.addMessage("error", `アドバイスエラー: ${error}`);
      }
      return true;
    }

    case "/comment": {
      const comment = parts.slice(1).join(" ");
      if (!comment) {
        tui.addMessage("system", "Usage: /comment <your comment>");
        return true;
      }
      tui.addMessage("user", `[パイロット] ${comment}`);
      try {
        await ai.addPilotComment(comment);
      } catch (error) {
        tui.addMessage("error", `コメント処理エラー: ${error}`);
      }
      return true;
    }

    case "/thread": {
      const thread = ai.getThread();
      tui.addMessage("ai", "--- スレッド履歴 ---");
      tui.addMessage("ai", `メッセージ数: ${thread.length}`);

      if (thread.length > 0) {
        tui.addMessage("ai", "最近のやり取り:");
        const recentMessages = thread.slice(-6);
        for (const msg of recentMessages) {
          const roleLabel = msg.role === "user" ? "[入力]" : "[AI]";
          const preview = msg.content.length > 100
            ? msg.content.slice(0, 100) + "..."
            : msg.content;
          tui.addMessage("ai", `  ${roleLabel} ${preview}`);
        }
      }
      return true;
    }

    case "/clear": {
      ai.clearThread();
      tui.addMessage("system", "スレッド履歴をクリアしました");
      return true;
    }

    case "/records": {
      const records = ai.getLearningRecords();
      tui.addMessage("ai", "--- 学習記録サマリー ---");
      tui.addMessage("ai", `総記録数: ${records.length}`);

      if (records.length > 0) {
        const goodMoves = records.filter((r) => r.score > 0).length;
        const badMoves = records.filter((r) => r.score < 0).length;
        tui.addMessage("ai", `好手: ${goodMoves}, 悪手: ${badMoves}, 普通: ${records.length - goodMoves - badMoves}`);

        tui.addMessage("ai", "最近の記録:");
        const recentRecords = records.slice(-5);
        for (const record of recentRecords) {
          const scoreIcon = record.score > 0 ? "◎" : record.score < 0 ? "×" : "○";
          tui.addMessage("ai", `  ${scoreIcon} ${record.situation} - ${record.userAction}`);
          tui.addMessage("ai", `    → ${record.reasoning.slice(0, 50)}...`);
        }
      }
      return true;
    }

    case "/do": {
      const instruction = parts.slice(1).join(" ");
      if (!instruction) {
        tui.addMessage("system", "Usage: /do <指示>");
        tui.addMessage("system", "例: /do 攻撃して, /do このカードを召喚して");
        return true;
      }
      tui.addMessage("ai", `指示を解釈中: "${instruction}"`);
      try {
        await ai.requestActionFromInstruction(instruction);
        if (ai.hasPendingAction()) {
          const pending = ai.getPendingAction();
          if (pending) {
            tui.addMessage("ai", "--- アクション提案 ---");
            tui.addMessage("ai", `内容: ${pending.description}`);
            tui.addMessage("ai", `理由: ${pending.reasoning}`);
            tui.addMessage("system", "/confirm で実行、/reject [理由] で却下");
          }
        }
      } catch (error) {
        tui.addMessage("error", `エラー: ${error}`);
      }
      return true;
    }

    case "/confirm":
    case "/yes": {
      const proposed = ai.confirmPendingAction();
      if (proposed) {
        tui.addMessage("system", `実行: ${proposed.description}`);
        return { shouldExecute: true, action: proposed.action };
      }
      tui.addMessage("error", "確認待ちのアクションがありません");
      return true;
    }

    case "/reject":
    case "/no": {
      if (!ai.hasPendingAction()) {
        tui.addMessage("error", "却下するアクションがありません");
        return true;
      }
      const reason = parts.slice(1).join(" ") || undefined;
      ai.rejectPendingAction(reason);
      tui.addMessage("system", "アクションを却下しました");
      return true;
    }

    default:
      return false;
  }
}

/**
 * Handle immediate input (for comments during opponent's turn)
 */
export function handleImmediateInput(
  input: string,
  wasQueued: boolean,
  ai: UnifiedAI | null,
  tui: TuiController
): boolean {
  if (!ai) return false;

  // Only process immediately if the command was queued (decideAction is not waiting)
  if (!wasQueued) return false;

  // Handle /comment command immediately
  if (input.startsWith("/comment ")) {
    const comment = input.slice("/comment ".length).trim();
    if (comment) {
      ai.addPilotComment(comment).catch((err) => {
        tui.addMessage("error", `コメント処理エラー: ${err}`);
      });
      tui.addMessage("user", `[パイロット] ${comment}`);
    } else {
      tui.addMessage("system", "Usage: /comment <your comment>");
    }
    tui.removeLastFromQueue();
    return true;
  }

  // Handle /thread command immediately
  if (input === "/thread") {
    const thread = ai.getThread();
    tui.addMessage("ai", "--- スレッド履歴 ---");
    tui.addMessage("ai", `メッセージ数: ${thread.length}`);

    if (thread.length > 0) {
      tui.addMessage("ai", "最近のやり取り:");
      const recentMessages = thread.slice(-6);
      for (const msg of recentMessages) {
        const roleLabel = msg.role === "user" ? "[入力]" : "[AI]";
        const preview = msg.content.length > 100
          ? msg.content.slice(0, 100) + "..."
          : msg.content;
        tui.addMessage("ai", `  ${roleLabel} ${preview}`);
      }
    }
    tui.removeLastFromQueue();
    return true;
  }

  // Handle /clear command immediately
  if (input === "/clear") {
    ai.clearThread();
    tui.addMessage("system", "スレッド履歴をクリアしました");
    tui.removeLastFromQueue();
    return true;
  }

  // For non-command text that doesn't look like a game command,
  // treat as pilot comment
  const gameCommands = ["summon", "attack", "set", "boot", "withdraw", "override", "joker", "end", "choose", "decline", "state", "help"];
  const firstWord = input.toLowerCase().split(/\s+/)[0];
  if (firstWord && !input.startsWith("/") && !gameCommands.includes(firstWord)) {
    ai.addPilotComment(input).catch((err) => {
      tui.addMessage("error", `コメント処理エラー: ${err}`);
    });
    tui.addMessage("user", `[パイロット] ${input}`);
    tui.removeLastFromQueue();
    return true;
  }

  return false;
}
