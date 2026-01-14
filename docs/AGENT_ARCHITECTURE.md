# Agent Module Architecture

`src/agent/` ディレクトリは、AIエージェントの実装を含むモジュールです。

## ディレクトリ構造

```
src/agent/
├── ai/                 # AI関連モジュール
│   ├── api-client.ts   # Anthropic API通信
│   ├── action-builder.ts # アクション構築ロジック
│   ├── state-diff.ts   # ゲーム状態差分計算
│   ├── system-prompt.ts # システムプロンプト定義
│   └── tools.ts        # AIツール定義・実行
├── commands/           # コマンド処理
│   ├── ai-handler.ts   # AIコマンド（/think, /doなど）
│   └── parser.ts       # ゲームコマンドパーサー
├── display/            # 表示関連
│   └── game-state.ts   # ゲーム状態表示
├── utils/              # 共通ユーティリティ
│   ├── formatters.ts   # フォーマット関数
│   └── type-guards.ts  # 型ガード関数
├── actions.ts          # アクションスキーマ・パース
├── base.ts             # 基底エージェントクラス
├── buddy.ts            # BuddyAgent（対話型エージェント）
├── buddy-tui.tsx       # TUIコンポーネント（ink使用）
├── claude.ts           # ClaudeAgent（自律型エージェント）
├── prompts.ts          # プロンプトテンプレート
└── unified-ai.ts       # UnifiedAI（AI統合サービス）
```

## 主要コンポーネント

### BuddyAgent (`buddy.ts`)

対話型エージェント。ユーザーがコマンドを入力してゲームをプレイする。

- TUIを通じてユーザーと対話
- AIアシスタント（UnifiedAI）と連携
- コマンドパーサーでユーザー入力を解釈

```typescript
const agent = new BuddyAgent("Player", catalogLookup, {
  ai: { apiKey: "..." },
  autoEvaluate: true,
});
```

### UnifiedAI (`unified-ai.ts`)

AI機能を統合したサービスクラス。単一の会話スレッドで全てのAI対話を管理。

**主な機能:**
- リアルタイムゲーム状態分析
- パイロット（ユーザー）コメントへの応答
- アクション提案と承認フロー
- 学習記録の管理

### ClaudeAgent (`claude.ts`)

自律型エージェント。AIが自動でゲームをプレイする。

## モジュール詳細

### ai/

AIとの通信・ツール実行を担当。

| ファイル | 責務 |
|---------|------|
| `api-client.ts` | Anthropic APIとの通信、ツール使用ループの処理 |
| `tools.ts` | AIツールの定義（lookup_card, get_game_state等）と実行 |
| `action-builder.ts` | ユーザー指示からParsedActionを構築 |
| `state-diff.ts` | ゲーム状態の差分計算とフォーマット |
| `system-prompt.ts` | AIへのシステムプロンプト生成 |

### commands/

ユーザー入力の処理を担当。

| ファイル | 責務 |
|---------|------|
| `parser.ts` | ゲームコマンド（summon, attack, end等）のパース |
| `ai-handler.ts` | AIコマンド（/think, /do, /confirm等）の処理 |

### display/

TUIへの表示を担当。

| ファイル | 責務 |
|---------|------|
| `game-state.ts` | ゲーム状態、選択肢、ヘルプの表示 |

### utils/

共通ユーティリティ。

| ファイル | 責務 |
|---------|------|
| `type-guards.ts` | 型ガード関数（hasCardInfo, isLookupCardInput等） |
| `formatters.ts` | カード情報のフォーマット、色名変換 |

## 型定義

AI関連の型は `src/types/ai.ts` に集約:

```typescript
// スレッドメッセージ
interface ThreadMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// UnifiedAI設定
interface UnifiedAIConfig {
  apiKey: string;
  model?: string;
  debounceMs?: number;
  onMessage?: (message: string, type: "analysis" | "advice" | "evaluation") => void;
  onActionProposed?: (action: ProposedAction) => void;
  onProcessingChange?: (isProcessing: boolean, reason?: string) => void;
}

// 学習記録
interface LearningRecord {
  timestamp: number;
  gameRound: number;
  gameTurn: number;
  situation: string;
  userAction: string;
  evaluation: string;
  score: number;
  reasoning: string;
}

// TUIメッセージ
interface TuiMessage {
  type: "system" | "game" | "user" | "error" | "ai";
  content: string;
  timestamp?: number;
}
```

## データフロー

### ゲームコマンド実行フロー

```
ユーザー入力
    ↓
TuiController.readLine()
    ↓
BuddyAgent.decideAction()
    ├── parseCommand() → ゲームコマンド
    │       ↓
    │   ParsedAction を返却
    │
    └── handleAICommand() → AIコマンド
            ↓
        UnifiedAI の各メソッド呼び出し
```

### AI分析フロー

```
ゲーム状態更新
    ↓
BuddyAgent.pushGameStateUpdate()
    ↓
UnifiedAI.pushGameStateUpdate()
    ↓
formatStateDiff() で差分計算
    ↓
scheduleAnalysis() でデバウンス
    ↓
APIClient.sendMessage() でAI呼び出し
    ↓
ツール使用ループ（必要に応じて）
    ↓
onMessage() コールバックでTUIに表示
```

### アクション提案フロー

```
/do コマンド
    ↓
handleAICommand()
    ↓
UnifiedAI.requestActionFromInstruction()
    ↓
AIがpropose_actionツールを使用
    ↓
executeTool() → buildParsedAction()
    ↓
ProposedAction を生成
    ↓
/confirm で承認 → confirmPendingAction()
    ↓
ParsedAction を返却して実行
```

## 設計原則

1. **1ファイル300行目安**: 大きくなりすぎたファイルは機能ごとに分割
2. **型定義の集約**: AI関連型は `src/types/ai.ts`、エージェント関連型は `src/types/agent.ts`
3. **関心の分離**: AI通信、コマンド処理、表示を別モジュールに
4. **型安全性**: `as` アサーション禁止、型ガードを使用
