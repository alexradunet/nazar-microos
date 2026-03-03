import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeHealth,
  formatAlerts,
} from "../capabilities/os-tools/health-analyzer.js";

describe("analyzeHealth", () => {
  const healthyOs = [
    "=== bootc OS Status ===",
    "Booted image:  quay.io/nazar/os:latest",
    "  version:     42.20260301",
    "Staged image:  none",
    "Rollback:      available (quay.io/nazar/os:previous)",
  ].join("\n");

  const healthyServices = [
    "=== Nazar Services ===",
    "nazar-heartbeat.service  loaded active running  Nazar Heartbeat",
    "nazar-signal.service     loaded active running  Nazar Signal Bridge",
  ].join("\n");

  const healthyContainers = [
    "=== Nazar Container Health ===",
    "NAME                          STATE       HEALTH      IMAGE",
    "--------------------------------------------------------------------------------",
    "nazar-heartbeat               running     healthy     ghcr.io/nazar/heartbeat:latest",
    "nazar-signal-bridge            running     healthy     ghcr.io/nazar/signal:latest",
  ].join("\n");

  it("returns empty array when all healthy", () => {
    const alerts = analyzeHealth(healthyOs, healthyServices, healthyContainers);
    assert.equal(alerts.length, 0);
  });

  it("detects exited container as critical alert", () => {
    const containers = [
      "=== Nazar Container Health ===",
      "NAME                          STATE       HEALTH      IMAGE",
      "--------------------------------------------------------------------------------",
      "nazar-signal-bridge            exited      -           ghcr.io/nazar/signal:latest",
    ].join("\n");

    const alerts = analyzeHealth(healthyOs, healthyServices, containers);
    assert.ok(alerts.length >= 1);
    const critical = alerts.find(
      (a) =>
        a.severity === "critical" &&
        a.message.includes("nazar-signal-bridge") &&
        a.message.includes("exited"),
    );
    assert.ok(critical, "should have critical alert for exited container");
  });

  it("detects dead container as critical alert", () => {
    const containers = [
      "=== Nazar Container Health ===",
      "NAME                          STATE       HEALTH      IMAGE",
      "--------------------------------------------------------------------------------",
      "nazar-heartbeat               dead        -           ghcr.io/nazar/heartbeat:latest",
    ].join("\n");

    const alerts = analyzeHealth(healthyOs, healthyServices, containers);
    const critical = alerts.find(
      (a) => a.severity === "critical" && a.message.includes("nazar-heartbeat"),
    );
    assert.ok(critical, "should have critical alert for dead container");
  });

  it("detects failed service as critical alert", () => {
    const services = [
      "=== Nazar Services ===",
      "nazar-heartbeat.service  loaded failed failed  Nazar Heartbeat",
      "nazar-signal.service     loaded active running  Nazar Signal Bridge",
    ].join("\n");

    const alerts = analyzeHealth(healthyOs, services, healthyContainers);
    const critical = alerts.find(
      (a) =>
        a.severity === "critical" &&
        a.message.includes("nazar-heartbeat.service"),
    );
    assert.ok(critical, "should have critical alert for failed service");
  });

  it("detects staged OS update as warning alert", () => {
    const osWithStaged = [
      "=== bootc OS Status ===",
      "Booted image:  quay.io/nazar/os:v1",
      "Staged image:  quay.io/nazar/os:v2 @ 42.20260401",
      "  (reboot required to apply staged image)",
    ].join("\n");

    const alerts = analyzeHealth(
      osWithStaged,
      healthyServices,
      healthyContainers,
    );
    const warning = alerts.find(
      (a) => a.severity === "warning" && a.message.includes("staged"),
    );
    assert.ok(warning, "should have warning alert for staged update");
  });

  it("detects unhealthy container as warning alert", () => {
    const containers = [
      "=== Nazar Container Health ===",
      "NAME                          STATE       HEALTH      IMAGE",
      "--------------------------------------------------------------------------------",
      "nazar-heartbeat               running     unhealthy   ghcr.io/nazar/heartbeat:latest",
    ].join("\n");

    const alerts = analyzeHealth(healthyOs, healthyServices, containers);
    const warning = alerts.find(
      (a) =>
        a.severity === "warning" &&
        a.message.includes("nazar-heartbeat") &&
        a.message.includes("unhealthy"),
    );
    assert.ok(warning, "should have warning alert for unhealthy container");
  });

  it("detects no services running as info alert", () => {
    const noServices = "No nazar-* systemd units found.";
    const alerts = analyzeHealth(healthyOs, noServices, healthyContainers);
    const info = alerts.find(
      (a) => a.severity === "info" && a.message.includes("No nazar services"),
    );
    assert.ok(info, "should have info alert for no services");
  });

  it("handles empty strings gracefully", () => {
    const alerts = analyzeHealth("", "", "");
    // Should not throw, may return info alert for no services
    assert.ok(Array.isArray(alerts));
  });
});

describe("formatAlerts", () => {
  it("returns empty string for no alerts", () => {
    assert.equal(formatAlerts([]), "");
  });

  it("formats critical alerts with prefix", () => {
    const result = formatAlerts([
      { severity: "critical", message: "Container nazar-signal has exited" },
    ]);
    assert.ok(result.includes("CRITICAL"));
    assert.ok(result.includes("Container nazar-signal has exited"));
  });

  it("formats multiple alerts on separate lines", () => {
    const result = formatAlerts([
      { severity: "critical", message: "Service failed" },
      { severity: "warning", message: "Update staged" },
      { severity: "info", message: "No services" },
    ]);
    const lines = result.split("\n");
    assert.equal(lines.length, 3);
    assert.ok(lines[0].includes("CRITICAL"));
    assert.ok(lines[1].includes("WARNING"));
    assert.ok(lines[2].includes("INFO"));
  });
});
