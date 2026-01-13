/**
 * Sandbox API client for the-fool game server
 */

import type { GameState } from "../types/game.ts";

export interface SandboxStatus {
  enabled: boolean;
  roomId: string;
  roomExists: boolean;
  playerCount: number;
}

export interface SandboxCreateResponse {
  success: boolean;
  roomId: string;
}

export interface SandboxLoadStateResponse {
  success: boolean;
  message: string;
  round: number;
  turn: number;
}

export interface SandboxStartResponse {
  success: boolean;
  message: string;
  playerCount: number;
}

export interface SandboxDestroyResponse {
  success: boolean;
  message: string;
}

/** Default sandbox server URL */
const DEFAULT_SANDBOX_URL = "http://localhost:5000";

/**
 * Type guard for SandboxStatus
 */
function isSandboxStatus(data: unknown): data is SandboxStatus {
  if (typeof data !== "object" || data === null) return false;
  return (
    "enabled" in data &&
    typeof data.enabled === "boolean" &&
    "roomId" in data &&
    typeof data.roomId === "string" &&
    "roomExists" in data &&
    typeof data.roomExists === "boolean" &&
    "playerCount" in data &&
    typeof data.playerCount === "number"
  );
}

/**
 * Type guard for SandboxCreateResponse
 */
function isSandboxCreateResponse(data: unknown): data is SandboxCreateResponse {
  if (typeof data !== "object" || data === null) return false;
  return (
    "success" in data &&
    typeof data.success === "boolean" &&
    "roomId" in data &&
    typeof data.roomId === "string"
  );
}

/**
 * Type guard for SandboxLoadStateResponse
 */
function isSandboxLoadStateResponse(
  data: unknown
): data is SandboxLoadStateResponse {
  if (typeof data !== "object" || data === null) return false;
  return (
    "success" in data &&
    typeof data.success === "boolean" &&
    "message" in data &&
    typeof data.message === "string" &&
    "round" in data &&
    typeof data.round === "number" &&
    "turn" in data &&
    typeof data.turn === "number"
  );
}

/**
 * Type guard for SandboxStartResponse
 */
function isSandboxStartResponse(data: unknown): data is SandboxStartResponse {
  if (typeof data !== "object" || data === null) return false;
  return (
    "success" in data &&
    typeof data.success === "boolean" &&
    "message" in data &&
    typeof data.message === "string" &&
    "playerCount" in data &&
    typeof data.playerCount === "number"
  );
}

/**
 * Type guard for SandboxDestroyResponse
 */
function isSandboxDestroyResponse(
  data: unknown
): data is SandboxDestroyResponse {
  if (typeof data !== "object" || data === null) return false;
  return (
    "success" in data &&
    typeof data.success === "boolean" &&
    "message" in data &&
    typeof data.message === "string"
  );
}

/**
 * Sandbox API client for evaluating game moves
 */
export class SandboxClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    const url = baseUrl ?? process.env.SANDBOX_URL ?? DEFAULT_SANDBOX_URL;
    // Remove trailing slash if present
    this.baseUrl = url.endsWith("/") ? url.slice(0, -1) : url;
  }

  /**
   * Get sandbox status
   */
  async getStatus(): Promise<SandboxStatus> {
    const response = await fetch(`${this.baseUrl}/api/sandbox/status`);

    if (!response.ok) {
      throw new Error(
        `Failed to get sandbox status: ${response.status} ${response.statusText}`
      );
    }

    const data: unknown = await response.json();
    if (!isSandboxStatus(data)) {
      throw new Error("Invalid sandbox status response");
    }
    return data;
  }

  /**
   * Create sandbox room (room ID: 99999)
   */
  async createRoom(): Promise<SandboxCreateResponse> {
    const response = await fetch(`${this.baseUrl}/api/sandbox/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to create sandbox room: ${response.status} ${response.statusText}`
      );
    }

    const data: unknown = await response.json();
    if (!isSandboxCreateResponse(data)) {
      throw new Error("Invalid create room response");
    }
    return data;
  }

  /**
   * Load game state from SyncPayload
   */
  async loadState(
    state: GameState | Record<string, unknown>
  ): Promise<SandboxLoadStateResponse> {
    const response = await fetch(`${this.baseUrl}/api/sandbox/load-state`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(state),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to load sandbox state: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data: unknown = await response.json();
    if (!isSandboxLoadStateResponse(data)) {
      throw new Error("Invalid load state response");
    }
    return data;
  }

  /**
   * Start sandbox game (skip mulligan)
   */
  async startGame(): Promise<SandboxStartResponse> {
    const response = await fetch(`${this.baseUrl}/api/sandbox/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to start sandbox game: ${response.status} ${response.statusText}`
      );
    }

    const data: unknown = await response.json();
    if (!isSandboxStartResponse(data)) {
      throw new Error("Invalid start game response");
    }
    return data;
  }

  /**
   * Destroy sandbox room
   */
  async destroyRoom(): Promise<SandboxDestroyResponse> {
    const response = await fetch(`${this.baseUrl}/api/sandbox/destroy`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to destroy sandbox room: ${response.status} ${response.statusText}`
      );
    }

    const data: unknown = await response.json();
    if (!isSandboxDestroyResponse(data)) {
      throw new Error("Invalid destroy room response");
    }
    return data;
  }

  /**
   * Full sandbox workflow: create room, load state, and start game
   */
  async setupAndRun(state: GameState): Promise<{
    roomId: string;
    round: number;
    turn: number;
  }> {
    let roomCreated = false;

    try {
      console.log("[Sandbox] Creating sandbox room...");
      const createResult = await this.createRoom();
      roomCreated = true;

      console.log("[Sandbox] Loading game state...");
      const loadResult = await this.loadState(state);

      console.log("[Sandbox] Starting sandbox game...");
      await this.startGame();

      return {
        roomId: createResult.roomId,
        round: loadResult.round,
        turn: loadResult.turn,
      };
    } catch (error) {
      // Clean up orphaned room if creation succeeded but subsequent steps failed
      if (roomCreated) {
        try {
          console.log("[Sandbox] Cleaning up orphaned room after failure...");
          await this.destroyRoom();
        } catch (cleanupError) {
          console.error("[Sandbox] Failed to clean up room:", cleanupError);
        }
      }
      throw error;
    }
  }

  /**
   * Check if sandbox is enabled on the server
   */
  async isEnabled(): Promise<boolean> {
    try {
      const status = await this.getStatus();
      return status.enabled;
    } catch {
      return false;
    }
  }
}
