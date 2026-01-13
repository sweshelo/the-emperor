/**
 * Game controller - orchestrates WebSocket communication and agent decisions
 */

import type { Agent, ParsedAction } from "../types/agent.ts";
import type {
  ServerMessage,
  ClientMessage,
  GameState,
  ChoicesMessage,
} from "../types/game.ts";
import { GameWebSocketClient } from "../websocket/client.ts";
import { GameStateManager } from "./state.ts";
import { isServerMessagePayload, isSyncPayload, isChoicesPayload, isTurnChangePayload, isMulliganStartPayload, isOperationPayload } from "../schemas/index.ts";

/**
 * Configuration for the game controller
 */
export interface GameControllerConfig {
  /** WebSocket server URL */
  serverUrl: string;
  /** Room ID to join */
  roomId?: string;
  /** Player ID for this agent */
  playerId: string;
  /** Player display name */
  playerName: string;
  /** Deck to use (array of catalog IDs) */
  deck?: string[];
}

/**
 * Game controller that connects WebSocket events to agent decisions
 */
export class GameController {
  private wsClient: GameWebSocketClient;
  private stateManager: GameStateManager;
  private agent: Agent;
  private config: GameControllerConfig;
  private isRunning = false;
  private canAct = false; // defrost/freeze state

  constructor(
    config: GameControllerConfig,
    agent: Agent,
    stateManager?: GameStateManager
  ) {
    this.config = config;
    this.agent = agent;
    this.stateManager = stateManager ?? new GameStateManager();

    this.wsClient = new GameWebSocketClient({
      url: config.serverUrl,
      reconnect: true,
      reconnectAttempts: 5,
      reconnectInterval: 3000,
    });

    // Set player ID in state manager
    this.stateManager.setMyPlayerId(config.playerId);
  }

  /**
   * Start the game controller
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("[Controller] Already running");
      return;
    }

    console.log("[Controller] Starting game controller...");
    console.log(`[Controller] Player ID: ${this.config.playerId}`);
    console.log(`[Controller] Server URL: ${this.config.serverUrl}`);

    // Setup message handlers
    this.setupMessageHandlers();

    // Connect to server
    await this.wsClient.connect();
    this.isRunning = true;

    // Send player entry
    this.sendPlayerEntry();

    console.log("[Controller] Game controller started");
  }

  /**
   * Stop the game controller
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log("[Controller] Stopping game controller...");
    this.wsClient.disconnect();
    this.wsClient.removeAllHandlers();
    this.stateManager.reset();
    this.isRunning = false;
    console.log("[Controller] Game controller stopped");
  }

  /**
   * Setup WebSocket message handlers
   */
  private setupMessageHandlers(): void {
    this.wsClient.onMessage((message: ServerMessage) => {
      this.handleServerMessage(message).catch((err) => {
        console.error("[Controller] Error handling message:", err);
      });
    });

    this.wsClient.onConnect(() => {
      console.log("[Controller] Connected to game server");
    });

    this.wsClient.onDisconnect(() => {
      console.log("[Controller] Disconnected from game server");
    });

    this.wsClient.onError((error) => {
      console.error("[Controller] WebSocket error:", error);
    });
  }

  /**
   * Handle incoming server message
   */
  private async handleServerMessage(message: ServerMessage): Promise<void> {
    const payload = message.payload;

    if (!isServerMessagePayload(payload)) {
      console.log("[Controller] Unknown message format");
      return;
    }

    if (!("type" in payload)) {
      return;
    }

    const payloadType = payload.type;

    switch (payloadType) {
      case "Sync":
        if (isSyncPayload(payload)) {
          await this.handleSync(payload.body);
        }
        break;

      case "Choices":
        if (isChoicesPayload(payload)) {
          await this.handleChoices(payload);
        }
        break;

      case "TurnChange":
        if (isTurnChangePayload(payload)) {
          this.handleTurnChange(payload.player, payload.isFirst);
        }
        break;

      case "MulliganStart":
        if (isMulliganStartPayload(payload)) {
          await this.handleMulliganStart();
        }
        break;

      case "Operation":
        if (isOperationPayload(payload)) {
          await this.handleOperation(payload.action);
        }
        break;

      default:
        console.log(`[Controller] Unhandled message type: ${payloadType}`);
        console.error(message)
    }
  }

  /**
   * Handle game state sync
   */
  private async handleSync(state: GameState): Promise<void> {
    console.log(`[Controller] Sync - Round: ${state.game.round}, Turn: ${state.game.turn}`);
    this.stateManager.updateState(state);

    // Notify agent about state update (for real-time analysis)
    if (this.agent.pushGameStateUpdate) {
      this.agent.pushGameStateUpdate(state);
    }

    // If we received defrost before Sync, now we can act
    await this.tryAct();
  }

  /**
   * Handle choice prompt
   */
  private async handleChoices(choice: ChoicesMessage): Promise<void> {
    console.log(`[Controller] Choice received: ${choice.choices.title}`);

    // Only respond if it's our turn
    if (choice.player !== this.config.playerId) {
      console.log("[Controller] Not our turn, waiting...");
      return;
    }

    // Update state manager with current choice
    this.stateManager.setChoice(choice);

    // Get decision context
    const context = this.stateManager.getDecisionContext();
    if (!context) {
      console.error("[Controller] Cannot get decision context");
      return;
    }

    try {
      // Request decision from agent
      const action = await this.agent.decideAction(context);

      // Execute the action
      this.executeAction(action);

      // Clear the current choice
      this.stateManager.clearChoice();
    } catch (error) {
      console.error("[Controller] Agent decision error:", error);
    }
  }

  /**
   * Handle turn change notification
   */
  private handleTurnChange(player: string, isFirst: boolean): void {
    const isMyTurn = player === this.config.playerId;
    console.log(`[Controller] Turn change - Player: ${player}, First: ${isFirst}, MyTurn: ${isMyTurn}`);
  }

  /**
   * Handle operation (freeze/defrost) events
   */
  private async handleOperation(action: "freeze" | "defrost"): Promise<void> {
    console.log(`[Controller] Operation: ${action}`);

    if (action === "defrost") {
      this.canAct = true;
      // Try to act now if game state is ready
      await this.tryAct();
    } else {
      // freeze
      this.canAct = false;
    }
  }

  /**
   * Try to take action if conditions are met (canAct && game state ready)
   */
  private async tryAct(): Promise<void> {
    if (!this.canAct) {
      return;
    }

    const context = this.stateManager.getDecisionContext();
    if (!context) {
      // Game state not yet synced - will retry when Sync arrives
      return;
    }

    // Reset flag before calling agent to prevent duplicate calls
    this.canAct = false;

    try {
      const decisionAction = await this.agent.decideAction(context);
      this.executeAction(decisionAction);
    } catch (error) {
      console.error("[Controller] Agent decision error:", error);
    }
  }

  /**
   * Handle mulligan start
   */
  private async handleMulliganStart(): Promise<void> {
    console.log("[Controller] Mulligan phase started");

    const myPlayer = this.stateManager.getMyPlayer();
    if (!myPlayer) {
      console.error("[Controller] Cannot get player for mulligan");
      return;
    }

    // Check if agent supports mulligan decisions
    if (!this.agent.decideMulligan) {
      console.log("[Controller] Agent does not support mulligan - keeping hand");
      this.wsClient.sendMcpAction({
        type: "Mulligan",
        player: this.config.playerId,
        action: "done",
      });
      return;
    }

    try {
      const action = await this.agent.decideMulligan(myPlayer.hand, this.config.playerId);
      this.executeAction(action);
    } catch (error) {
      console.error("[Controller] Mulligan decision error:", error);
    }
  }

  /**
   * Execute an action by sending it to the server
   */
  private executeAction(action: ParsedAction): void {
    console.log(`[Controller] Executing action: ${action.type}`);
    this.wsClient.sendMcpAction(action.payload);
  }

  /**
   * Send player entry to join the game
   */
  private sendPlayerEntry(): void {
    // PlayerEntryPayload requires roomId and deck
    const roomId = this.config.roomId ?? "default";
    const deck = this.config.deck ?? [];

    // PlayerEntry must use handler: "room" for server-side room.join() processing
    const message: ClientMessage = {
      action: {
        type: "join",
        handler: "room",
      },
      payload: {
        type: "PlayerEntry",
        roomId,
        player: {
          id: this.config.playerId,
          name: this.config.playerName,
          deck,
        },
      },
    };

    console.log(`[Controller] Sending player entry: ${this.config.playerName} to room ${roomId}`);
    this.wsClient.send(message);
  }

  /**
   * Check if the controller is running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}
