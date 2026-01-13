# Debug Mode Testing

このドキュメントでは、the-foolサンドボックスのデバッグモード機能を使用したテストについて説明します。

## デバッグモードとは

デバッグモードは、ゲームの内部状態を完全に可視化し、テストやデバッグを容易にする機能です。

### 有効化方法

ゲーム状態の `rule.debug.enable` を `true` に設定します：

```typescript
const debugState: GameState = {
  ...baseState,
  rule: {
    ...baseState.rule,
    debug: {
      enable: true,
      reveal: {
        opponent: {
          deck: true,      // 相手のデッキを表示
          hand: true,      // 相手の手札を表示
          trigger: true,   // 相手のトリガーを表示
          trash: false,    // 相手の捨札は非表示
        },
        self: {
          deck: true,      // 自分のデッキを表示
        },
      },
    },
  },
};
```

## DebugMake機能（実装待ち）

DebugMakeは、任意のカードを生成してゲーム内に追加する機能です。

### 予想される使用方法

```typescript
// DebugMakeアクションの構造（推測）
const debugMakeAction = {
  type: "DebugMake",
  player: playerId,
  catalogId: "1-1-018",  // カタログID
  destination: "hand",    // 追加先: "hand" | "field" | "deck"
  level?: 1,              // オプション: レベル指定
};

// WebSocket経由で送信
wsClient.send(debugMakeAction);
```

### 実装状況

- ⚠️ **実装待ち**: 現在、DebugMake機能の正確なAPI仕様は未確定です
- the-foolサーバー側での実装が必要
- API仕様が確定次第、テストコードを更新します

## テストカード: ブロックナイト (1-1-018)

### カード情報

```json
{
  "id": "1-1-018",
  "name": "ブロックナイト",
  "rarity": "c",
  "type": "unit",
  "color": 4,
  "species": ["珍獣"],
  "cost": 1,
  "bp": [1000, 2000, 3000],
  "ability": "■援軍／緑\nこのユニットがフィールドに出た時、緑属性のユニットカードを1枚ランダムで手札に加える。"
}
```

### 効果の検証方法

1. **初期状態の記録**
   - 手札の枚数を記録
   - フィールドの状態を記録

2. **カードの召喚**
   - DebugMakeでブロックナイトを手札に追加
   - UnitDriveで召喚

3. **効果の確認**
   - Syncメッセージを監視
   - 手札が1枚増えたことを確認
   - 追加されたカードが緑属性であることを確認

4. **期待される結果**
   ```
   初期状態: hand.length = N
   召喚実行: field.length = 1
   効果発動: hand.length = N + 1
   検証OK: 新しいカードのcolor = 4 (緑)
   ```

## テスト実行

### 前提条件

1. the-foolサーバーがサンドボックスモード + デバッグモードで起動している
2. DebugMake機能が実装されている

### 実行方法

```bash
# デバッグモードテストを実行
TEST_SANDBOX_URL=http://localhost:3000 \
TEST_SANDBOX_WS_URL=ws://localhost:3000 \
bun test tests/sandbox-debug.test.ts
```

## 現在のテスト実装状況

### ✅ 実装済み

1. **デバッグモードの有効化**
   - ゲーム状態の `rule.debug` を操作
   - サンドボックスへのデバッグ状態のロード

2. **WebSocket接続とメッセージ監視**
   - Syncメッセージの受信確認
   - メッセージシーケンスの追跡

3. **テストインフラ**
   - メッセージ収集機構
   - 状態変化の追跡システム

### ⚠️ 実装待ち

1. **DebugMakeアクション**
   - API仕様の確定
   - アクション送信の実装

2. **カード召喚と効果検証**
   - UnitDriveアクションの送信タイミング
   - 効果解決の完全な検証

## 実装が完了した後の流れ

1. **DebugMake APIの確認**
   ```typescript
   // the-foolのドキュメントまたはコードから正確なAPIを確認
   ```

2. **テストコードの更新**
   ```typescript
   // tests/sandbox-debug.test.ts のTODO部分を実装
   wsClient.send({
     type: "DebugMake",
     player: playerId,
     catalogId: TEST_CARD_ID,
     destination: "hand",
   });
   ```

3. **効果検証の自動化**
   ```typescript
   // 効果発動前後の状態を比較
   expect(afterState.hand.length).toBe(beforeState.hand.length + 1);
   ```

## 将来的な拡張

### 複雑な効果のテスト

- 複数カードの相互作用
- 条件付き効果の発動
- タイミング依存の効果

### パフォーマンステスト

- 大量のカード生成
- 複雑な効果チェーンの処理時間測定

### 回帰テスト

- 既知のバグの再現テスト
- 効果の正確性の継続的検証

## 参考資料

- [Sandbox Testing Guide](../SANDBOX_TESTING.md)
- [Game API Specification](../docs/API_SPECIFICATION.md) - TODO
- [Card Catalog](../suit/catalog/catalog.json)
