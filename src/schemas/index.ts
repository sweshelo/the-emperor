/**
 * Schema exports
 */

export {
  parseString,
  parseBoolean,
  parseNumber,
  parseOptionalNumber,
  parseOptionalStringArray,
  parseOptionalObject,
  isPlainObject,
  cardTypeSchema,
  parseCardType,
  type CardType,
} from "./mcp-args.ts";

export {
  sandboxStatusSchema,
  sandboxCreateResponseSchema,
  sandboxLoadStateResponseSchema,
  sandboxStartResponseSchema,
  sandboxDestroyResponseSchema,
  parseSandboxStatus,
  parseSandboxCreateResponse,
  parseSandboxLoadStateResponse,
  parseSandboxStartResponse,
  parseSandboxDestroyResponse,
  isServerMessage,
  gameStateSchema,
  parseGameState,
  choicesPayloadSchema,
  parseChoices,
  isServerMessagePayload,
  isSyncPayload,
  isChoicesPayload,
  isTurnChangePayload,
  isMulliganStartPayload,
  isOperationPayload,
  type SandboxStatus,
  type SandboxCreateResponse,
  type SandboxLoadStateResponse,
  type SandboxStartResponse,
  type SandboxDestroyResponse,
} from "./api-responses.ts";

export {
  catalogCardSchema,
  isValidCatalogCard,
  isJokerCard,
  type CatalogCard,
} from "./catalog.ts";
