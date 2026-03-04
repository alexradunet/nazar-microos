// --- Ports (interfaces) ---

export type { BootstrapOptions, BootstrapResult } from "./bridge-bootstrap.js";
// --- Bridge bootstrap ---
export {
  bootstrapBridge,
  bridgePibloomConfig,
  HealthFileReporter,
  loadBaseBridgeConfig,
  MessageQueue,
} from "./bridge-bootstrap.js";
export { mimeFromPath } from "./capabilities/affordances/mime.js";
// --- Affordances (HATEOAS) ---
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
export type { ExtensionFactory } from "./capabilities/agent-session/extension.js";
export { createPibloomExtension } from "./capabilities/agent-session/extension.js";
export { AgentSessionCapability } from "./capabilities/agent-session/index.js";
// --- Concrete implementations ---
export type { BridgeConfig } from "./capabilities/agent-session/pi-agent-bridge.js";
export {
  AgentBridge,
  isAllowed,
  validatePhoneNumber,
} from "./capabilities/agent-session/pi-agent-bridge.js";
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
export { CapabilityRegistry } from "./registry.js";
// --- Value types ---
export type {
  AgentConfig,
  ContainerSpec,
  EvolveOptions,
  GeneratedFile,
  PibloomConfig,
  SetupOptions,
} from "./types.js";
