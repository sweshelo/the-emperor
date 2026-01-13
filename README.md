# The Emperor 🤖

AI Agent for CODE OF JOKER Simulator ([the-fool](https://github.com/sweshelo/the-fool))

## Overview

The Emperor is an AI agent designed to play CODE OF JOKER, a Japanese arcade card game, through the-fool simulator. This project uses TypeScript and Bun runtime for optimal performance and type safety.

## Features

- TypeScript-based AI agent architecture
- Integration with the-fool simulator types and data
- Extensible agent interface for different AI strategies
- Comprehensive testing with Bun test runner

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Bun 1.3.5+
- **Testing**: Bun test

## Project Structure

```
the-emperor/
├── src/
│   ├── agent/          # AI agent implementations
│   │   └── base.ts     # Base agent class
│   ├── types/          # Type definitions
│   │   └── index.ts    # Core types
│   ├── utils/          # Utility functions
│   └── index.ts        # Main entry point
├── tests/              # Test files
│   └── agent.test.ts   # Agent tests
├── package.json
└── tsconfig.json
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) 1.3.5 or later

### Installation

```bash
# Clone the repository
git clone https://github.com/sweshelo/the-emperor.git
cd the-emperor

# Install dependencies
bun install
```

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

## Development Status

🚧 This project is in early development. The AI agent architecture is being built from scratch.

### Current Progress

- [x] Project initialization
- [x] TypeScript environment setup
- [x] Basic project structure
- [x] Base agent interface
- [ ] Integration with the-fool simulator
- [ ] AI decision-making logic
- [ ] Game state management
- [ ] Training and evaluation framework

## License

MIT

## Related Projects

- [the-fool](https://github.com/sweshelo/the-fool) - CODE OF JOKER Simulator
