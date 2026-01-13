/**
 * MCP server type definitions
 */

/**
 * Tool result type
 */
export interface ToolResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Tool handler function type
 */
export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

/**
 * Tool definition
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: ToolHandler;
}
