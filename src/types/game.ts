/**
 * Game type definitions
 * Based on the API specification
 */

import type { IPlayer, IUnit, ICard, IDelta, Rule } from "../../suit/types/index.ts";

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
 */
export type ServerMessage =
  | SyncMessage
  | ChoicesMessage
  | TurnChangeMessage
  | MulliganStartMessage
  | OperationMessage;

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
  [key: string]: any;
}

/**
 * Client action types
 */
export type ClientAction =
  | UnitDriveAction
  | EvolveDriveAction
  | JokerDriveAction
  | TriggerSetAction
  | OverrideAction
  | AttackAction
  | BlockAction
  | BootAction
  | WithdrawalAction
  | DiscardAction
  | ChooseAction
  | ContinueAction
  | MulliganAction;

export interface UnitDriveAction {
  type: "UnitDrive";
  player: string;
  target: { id: string };
}

export interface EvolveDriveAction {
  type: "EvolveDrive";
  player: string;
  target: { id: string };
  source: { id: string };
}

export interface JokerDriveAction {
  type: "JokerDrive";
  player: string;
  target: { id: string };
}

export interface TriggerSetAction {
  type: "TriggerSet";
  player: string;
  target: { id: string; catalogId: string };
}

export interface OverrideAction {
  type: "Override";
  player: string;
  target: { id: string };
  parent: { id: string };
}

export interface AttackAction {
  type: "Attack";
  player: string;
  target: { id: string };
}

export interface BlockAction {
  type: "Block";
  player: string;
  target: { id: string };
}

export interface BootAction {
  type: "Boot";
  player: string;
  target: { id: string };
}

export interface WithdrawalAction {
  type: "Withdrawal";
  player: string;
  target: { id: string };
}

export interface DiscardAction {
  type: "Discard";
  player: string;
  target: { id: string; catalogId: string };
}

export interface ChooseAction {
  type: "Choose";
  promptId: string;
  choice: string[] | undefined;
}

export interface ContinueAction {
  type: "Continue";
  promptId: string;
  player: string;
}

export interface MulliganAction {
  type: "Mulligan";
  action: "done" | "retry";
  player: string;
}

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
