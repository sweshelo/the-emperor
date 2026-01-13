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
