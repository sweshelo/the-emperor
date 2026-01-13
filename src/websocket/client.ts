/**
 * WebSocket client for CODE OF JOKER game server
 */

import type { ServerMessage, ClientMessage } from "../types/game.ts";

export type MessageHandler = (message: ServerMessage) => void;
export type ErrorHandler = (error: Error) => void;
export type ConnectionHandler = () => void;

export interface WebSocketClientConfig {
  url: string;
  reconnect?: boolean;
  reconnectInterval?: number;
  reconnectAttempts?: number;
}

/**
 * WebSocket client for game communication
 */
export class GameWebSocketClient {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketClientConfig>;
  private messageHandlers: Set<MessageHandler> = new Set();
  private errorHandlers: Set<ErrorHandler> = new Set();
  private connectHandlers: Set<ConnectionHandler> = new Set();
  private disconnectHandlers: Set<ConnectionHandler> = new Set();
  private reconnectAttempt = 0;
  private isManualDisconnect = false;

  constructor(config: WebSocketClientConfig) {
    this.config = {
      reconnect: true,
      reconnectInterval: 3000,
      reconnectAttempts: 5,
      ...config,
    };
  }

  /**
   * Connect to the game server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;

      try {
        this.isManualDisconnect = false;
        this.ws = new WebSocket(this.config.url);

        this.ws.onopen = () => {
          if (settled) return;
          settled = true;
          console.log("[WebSocket] Connected to game server");
          this.reconnectAttempt = 0;
          this.connectHandlers.forEach((handler) => handler());
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as ServerMessage;
            this.messageHandlers.forEach((handler) => handler(message));
          } catch (error) {
            console.error("[WebSocket] Failed to parse message:", error);
            const err = error instanceof Error ? error : new Error(String(error));
            this.errorHandlers.forEach((handler) => handler(err));
          }
        };

        this.ws.onerror = (event) => {
          const error = new Error("WebSocket error occurred");
          console.error("[WebSocket] Error:", event);
          this.errorHandlers.forEach((handler) => handler(error));

          // Reject promise if not yet settled (initial connection failure)
          if (!settled) {
            settled = true;
            reject(error);
          }
        };

        this.ws.onclose = () => {
          console.log("[WebSocket] Disconnected from game server");
          this.disconnectHandlers.forEach((handler) => handler());

          // Reject promise if not yet settled (connection closed before open)
          if (!settled) {
            settled = true;
            reject(new Error("WebSocket connection closed before opening"));
          }

          // Auto-reconnect if enabled and not manually disconnected
          if (
            this.config.reconnect &&
            !this.isManualDisconnect &&
            this.reconnectAttempt < this.config.reconnectAttempts
          ) {
            this.reconnectAttempt++;
            console.log(
              `[WebSocket] Reconnecting... (${this.reconnectAttempt}/${this.config.reconnectAttempts})`
            );
            setTimeout(() => {
              this.connect().catch((err) => {
                console.error("[WebSocket] Reconnection failed:", err);
              });
            }, this.config.reconnectInterval);
          }
        };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        reject(err);
      }
    });
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    this.isManualDisconnect = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Send a message to the server
   */
  send(message: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }

    const payload = JSON.stringify(message);
    console.log("[WebSocket] Sending:", message.payload.type);
    this.ws.send(payload);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Register a message handler
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Register an error handler
   */
  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  /**
   * Register a connection handler
   */
  onConnect(handler: ConnectionHandler): () => void {
    this.connectHandlers.add(handler);
    return () => this.connectHandlers.delete(handler);
  }

  /**
   * Register a disconnection handler
   */
  onDisconnect(handler: ConnectionHandler): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  /**
   * Remove all handlers
   */
  removeAllHandlers(): void {
    this.messageHandlers.clear();
    this.errorHandlers.clear();
    this.connectHandlers.clear();
    this.disconnectHandlers.clear();
  }
}
