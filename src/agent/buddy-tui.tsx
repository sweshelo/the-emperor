/**
 * TUI Component for Buddy Mode using ink
 */

import React, { useState, useCallback, useEffect } from "react";
import { render, Box, Text, useInput, useApp, useStdin } from "ink";
import TextInput from "ink-text-input";

/**
 * Message type for log display
 */
export interface TuiMessage {
  type: "system" | "game" | "user" | "error" | "ai";
  content: string;
  timestamp?: number;
}

/**
 * Props for BuddyTui component
 */
interface BuddyTuiProps {
  messages: TuiMessage[];
  onCommand: (command: string) => void;
  prompt: string;
  isInputEnabled: boolean;
  gameStatus: string;
}

/**
 * Color mapping for message types
 */
const MESSAGE_COLORS: Record<TuiMessage["type"], string> = {
  system: "cyan",
  game: "white",
  user: "green",
  error: "red",
  ai: "yellow",
};

/**
 * Prefix for message types
 */
const MESSAGE_PREFIX: Record<TuiMessage["type"], string> = {
  system: "[SYS]",
  game: "[GAME]",
  user: ">",
  error: "[ERR]",
  ai: "[AI]",
};

/**
 * Main TUI Component
 */
function BuddyTuiApp({
  messages,
  onCommand,
  prompt,
  isInputEnabled,
  gameStatus,
}: BuddyTuiProps): React.ReactElement {
  const [input, setInput] = useState("");
  const { exit } = useApp();
  const { setRawMode } = useStdin();

  // Enable raw mode for proper input handling
  useEffect(() => {
    setRawMode(true);
    return () => {
      setRawMode(false);
    };
  }, [setRawMode]);

  // Handle Ctrl+C to exit
  useInput((inputChar, key) => {
    if (key.ctrl && inputChar === "c") {
      exit();
      process.exit(0);
    }
  });

  const handleSubmit = useCallback(
    (value: string) => {
      // Always accept input (even during opponent's turn)
      if (value.trim()) {
        onCommand(value.trim());
        setInput("");
      }
    },
    [onCommand]
  );

  // Get last N messages to display
  const displayMessages = messages.slice(-20);

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box borderStyle="single" borderColor="blue" paddingX={1}>
        <Text color="blue" bold>
          THE EMPEROR - Buddy Mode
        </Text>
        <Text> | </Text>
        <Text color="yellow">{gameStatus}</Text>
      </Box>

      {/* Message Area */}
      <Box
        flexDirection="column"
        flexGrow={1}
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        paddingY={0}
      >
        {displayMessages.map((msg, index) => (
          <Box key={index}>
            <Text color={MESSAGE_COLORS[msg.type]}>{MESSAGE_PREFIX[msg.type]} </Text>
            <Text color={MESSAGE_COLORS[msg.type]}>{msg.content}</Text>
          </Box>
        ))}
      </Box>

      {/* Input Area - Always enabled for input */}
      <Box borderStyle="single" borderColor={isInputEnabled ? "green" : "yellow"} paddingX={1}>
        <Text color={isInputEnabled ? "green" : "yellow"}>{prompt} </Text>
        <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
        {!isInputEnabled && <Text color="gray"> (opponent's turn)</Text>}
      </Box>
    </Box>
  );
}

/**
 * TUI Controller class for managing the ink application
 */
export class TuiController {
  private messages: TuiMessage[] = [];
  private inputCallback: ((command: string) => void) | null = null;
  private inputResolve: ((command: string) => void) | null = null;
  private commandQueue: string[] = [];
  private prompt: string = ">";
  private isInputEnabled: boolean = true;
  private gameStatus: string = "Initializing...";
  private rerender: (() => void) | null = null;
  private inkInstance: ReturnType<typeof render> | null = null;

  /**
   * Start the TUI
   */
  start(): void {
    const TuiWrapper = (): React.ReactElement => {
      const [, forceUpdate] = useState({});

      useEffect(() => {
        this.rerender = () => forceUpdate({});
        return () => {
          this.rerender = null;
        };
      }, []);

      return (
        <BuddyTuiApp
          messages={this.messages}
          onCommand={this.handleCommand.bind(this)}
          prompt={this.prompt}
          isInputEnabled={this.isInputEnabled}
          gameStatus={this.gameStatus}
        />
      );
    };

    this.inkInstance = render(<TuiWrapper />);
  }

  /**
   * Stop the TUI
   */
  stop(): void {
    if (this.inkInstance) {
      this.inkInstance.unmount();
      this.inkInstance = null;
    }
  }

  /**
   * Handle command input
   */
  private handleCommand(command: string): void {
    // Add user message to log
    this.addMessage("user", command);

    // If there's a pending readLine, resolve it immediately
    if (this.inputResolve) {
      const resolve = this.inputResolve;
      this.inputResolve = null;
      resolve(command);
    } else {
      // Otherwise queue the command for later
      this.commandQueue.push(command);
    }

    if (this.inputCallback) {
      this.inputCallback(command);
    }
  }

  /**
   * Add a message to the log
   */
  addMessage(type: TuiMessage["type"], content: string): void {
    this.messages.push({
      type,
      content,
      timestamp: Date.now(),
    });
    this.rerender?.();
  }

  /**
   * Add multiple lines as messages
   */
  addLines(type: TuiMessage["type"], lines: string): void {
    for (const line of lines.split("\n")) {
      if (line.trim()) {
        this.addMessage(type, line);
      }
    }
  }

  /**
   * Set the prompt text
   */
  setPrompt(prompt: string): void {
    this.prompt = prompt;
    this.rerender?.();
  }

  /**
   * Enable or disable input
   */
  setInputEnabled(enabled: boolean): void {
    this.isInputEnabled = enabled;
    this.rerender?.();
  }

  /**
   * Set game status text
   */
  setGameStatus(status: string): void {
    this.gameStatus = status;
    this.rerender?.();
  }

  /**
   * Wait for user input (checks queue first)
   */
  async readLine(prompt?: string): Promise<string> {
    if (prompt) {
      this.setPrompt(prompt);
    }
    this.setInputEnabled(true);

    // Check if there's already a queued command
    const queuedCommand = this.commandQueue.shift();
    if (queuedCommand !== undefined) {
      return queuedCommand;
    }

    // Otherwise wait for new input
    return new Promise((resolve) => {
      this.inputResolve = resolve;
    });
  }

  /**
   * Set callback for input (alternative to readLine)
   */
  onInput(callback: (command: string) => void): void {
    this.inputCallback = callback;
  }

  /**
   * Clear input callback
   */
  clearInputCallback(): void {
    this.inputCallback = null;
  }

  /**
   * Clear all messages
   */
  clearMessages(): void {
    this.messages = [];
    this.rerender?.();
  }

  /**
   * Get number of queued commands
   */
  getQueueLength(): number {
    return this.commandQueue.length;
  }

  /**
   * Clear command queue
   */
  clearQueue(): void {
    this.commandQueue = [];
  }
}
