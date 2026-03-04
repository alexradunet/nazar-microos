/**
 * Barrel re-export for all port interfaces.
 *
 * Port interfaces define the hexagonal architecture boundaries: each port is
 * a TypeScript interface that describes what a capability needs from the outside
 * world, without specifying how that need is fulfilled. Implementations
 * (adapters) live in pibloom-core/src/capabilities/ or in bridge services.
 *
 * Import from this barrel rather than from individual port files to keep
 * import paths stable if files are reorganized.
 *
 * For the capability wiring that connects ports to implementations, see
 * ../defaults.ts (createInitializedRegistry).
 */
export type { IAgentBridge } from "./agent-bridge.js";
export type { IConfigReader } from "./config-reader.js";
export type { BridgeInstallOptions, IEvolveManager } from "./evolve-manager.js";
export type { IFrontmatterParser } from "./frontmatter-parser.js";
export type { IHealthReporter } from "./health-reporter.js";
export type { IncomingMessage, MessageChannel } from "./message-channel.js";
export type {
  IObjectStore,
  ObjectData,
  ObjectFilters,
  ObjectRef,
} from "./object-store.js";
export type { IPersonaLoader } from "./persona-loader.js";
export type { ISystemExecutor } from "./system-executor.js";
