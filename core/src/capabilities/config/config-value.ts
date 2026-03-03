/**
 * Walk a dotted path through a config object and return the value,
 * or `defaultValue` if any segment is missing/null/non-object.
 *
 * Examples:
 *   configValue(config, "heartbeat.interval", "30m")
 *   configValue(config, "ttyd.port", 7681)
 */
export function configValue<T>(obj: unknown, path: string, defaultValue: T): T {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    ) {
      return defaultValue;
    }
    current = (current as Record<string, unknown>)[part];
  }
  if (current === undefined || current === null) {
    return defaultValue;
  }
  return current as T;
}
