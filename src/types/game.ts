/**
 * Game type definitions
 * Based on the API specification
 */

import type { IPlayer, IUnit, ICard, IDelta, Rule } from "../../suit/types/index.ts";
import type { Message } from "../../suit/types/message/message.ts";
import type {
  Payload,
  PlayerEntryPayload,
  DebugMakePayload,
  DebugDrivePayload,
  DebugDrawPayload,
  UnitDrivePayload,
  EvolveDrivePayload,
  JokerDrivePayload,
  TriggerSetPayload,
  OverridePayload,
  AttackPayload,
  BlockPayload,
  BootPayload,
  WithdrawalPayload,
  DiscardPayload,
  ChoosePayload,
  ContinuePayload,
  MulliganPayload,
} from "../../suit/types/message/payload/index.ts";

/**
 * Game state synchronized from server
 */
export interface GameState {
  rule: Rule;
  game: {
    round: number;
    turn: number;
  };
  players: {
    [playerId: string]: IPlayer;
  };
}

/**
 * WebSocket message types from server
 * Messages have structure: { action: Action, payload: Payload }
 */
export type ServerMessage = Message<Payload>;

export interface SyncMessage {
  type: "Sync";
  body: GameState;
}

export interface ChoicesMessage {
  type: "Choices";
  promptId: string;
  player: string;
  choices: {
    title: string;
    isCancelable?: boolean;
    type: "card" | "option" | "intercept" | "unit" | "block";
    items: ICard[] | IUnit[] | Option[];
    count?: number; // For type: 'card'
  };
}

export interface TurnChangeMessage {
  type: "TurnChange";
  player: string;
  isFirst: boolean;
}

export interface MulliganStartMessage {
  type: "MulliganStart";
}

export interface OperationMessage {
  type: "Operation";
  action: "freeze" | "defrost";
}

export interface Option {
  id: string;
  name: string;
  [key: string]: unknown;
}

/**
 * Client action types
 * Messages have structure: { action: Action, payload: Payload }
 */
export type ClientMessage = Message<ClientPayload>;

/**
 * All client payload types
 */
export type ClientPayload =
  | PlayerEntryPayload
  | DebugMakePayload
  | DebugDrivePayload
  | DebugDrawPayload
  | UnitDrivePayload
  | EvolveDrivePayload
  | JokerDrivePayload
  | TriggerSetPayload
  | OverridePayload
  | AttackPayload
  | BlockPayload
  | BootPayload
  | WithdrawalPayload
  | DiscardPayload
  | ChoosePayload
  | ContinuePayload
  | MulliganPayload;

/**
 * Re-export payload types for convenience
 */
export type {
  PlayerEntryPayload,
  DebugMakePayload,
  DebugDrivePayload,
  DebugDrawPayload,
  UnitDrivePayload,
  EvolveDrivePayload,
  JokerDrivePayload,
  TriggerSetPayload,
  OverridePayload,
  AttackPayload,
  BlockPayload,
  BootPayload,
  WithdrawalPayload,
  DiscardPayload,
  ChoosePayload,
  ContinuePayload,
  MulliganPayload,
};

/**
 * Color enumeration
 */
export const Color = {
  RED: 1,
  YELLOW: 2,
  BLUE: 3,
  GREEN: 4,
  PURPLE: 5,
  NONE: 6,
} as const;

export type ColorType = (typeof Color)[keyof typeof Color];

export type { IPlayer, IUnit, ICard, IDelta, Rule };

// ============================================
// Client-side payload types for MCP tools
// ============================================
// These types are looser than the suit types because the MCP client
// only needs to provide IDs - the server resolves full object data

/** Minimal reference to a card/unit by ID */
interface CardRef {
  id: string;
}

/** Card reference with catalog info */
interface CardRefWithCatalog extends CardRef {
  catalogId: string;
}

/** Client-side TriggerSet payload (server resolves full card data from ID) */
export interface ClientTriggerSetPayload {
  type: "TriggerSet";
  player: string;
  target: CardRefWithCatalog;
}

/** Client-side Attack payload (server resolves full unit data from ID) */
export interface ClientAttackPayload {
  type: "Attack";
  player: string;
  target: CardRef;
}

/** Client-side Boot payload (server resolves full unit data from ID) */
export interface ClientBootPayload {
  type: "Boot";
  player: string;
  target: CardRef;
}

/** Client-side Withdrawal payload (server resolves full unit data from ID) */
export interface ClientWithdrawalPayload {
  type: "Withdrawal";
  player: string;
  target: CardRef;
}

/**
 * MCP-friendly client payload types
 * Uses looser types for payloads where the server only needs the ID
 */
export type McpClientPayload =
  | PlayerEntryPayload
  | DebugMakePayload
  | DebugDrivePayload
  | DebugDrawPayload
  | UnitDrivePayload
  | EvolveDrivePayload
  | JokerDrivePayload
  | ClientTriggerSetPayload
  | OverridePayload
  | ClientAttackPayload
  | BlockPayload
  | ClientBootPayload
  | ClientWithdrawalPayload
  | DiscardPayload
  | ChoosePayload
  | ContinuePayload
  | MulliganPayload;
