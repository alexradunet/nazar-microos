/**
 * Re-export from capability for backward compatibility.
 * New code should import from capabilities/config or ports.
 */
import { YamlConfigReader } from "./capabilities/config/yaml-config-reader.js";

const _defaultReader = new YamlConfigReader();

export const readConfig = _defaultReader.read.bind(_defaultReader);
export const configValue = _defaultReader.value.bind(_defaultReader);
