/**
 * Public API surface for @pibloom/core.
 *
 * This barrel file is the ONLY entry point for consumers (`import { ... } from "@pibloom/core"`).
 * It re-exports from every internal module — no facades, every export traces directly to its
 * source. Organized into sections:
 *
 *   1. Bridge bootstrap — utilities bridges use to initialize
 *   2. Affordances — HATEOAS response parsing and rendering
 *   3. Agent session — Pi agent integration
 *   4. Discovery — bridge manifest parsing
 *   5. Concrete adapters — implementations of port interfaces
 *   6. Capability system — registry, config, bootstrap factories
 *   7. Port interfaces — hexagonal architecture contracts
 *   8. Value types — data-only shapes (no behavior)
 */

// --- Bridge bootstrap ---
// Shared utilities that every bridge uses to start up: load config, create registry,
// wire message routing, health reporting, and serialized message processing.
export type { BootstrapOptions, BootstrapResult } from "./bridge-bootstrap.js";
export {
  bootstrapBridge,
  bridgePibloomConfig,
  HealthFileReporter,
  loadBaseBridgeConfig,
  MessageQueue,
} from "./bridge-bootstrap.js";

// --- Affordances (HATEOAS response system) ---
// Parses raw agent text output into structured responses with links and media refs,
// then renders them back to plain text for messaging channels.
export { mimeFromPath } from "./capabilities/affordances/mime.js";
export type {
  HateoasResponse,
  Link,
  MediaRef,
  ParsedAgentOutput,
} from "./capabilities/affordances/parser.js";
export {
  isLink,
  isMediaRef,
  parseAgentOutput,
  toHateoasResponse,
  validateLink,
} from "./capabilities/affordances/parser.js";
export type { ResponseRenderer } from "./capabilities/affordances/text-renderer.js";
export { TextRenderer } from "./capabilities/affordances/text-renderer.js";

// --- Agent session ---
// Pi agent lifecycle: create sessions, process messages, manage extensions.
export type { ExtensionFactory } from "./capabilities/agent-session/extension.js";
export { createPibloomExtension } from "./capabilities/agent-session/extension.js";
export { AgentSessionCapability } from "./capabilities/agent-session/index.js";
export type { BridgeConfig } from "./capabilities/agent-session/pi-agent-bridge.js";
export {
  AgentBridge,
  isAllowed,
  validatePhoneNumber,
} from "./capabilities/agent-session/pi-agent-bridge.js";

// --- Discovery (bridge manifests) ---
// Parse, validate, and template-resolve bridge manifest.yaml files.
export type {
  BridgeManifest,
  CapabilityManifest,
  ConfigSchemaField,
  PodSpec,
  TimerSpec,
} from "./capabilities/discovery/index.js";
export {
  CapabilityExtractor,
  DiscoveryCapability,
  parseBridgeManifest,
  parseManifest,
  resolveManifestTemplates,
  validateBridgeManifest,
  validateManifest,
} from "./capabilities/discovery/index.js";

// --- Concrete adapter implementations ---
// Each of these implements a port interface from ./ports/.
export { EvolveManager } from "./capabilities/evolution/evolve-manager.js";
export { JsYamlFrontmatterParser } from "./capabilities/frontmatter/js-yaml-parser.js";
export { MarkdownFileStore as ObjectStore } from "./capabilities/object-store/markdown-file-store.js";
export {
  extractChannelSection,
  FsPersonaLoader,
} from "./capabilities/persona/fs-persona-loader.js";
export {
  parseInterval,
  QuadletSetupGenerator,
  renderQuadletContainer,
  renderQuadletPod,
  renderQuadletTimer,
} from "./capabilities/setup/quadlet-generator.js";
export { NodeSystemExecutor } from "./capabilities/system-executor/node-executor.js";

// --- Capability system ---
// The plug-in architecture: Capability interface, phased registry, bootstrap factories.
export type {
  Capability,
  CapabilityConfig,
  CapabilityRegistration,
  CoreServices,
  LeafServices,
} from "./capability.js";
export {
  createDefaultRegistry,
  createInitializedRegistry,
} from "./defaults.js";
export { CapabilityRegistry } from "./registry.js";

// --- Port interfaces (hexagonal architecture contracts) ---
// These define WHAT the system can do, not HOW. Adapters in capabilities/ implement them.
export type {
  BridgeInstallOptions,
  IAgentBridge,
  IConfigReader,
  IEvolveManager,
  IFrontmatterParser,
  IMediaTranscriber,
  IncomingMessage,
  IObjectStore,
  IPersonaLoader,
  ISystemExecutor,
  MediaAttachment,
  MessageChannel,
  ObjectData,
  ObjectFilters,
  ObjectRef,
  OutgoingMedia,
  TranscriptionResult,
} from "./ports/index.js";

// --- Value types (data shapes, no behavior) ---
export type {
  AgentConfig,
  ContainerSpec,
  EvolveOptions,
  GeneratedFile,
  PibloomConfig,
  SetupOptions,
} from "./types.js";
