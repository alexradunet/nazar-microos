/**
 * Re-export from capability for backward compatibility.
 * New code should import from capabilities/agent-session.
 */
export type { BridgeConfig } from "./capabilities/agent-session/pi-agent-bridge.js";
export {
  AgentBridge,
  isAllowed,
  validatePhoneNumber,
} from "./capabilities/agent-session/pi-agent-bridge.js";
