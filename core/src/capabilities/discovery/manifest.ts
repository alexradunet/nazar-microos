import YAML from "js-yaml";

/** Capability manifest declared inside container images at /nazar/capability.yaml. */
export interface CapabilityManifest {
  apiVersion: string;
  kind: "CapabilityManifest";
  metadata: {
    name: string;
    description: string;
    version: string;
  };
  skills?: string[];
  provides?: Array<{ name: string; description: string }>;
}

/** Parse a YAML string into a CapabilityManifest. Throws on invalid YAML. */
export function parseManifest(raw: string): CapabilityManifest {
  const doc = YAML.load(raw);
  if (!doc || typeof doc !== "object") {
    throw new Error("invalid manifest: expected YAML object");
  }
  return doc as CapabilityManifest;
}

/** Validate a parsed manifest. Returns error messages (empty = valid). */
export function validateManifest(manifest: CapabilityManifest): string[] {
  const errors: string[] = [];

  if (manifest.apiVersion !== "nazar.dev/v1") {
    errors.push(
      `unsupported apiVersion: '${manifest.apiVersion}' (expected 'nazar.dev/v1')`,
    );
  }
  if (manifest.kind !== "CapabilityManifest") {
    errors.push(
      `unsupported kind: '${manifest.kind}' (expected 'CapabilityManifest')`,
    );
  }
  if (!manifest.metadata?.name) {
    errors.push("metadata.name is required");
  }
  if (!manifest.metadata?.description) {
    errors.push("metadata.description is required");
  }
  if (!manifest.metadata?.version) {
    errors.push("metadata.version is required");
  }
  if (manifest.skills !== undefined && !Array.isArray(manifest.skills)) {
    errors.push("skills must be an array of strings");
  }
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

  return errors;
}
