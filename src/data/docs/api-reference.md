# CODE OF JOKER - API通信仕様

## 1. 概要

AIエージェントはWebSocket経由でゲームサーバと通信します。
サーバからゲーム状態を受信し、アクションをJSON形式で送信します。

---

## 2. 受信ペイロード

### 2.1 Sync（ゲーム状態同期）

ゲーム状態が更新されるたびに送信されます。

```typescript
{
  type: 'Sync',
  body: {
    rule: Rule,              // ゲームルール設定
    game: {
      round: number,         // 現在ラウンド
      turn: number           // 累計ターン数
    },
    players: {
      [playerId: string]: IPlayer
    }
  }
}
```

### 2.2 IPlayer（プレイヤー情報）

```typescript
{
  id: string,
  name: string,
  deck: IAtom[],             // デッキ（IDのみ）
  hand: IAtom[],             // 手札
  field: IUnit[],            // フィールド上のユニット
  trash: ICard[],            // 捨札
  delete: ICard[],           // 消滅札
  trigger: IAtom[],          // トリガーゾーン
  purple: number | undefined,// 紫ゲージ
  cp: { current: number, max: number },
  life: { current: number, max: number },
  joker: {
    card: IJoker[],          // 選択したJOKER（2枚）
    gauge: number            // JOKERゲージ（0〜100）
  }
}
```

### 2.3 IUnit（ユニット情報）

```typescript
{
  id: string,
  catalogId: string,         // カタログID
  lv: number,                // レベル（1〜3）
  bp: number,                // 基本BP
  currentBP: number,         // 現在BP
  active: boolean,           // 行動権
  isCopy: boolean,           // 複製か
  hasBootAbility: boolean,   // 起動効果を持つか
  isBooted: boolean,         // 起動効果使用済みか
  delta?: IDelta[]           // 付与効果
}
```

### 2.4 ICard（カード情報）

```typescript
{
  id: string,
  catalogId: string,
  lv: number,
  delta?: IDelta[]
}
```

### 2.5 IDelta（付与効果）

```typescript
{
  count: number,
  event: string | undefined,
  effect: {
    type: 'bp', diff: number           // BP修正
  } | {
    type: 'keyword', name: string      // キーワード付与
  } | {
    type: 'damage', value: number      // ダメージ
  } | {
    type: 'cost', value: number        // コスト修正
  } | {
    type: 'death'                      // デスカウンター
  } | {
    type: 'life'                       // 寿命カウンター
  } | {
    type: 'banned'                     // 使用不能
  }
}
```

### 2.6 Choices（選択要求）

効果の対象選択やブロック選択時に送信されます。

```typescript
{
  type: 'Choices',
  promptId: string,          // 応答時に必要
  player: string,            // 選択するプレイヤー
  choices: {
    title: string,
    isCancelable?: boolean,
    type: 'card' | 'option' | 'intercept' | 'unit' | 'block',
    items: ICard[] | IUnit[] | Option[],
    count?: number           // type: 'card'の場合、選択枚数
  }
}
```

### 2.7 TurnChange（ターン変更通知）

```typescript
{
  type: 'TurnChange',
  player: string,            // ターンプレイヤーのID
  isFirst: boolean           // 先攻かどうか
}
```

### 2.8 MulliganStart（マリガン開始）

```typescript
{
  type: 'MulliganStart'
}
```

### 2.9 Operation（操作権限）

```typescript
{
  type: 'Operation',
  action: 'freeze' | 'defrost'  // freeze=操作不可, defrost=操作可能
}
```

---

## 3. 送信ペイロード

### 3.1 ユニット召喚

```json
{
  "type": "UnitDrive",
  "player": "<playerId>",
  "target": { "id": "<手札のユニットID>" }
}
```

### 3.2 進化召喚

```json
{
  "type": "EvolveDrive",
  "player": "<playerId>",
  "target": { "id": "<手札の進化ユニットID>" },
  "source": { "id": "<フィールドの進化元ユニットID>" }
}
```

### 3.3 JOKER使用

```json
{
  "type": "JokerDrive",
  "player": "<playerId>",
  "target": { "id": "<JOKERカードID>" }
}
```

### 3.4 トリガー/インターセプトのセット

```json
{
  "type": "TriggerSet",
  "player": "<playerId>",
  "target": { "id": "<カードID>", "catalogId": "<catalogId>" }
}
```

### 3.5 オーバーライド

```json
{
  "type": "Override",
  "player": "<playerId>",
  "target": { "id": "<重ねるカードID>" },
  "parent": { "id": "<受け皿カードID>" }
}
```

### 3.6 アタック

```json
{
  "type": "Attack",
  "player": "<playerId>",
  "target": { "id": "<ユニットID>", ... }
}
```

### 3.7 ブロック

```json
{
  "type": "Block",
  "player": "<playerId>",
  "target": { "id": "<ユニットID>", ... }
}
```

### 3.8 起動効果発動

```json
{
  "type": "Boot",
  "player": "<playerId>",
  "target": { "id": "<ユニットID>", ... }
}
```

### 3.9 撤退

```json
{
  "type": "Withdrawal",
  "player": "<playerId>",
  "target": { "id": "<ユニットID>", ... }
}
```

### 3.10 手札破棄

```json
{
  "type": "Discard",
  "player": "<playerId>",
  "target": { "id": "<カードID>", "catalogId": "<catalogId>" }
}
```

### 3.11 選択への応答

選択する場合:

```json
{
  "type": "Choose",
  "promptId": "<受け取ったpromptId>",
  "choice": ["<選択したID>", ...]
}
```

選択しない場合（ブロックしない、インターセプト発動しないなど）:

```json
{
  "type": "Choose",
  "promptId": "<promptId>",
  "choice": undefined
}
```

### 3.12 ターン終了

```json
{
  "type": "Continue",
  "promptId": "<promptId>",
  "player": "<playerId>"
}
```

### 3.13 マリガン

確定:

```json
{
  "type": "Mulligan",
  "action": "done",
  "player": "<playerId>"
}
```

引き直し:

```json
{
  "type": "Mulligan",
  "action": "retry",
  "player": "<playerId>"
}
```

---

## 4. 属性値

```typescript
Color = {
  RED: 1,
  YELLOW: 2,
  BLUE: 3,
  GREEN: 4,
  PURPLE: 5,
  NONE: 6
}
```

---

## 5. カタログ参照

カードの詳細情報（名前、コスト、BP、アビリティテキストなど）は`catalogId`を使用してカタログから取得できます。
ツールを使用してカタログにアクセスしてください。

### Catalogの構造

```typescript
{
  id: string,              // catalogId
  name: string,            // カード名
  rarity: string,          // レアリティ
  cost: number,            // コスト
  color: number,           // 属性（1〜6）
  bp?: [number, number, number],  // レベル別BP
  ability: string,         // アビリティテキスト
  type: 'unit' | 'trigger' | 'intercept' | 'advanced_unit' | 'virus' | 'joker',
  species?: string[],      // 種族
  gauge?: string           // JOKER必要ゲージ
}
```

---

## 6. 応答形式

AIは以下の形式で応答してください:

```plaintext
【状況分析】
（簡潔なゲーム状態の把握）

【決定】
（選択した行動と理由）

【アクション】
{JSON形式のペイロード}
```
