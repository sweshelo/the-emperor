/**
 * CLI module for agent startup commands
 */

import * as readline from "node:readline";
import type { AgentMode } from "../types/agent.ts";

/**
 * Readline interface for CLI
 */
let rl: readline.Interface | null = null;

function getReadline(): readline.Interface {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }
  return rl;
}

/**
 * Close the readline interface
 */
export function closeReadline(): void {
  if (rl) {
    rl.close();
    rl = null;
  }
}

/**
 * Read a line from stdin
 */
export function readLine(prompt: string): Promise<string> {
  const reader = getReadline();
  return new Promise((resolve) => {
    reader.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Display mode selection menu and get user choice
 */
export async function selectMode(): Promise<AgentMode> {
  console.log("\n--- SELECT MODE ---");
  console.log("  1. autonomous  - AI controls everything");
  console.log("  2. buddy       - You control via command line");
  console.log("");

  while (true) {
    const input = await readLine("Select mode (1 or 2): ");

    if (input === "1" || input === "autonomous") {
      return "autonomous";
    }
    if (input === "2" || input === "buddy") {
      return "buddy";
    }

    console.log("Invalid selection. Please enter 1 or 2.");
  }
}

/**
 * Parse result of /join command
 */
export interface JoinCommandResult {
  roomId: string;
}

/**
 * Wait for startup commands
 * Returns when a valid /join command is received
 */
export async function waitForJoinCommand(): Promise<JoinCommandResult> {
  console.log("\n--- WAITING FOR COMMANDS ---");
  console.log("  /join <roomId>  - Join a game room");
  console.log("  /help           - Show available commands");
  console.log("  /quit           - Exit the agent");
  console.log("");

  while (true) {
    const input = await readLine("> ");
    const parts = input.split(/\s+/);
    const command = parts[0]?.toLowerCase();

    switch (command) {
      case "/join": {
        const roomId = parts[1];
        if (!roomId) {
          console.log("Usage: /join <roomId>");
          continue;
        }
        return { roomId };
      }

      case "/help":
        console.log("\nAvailable commands:");
        console.log("  /join <roomId>  - Join a game room");
        console.log("  /quit           - Exit the agent");
        console.log("");
        continue;

      case "/quit":
      case "/exit":
        console.log("Exiting...");
        process.exit(0);

      default:
        if (input) {
          console.log(`Unknown command: ${input}`);
          console.log("Type /help for available commands.");
        }
        continue;
    }
  }
}
