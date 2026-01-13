# The Emperor 🤖

AI Agent for CODE OF JOKER Simulator ([the-fool](https://github.com/sweshelo/the-fool))

## Overview

The Emperor is an AI agent designed to play CODE OF JOKER, a Japanese arcade card game, through the-fool simulator. The agent acts as a WebSocket client that connects to the game server and provides tools via MCP (Model Context Protocol) for Claude API to make intelligent decisions.

## Architecture

```
the-fool (Game Server)
    ↕ WebSocket (Game state sync, Actions)
the-emperor (MCP Server + WebSocket Client)
    ├─ WebSocket Client: Game communication
    ├─ MCP Server: Provides tools to Claude API
    ├─ Catalog Service: Card database access
    └─ Game State Manager: Tracks game state
    ↕ MCP Protocol (Tool calls)
Claude API (AI Decision Making)
```

## Features

### Core Infrastructure
- **WebSocket Client**: Real-time communication with game server
- **MCP Server**: Provides tools to Claude API via Model Context Protocol
- **Type-Safe**: Full TypeScript type safety with strict mode

### Game Integration
- **Card Catalog**: Complete card database with search capabilities
- **Game State Management**: Real-time game state tracking
- **Action Execution**: All game actions (summon, attack, abilities, etc.)

### MCP Tools

#### Catalog Tools
- `get_card`: Get card details by catalog ID
- `search_cards_by_name`: Search cards by name
- `search_cards_by_ability`: Search cards by ability text
- `get_cards_by_type`: Filter cards by type
- `get_cards_by_cost_range`: Filter cards by cost range

#### Game State Tools
- `get_game_state`: Get complete game state
- `get_my_player`: Get your player information
- `get_opponent_player`: Get opponent information
- `get_current_choice`: Get active choice prompt
- `get_hand_details`: Get detailed hand information with catalog data
- `get_field_details`: Get detailed field information with catalog data

#### Action Tools
- `summon_unit`: Summon a unit from hand
- `evolve_unit`: Evolve a unit on field
- `use_joker`: Use JOKER card
- `set_trigger`: Set trigger/intercept
- `attack`: Attack with a unit
- `use_boot_ability`: Use activated ability
- `withdraw_unit`: Withdraw a unit
- `respond_to_choice`: Respond to choice prompts
- `end_turn`: End your turn
- `mulligan`: Mulligan decision

#### Sandbox Tools (for move evaluation)
- `check_sandbox`: Check sandbox availability
- `create_sandbox_room`: Create sandbox room (ID: 99999)
- `load_sandbox_state`: Load game state into sandbox
- `start_sandbox_game`: Start sandbox game (skip mulligan)
- `destroy_sandbox_room`: Destroy sandbox room
- `evaluate_move`: Full workflow to evaluate a move

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Bun 1.3.5+
- **Protocol**: WebSocket + MCP (Model Context Protocol)
- **AI Integration**: Claude API with Function Calling
- **Testing**: Bun test

## Project Structure

```
the-emperor/
├── src/
│   ├── websocket/           # WebSocket client implementation
│   │   └── client.ts        # Game server WebSocket client
│   ├── mcp/                 # MCP server implementation
│   │   ├── server.ts        # MCP server main
│   │   ├── types/           # MCP type definitions
│   │   └── tools/           # MCP tools
│   │       ├── catalog.ts   # Card catalog access tools
│   │       ├── game-state.ts # Game state access tools
│   │       ├── actions.ts   # Game action execution tools
│   │       └── sandbox.ts   # Sandbox evaluation tools
│   ├── sandbox/             # Sandbox client
│   │   └── client.ts        # HTTP client for sandbox API
│   ├── catalog/             # Card catalog service
│   │   └── index.ts         # Catalog access and search
│   ├── game/                # Game state management
│   │   └── state.ts         # State manager
│   ├── types/               # Type definitions
│   │   ├── index.ts         # Core agent types
│   │   └── game.ts          # Game-specific types
│   ├── agent/               # AI agent implementations
│   │   └── base.ts          # Base agent class
│   └── index.ts             # Main entry point
├── suit/                    # Submodule: Card catalog and types
├── the-fool/                # Submodule: Game simulator (reference)
├── the-magician/            # Submodule: WebSocket client reference
├── tests/                   # Test files
│   ├── agent.test.ts        # Agent tests
│   ├── sandbox-integration.test.ts # Basic sandbox tests
│   ├── sandbox-comprehensive.test.ts # Comprehensive sandbox tests
│   └── helpers/             # Test helper utilities
│       └── data-loader.ts   # Game state data loading helpers
├── data/                    # Test data
│   └── payload/
│       └── sync.json        # Real game sync data sample
├── SANDBOX_TESTING.md       # Sandbox testing guide
├── package.json
└── tsconfig.json
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) 1.3.5 or later
- Access to the-fool game server (WebSocket endpoint)

### Installation

```bash
# Clone the repository with submodules
git clone --recursive https://github.com/sweshelo/the-emperor.git
cd the-emperor

# Install dependencies
bun install
```

### Running the MCP Server

```bash
# Set environment variables (optional)
export GAME_SERVER_URL="ws://localhost:3000"
export PLAYER_ID="your-player-id"

# Start MCP server
bun run mcp
```

The MCP server runs on stdio and can be integrated with Claude Desktop or used programmatically.

### Development

```bash
# Run in development mode (with watch)
bun run dev

# Run once
bun run start

# Run tests
bun test

# Type check
bun run typecheck
```

## API Communication Specification

### Received Messages

#### Sync (Game State)
Game state is synchronized every time it updates.

```typescript
{
  type: 'Sync',
  body: {
    rule: Rule,
    game: { round: number, turn: number },
    players: { [playerId: string]: IPlayer }
  }
}
```

#### Choices (Selection Request)
Sent when the game requires a choice (blocking, intercepting, card selection).

```typescript
{
  type: 'Choices',
  promptId: string,
  player: string,
  choices: {
    title: string,
    isCancelable?: boolean,
    type: 'card' | 'option' | 'intercept' | 'unit' | 'block',
    items: ICard[] | IUnit[] | Option[],
    count?: number
  }
}
```

### Sent Actions

All actions are sent as JSON to the WebSocket server:

```typescript
// Summon unit
{ type: "UnitDrive", player: "<playerId>", target: { id: "<cardId>" } }

// Attack
{ type: "Attack", player: "<playerId>", target: { id: "<unitId>" } }

// Respond to choice
{ type: "Choose", promptId: "<promptId>", choice: ["<id>", ...] }

// End turn
{ type: "Continue", promptId: "<promptId>", player: "<playerId>" }
```

See the full specification in the API documentation.

## Development Status

🚧 This project is in active development.

### Current Progress

- [x] Project initialization
- [x] TypeScript environment setup
- [x] WebSocket client implementation
- [x] MCP server infrastructure
- [x] Card catalog integration
- [x] Game state management
- [x] MCP tools implementation (catalog, state, actions, sandbox)
- [x] Sandbox API client implementation
- [x] Sandbox MCP tools (6 tools for move evaluation)
- [x] Integration testing framework
- [ ] Full integration testing with live game server
- [ ] AI decision-making strategies
- [ ] Advanced move evaluation algorithms
- [ ] Performance optimization

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Related Projects

- [the-fool](https://github.com/sweshelo/the-fool) - CODE OF JOKER Simulator
- [the-magician](https://github.com/sweshelo/the-magician) - Web UI for the-fool
- [suit](https://github.com/sweshelo/suit) - Card catalog and type definitions

## Credits

Developed for CODE OF JOKER Simulator ecosystem by sweshelo.
