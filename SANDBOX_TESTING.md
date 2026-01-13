# Sandbox Integration Testing Guide

このドキュメントは、the-foolのサンドボックス環境との統合テストの手順を説明します。

## 前提条件

1. **the-foolサーバーをサンドボックスモードで起動**

```bash
cd the-fool
SANDBOX_MODE=true PORT=3000 bun run index.ts
```

2. **the-emperorプロジェクトの依存関係をインストール**

```bash
cd the-emperor
bun install
```

## テスト実行

### 1. 基本的な統合テスト

```bash
# サンドボックスサーバーが起動していることを確認
TEST_SANDBOX_URL=http://localhost:3000 bun test tests/sandbox-integration.test.ts
```

このテストは以下を検証します：
- サンドボックスモードが有効かどうか
- サンドボックスルームの作成と破棄
- ゲーム状態のロード
- サンドボックスゲームの開始
- フルワークフロー（create → load → start）

### 2. 包括的な統合テスト（実際のゲームデータ使用）

```bash
# 実際のsync.jsonデータを使用した包括的テスト
TEST_SANDBOX_URL=http://localhost:3000 TEST_SANDBOX_WS_URL=ws://localhost:3000 bun test tests/sandbox-comprehensive.test.ts
```

このテストは以下を検証します：
- サンドボックスルームの作成
- 実際のゲームデータ（sync.json）の読み込み
- ゲーム状態の復元
- WebSocket接続による双方向通信
- アクション送信メカニズム
- フルワークフロー（データロード → 接続 → 通信）
- プレイヤーデータの解析

### 3. デバッグモードテスト（実装進行中）

```bash
# デバッグモードとカード効果のテスト
TEST_SANDBOX_URL=http://localhost:3000 TEST_SANDBOX_WS_URL=ws://localhost:3000 bun test tests/sandbox-debug.test.ts
```

このテストは以下を検証します：
- デバッグモードの有効化
- DebugMakeによるカード作成（実装待ち）
- カード召喚と効果解決の確認（実装待ち）
- メッセージシーケンスの追跡

⚠️ **注意**: DebugMake機能はthe-foolサーバー側の実装待ちです。詳細は [DEBUG_MODE.md](./docs/DEBUG_MODE.md) を参照してください。

### 4. すべてのテストを実行

```bash
# すべての統合テストを実行
TEST_SANDBOX_URL=http://localhost:3000 TEST_SANDBOX_WS_URL=ws://localhost:3000 bun test tests/sandbox-*.test.ts
```

### 5. MCPサーバーとの統合テスト

#### 手順 1: the-foolサーバーを起動

```bash
cd the-fool
SANDBOX_MODE=true PORT=3000 bun run src/index.ts
```

#### 手順 2: MCPサーバーを起動

別のターミナルで：

```bash
cd the-emperor
SANDBOX_BASE_URL=http://localhost:3000 bun run mcp
```

#### 手順 3: MCPツールのテスト

MCPサーバーが起動したら、以下のツールが利用可能になります：

##### サンドボックス状態確認

```json
{
  "tool": "check_sandbox",
  "arguments": {}
}
```

##### サンドボックスルーム作成

```json
{
  "tool": "create_sandbox_room",
  "arguments": {}
}
```

##### ゲーム状態のロード

```json
{
  "tool": "load_sandbox_state",
  "arguments": {
    "useCurrentState": false,
    "customState": {
      "game": {
        "round": 1,
        "turn": 1
      },
      "players": {
        "test-player-1": {
          "id": "test-player-1",
          "name": "Test Player",
          "deck": [],
          "hand": [],
          "field": [],
          "trash": [],
          "delete": [],
          "trigger": [],
          "cp": {"current": 2, "max": 2},
          "life": {"current": 7, "max": 7},
          "joker": {"card": [], "gauge": 0},
          "purple": null
        }
      },
      "rule": {
        "maxLife": 7,
        "maxCP": 10,
        "maxFieldSize": 5,
        "maxTriggerSize": 5,
        "maxHandSize": 7,
        "initialHandSize": 5,
        "initialCP": 2
      }
    }
  }
}
```

##### サンドボックスゲーム開始

```json
{
  "tool": "start_sandbox_game",
  "arguments": {}
}
```

##### 手の評価（フルワークフロー）

```json
{
  "tool": "evaluate_move",
  "arguments": {
    "moveDescription": "Summon unit and attack",
    "stateModifications": {}
  }
}
```

##### サンドボックスルーム破棄

```json
{
  "tool": "destroy_sandbox_room",
  "arguments": {}
}
```

## WebSocketでサンドボックスに接続

サンドボックスルームが作成されたら、WebSocketクライアントで接続できます：

```typescript
import { GameWebSocketClient } from "./src/websocket/client.ts";

const client = new GameWebSocketClient({
  url: "ws://localhost:3000?roomId=99999",
});

await client.connect();

// ゲームアクションを送信
client.send({
  type: "UnitDrive",
  player: "test-player-1",
  target: { id: "card-id" },
});
```

## トラブルシューティング

### サンドボックスが有効にならない

**問題**: テストで "Sandbox not available" エラーが発生する

**解決策**:
1. the-foolサーバーが `SANDBOX_MODE=true` で起動しているか確認
2. ポート番号が正しいか確認（デフォルト: 3000）
3. サーバーのログを確認：

```bash
# the-foolサーバーのログに以下が表示されるはず
[Sandbox] Sandbox mode is ENABLED
[Sandbox] Room ID: 99999
```

### ルーム作成エラー

**問題**: "Room already exists" エラー

**解決策**:
```bash
# サンドボックスルームを破棄
curl -X DELETE http://localhost:3000/api/sandbox/destroy
```

### 状態ロードエラー

**問題**: "Invalid state format" エラー

**解決策**:
- ゲーム状態のフォーマットが正しいか確認
- 必須フィールド（`game`, `players`, `rule`）が含まれているか確認
- プレイヤーオブジェクトが完全か確認

## 期待される結果

すべてのテストが成功すると、以下のような出力が表示されます：

```
✓ should check if sandbox is available [10ms]
✓ should create and destroy sandbox room [50ms]
✓ should load game state and start game [100ms]
✓ should execute full sandbox workflow [120ms]

4 pass
0 fail
```

## 次のステップ

統合テストが成功したら、次のステップに進めます：

1. **実際のゲーム状態での評価**
   - リアルタイムゲームの状態をキャプチャ
   - サンドボックスで異なる手をテスト
   - 結果を比較

2. **AI戦略の実装**
   - MCPツールを使ってゲーム状態を分析
   - 可能な手を列挙
   - 各手をサンドボックスで評価
   - 最適な手を選択

3. **パフォーマンス最適化**
   - サンドボックスの作成・破棄のオーバーヘッド削減
   - 並列評価の実装
   - キャッシング戦略

## 参考資料

- [the-fool Sandbox README](./the-fool/src/sandbox/README.md)
- [MCP Server Implementation](./src/mcp/server.ts)
- [Sandbox Client Implementation](./src/sandbox/client.ts)
- [Sandbox MCP Tools](./src/mcp/tools/sandbox.ts)
