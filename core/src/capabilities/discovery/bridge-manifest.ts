import YAML from "js-yaml";
import type { ContainerSpec } from "../../types.js";

/** Pod spec for Quadlet .pod files. */
export interface PodSpec {
  name: string;
  description?: string;
  after?: string;
  wantedBy?: string;
}

/** Timer spec for Quadlet .timer files. */
export interface TimerSpec {
  name: string;
  description: string;
  onCalendar: string;
  persistent?: boolean;
  wantedBy?: string;
}

/** Schema field for bridge-specific config under `bridges.<name>:` in nazar.yaml. */
export interface ConfigSchemaField {
  name: string;
  type: "string" | "number" | "boolean" | "string[]";
  required: boolean;
  description: string;
  default?: unknown;
  envVar?: string;
}

/**
 * Bridge manifest — a self-contained YAML bundle that declares everything
 * needed to install a bridge: containers, pods, timers, config schema,
 * setup instructions, and agent skills.
 *
 * Lives at `bridges/<name>/manifest.yaml` or `infra/<name>/manifest.yaml`
 * and is processed by `nazar-core bridge install`.
 */
export interface BridgeManifest {
  apiVersion: "nazar.dev/v1";
  kind: "BridgeManifest";
  metadata: {
    name: string;
    description: string;
    version: string;
    channel: string;
  };
  containers: ContainerSpec[];
  pods?: PodSpec[];
  timers?: TimerSpec[];
  configSchema?: ConfigSchemaField[];
  setupInstructions?: string;
  compactionInstructions?: string;
  skills?: string[];
  provides?: Array<{ name: string; description: string }>;
  requiredImages?: Array<{
    name: string;
    context: string;
    containerfile: string;
  }>;
}

/** Parse a YAML string into a BridgeManifest. Throws on invalid YAML. */
export function parseBridgeManifest(raw: string): BridgeManifest {
  const doc = YAML.load(raw);
  if (!doc || typeof doc !== "object") {
    throw new Error("invalid bridge manifest: expected YAML object");
  }
  return doc as BridgeManifest;
}

/** Validate a parsed bridge manifest. Returns error messages (empty = valid). */
export function validateBridgeManifest(manifest: BridgeManifest): string[] {
  const errors: string[] = [];

  if (manifest.apiVersion !== "nazar.dev/v1") {
    errors.push(
      `unsupported apiVersion: '${manifest.apiVersion}' (expected 'nazar.dev/v1')`,
    );
  }
  if (manifest.kind !== "BridgeManifest") {
    errors.push(
      `unsupported kind: '${manifest.kind}' (expected 'BridgeManifest')`,
    );
  }

  // metadata
  if (!manifest.metadata?.name) {
    errors.push("metadata.name is required");
  }
  if (!manifest.metadata?.description) {
    errors.push("metadata.description is required");
  }
  if (!manifest.metadata?.version) {
    errors.push("metadata.version is required");
  }
  if (!manifest.metadata?.channel) {
    errors.push("metadata.channel is required");
  }

  // containers (required, at least one)
  if (!Array.isArray(manifest.containers) || manifest.containers.length === 0) {
    errors.push("at least one container is required");
  } else {
    for (const [i, c] of manifest.containers.entries()) {
      if (!c.name) errors.push(`containers[${i}].name is required`);
      if (!c.image) errors.push(`containers[${i}].image is required`);
    }
  }

  // pods (optional)
  if (manifest.pods !== undefined) {
    if (!Array.isArray(manifest.pods)) {
      errors.push("pods must be an array");
    } else {
      for (const [i, p] of manifest.pods.entries()) {
        if (!p.name) errors.push(`pods[${i}].name is required`);
      }
    }
  }

  // timers (optional)
  if (manifest.timers !== undefined) {
    if (!Array.isArray(manifest.timers)) {
      errors.push("timers must be an array");
    } else {
      for (const [i, t] of manifest.timers.entries()) {
        if (!t.name) errors.push(`timers[${i}].name is required`);
        if (!t.onCalendar) errors.push(`timers[${i}].onCalendar is required`);
      }
    }
  }

  // configSchema (optional)
  if (manifest.configSchema !== undefined) {
    if (!Array.isArray(manifest.configSchema)) {
      errors.push("configSchema must be an array");
    } else {
      const validTypes = ["string", "number", "boolean", "string[]"];
      for (const [i, f] of manifest.configSchema.entries()) {
        if (!f.name) errors.push(`configSchema[${i}].name is required`);
        if (!validTypes.includes(f.type))
          errors.push(
            `configSchema[${i}].type must be one of: ${validTypes.join(", ")}`,
          );
      }
    }
  }

  // provides (optional)
  if (manifest.provides !== undefined) {
    if (!Array.isArray(manifest.provides)) {
      errors.push("provides must be an array");
    } else {
      for (const [i, p] of manifest.provides.entries()) {
        if (!p.name) errors.push(`provides[${i}].name is required`);
        if (!p.description)
          errors.push(`provides[${i}].description is required`);
      }
    }
  }

  // requiredImages (optional)
  if (manifest.requiredImages !== undefined) {
    if (!Array.isArray(manifest.requiredImages)) {
      errors.push("requiredImages must be an array");
    } else {
      for (const [i, img] of manifest.requiredImages.entries()) {
        if (!img.name) errors.push(`requiredImages[${i}].name is required`);
        if (!img.containerfile)
          errors.push(`requiredImages[${i}].containerfile is required`);
      }
    }
  }

  return errors;
}

/**
 * Resolve `{{key}}` template variables in manifest string fields using
 * bridge config values from `bridges.<name>:` in nazar.yaml.
 *
 * Returns a new manifest with templates replaced. Unresolved templates
 * are left as-is (caller can detect them for required-field validation).
 */
export function resolveManifestTemplates(
  manifest: BridgeManifest,
  bridgeConfig: Record<string, unknown>,
): BridgeManifest {
  const json = JSON.stringify(manifest);
  const resolved = json.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, key) => {
    const value = resolveKey(bridgeConfig, key as string);
    if (value === undefined) return `{{${key}}}`;
    if (typeof value === "string") return escapeJsonString(value);
    return String(value);
  });
  return JSON.parse(resolved) as BridgeManifest;
}

/** Resolve a dotted key path against an object. */
function resolveKey(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    )
      return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Escape a string for safe embedding in a JSON string value. */
function escapeJsonString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
