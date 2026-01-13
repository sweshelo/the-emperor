/**
 * Sandbox API client for the-fool game server
 */

import type { GameState } from "../types/game.ts";
import {
  parseSandboxStatus,
  parseSandboxCreateResponse,
  parseSandboxLoadStateResponse,
  parseSandboxStartResponse,
  parseSandboxDestroyResponse,
  type SandboxStatus,
  type SandboxCreateResponse,
  type SandboxLoadStateResponse,
  type SandboxStartResponse,
  type SandboxDestroyResponse,
} from "../schemas/index.ts";

export type {
  SandboxStatus,
  SandboxCreateResponse,
  SandboxLoadStateResponse,
  SandboxStartResponse,
  SandboxDestroyResponse,
};

/** Default sandbox server URL */
const DEFAULT_SANDBOX_URL = "http://localhost:5000";

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
    return parseSandboxStatus(data);
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
    return parseSandboxCreateResponse(data);
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
    return parseSandboxLoadStateResponse(data);
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
    return parseSandboxStartResponse(data);
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
    return parseSandboxDestroyResponse(data);
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
