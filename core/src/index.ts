// --- Ports (interfaces) ---

// --- Affordances ---
export type { Affordance, AgentResponse } from "./affordances.js";
export {
  formatAffordancesAsText,
  isAffordance,
  parseAgentResponse,
  validateAffordance,
} from "./affordances.js";
// --- Concrete implementations ---
export type { BridgeConfig } from "./agent-bridge.js";
export {
  AgentBridge,
  isAllowed,
  validatePhoneNumber,
} from "./agent-bridge.js";
export type { BootstrapOptions, BootstrapResult } from "./bridge-bootstrap.js";
// --- Bridge bootstrap ---
export {
  bootstrapBridge,
  bridgeNazarConfig,
  HealthFileReporter,
  loadBaseBridgeConfig,
  MessageQueue,
} from "./bridge-bootstrap.js";
export { AgentSessionCapability } from "./capabilities/agent-session/index.js";
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
// --- Capability system ---
export type {
  Capability,
  CapabilityConfig,
  CapabilityRegistration,
  CliCommand,
  CoreServices,
  LeafServices,
} from "./capability.js";
export { configValue, readConfig } from "./config.js";
export {
  createDefaultRegistry,
  createInitializedRegistry,
} from "./defaults.js";
export { EvolveManager } from "./evolve.js";
export type { ExtensionFactory } from "./extension.js";
export { createNazarExtension } from "./extension.js";
export { JsYamlFrontmatterParser } from "./frontmatter.js";
export { ObjectStore } from "./object-store.js";
export {
  extractChannelSection,
  loadPersonaPrompt,
  loadSystemContext,
} from "./persona.js";
export type {
  BridgeInstallOptions,
  IAffordanceRenderer,
  IAgentBridge,
  IConfigReader,
  IEvolveManager,
  IFrontmatterParser,
  IHealthReporter,
  IncomingMessage,
  IObjectStore,
  IPersonaLoader,
  ISetupGenerator,
  ISystemExecutor,
  MessageChannel,
  ObjectData,
  ObjectFilters,
  ObjectRef,
} from "./ports/index.js";
export { CapabilityRegistry } from "./registry.js";
export {
  generateQuadletFiles,
  parseInterval,
  renderQuadletContainer,
  renderQuadletPod,
  renderQuadletTimer,
} from "./setup.js";
export { NodeSystemExecutor } from "./system-executor.js";
// --- Value types ---
export type {
  AgentConfig,
  ContainerSpec,
  EvolveOptions,
  GeneratedFile,
  NazarConfig,
  SetupOptions,
} from "./types.js";
