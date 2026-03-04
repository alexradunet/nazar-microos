import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseInterval,
  QuadletSetupGenerator,
  renderQuadletContainer,
  renderSystemdService,
} from "../capabilities/setup/quadlet-generator.js";

const _setupGenerator = new QuadletSetupGenerator();
function generateQuadletFiles(
  config: import("../types.js").PibloomConfig,
  outputDir: string,
) {
  return _setupGenerator.generate(config, outputDir);
}

import type { PibloomConfig } from "../types.js";

describe("parseInterval", () => {
  it("converts minutes", () => {
    assert.equal(parseInterval("30m"), "*:0/30");
    assert.equal(parseInterval("5m"), "*:0/5");
  });

  it("converts hours", () => {
    assert.equal(parseInterval("2h"), "*-*-* 0/2:00:00");
    assert.equal(parseInterval("1h"), "*-*-* 0/1:00:00");
  });

  it("converts days", () => {
    assert.equal(parseInterval("3d"), "*-*-1/3 00:00:00");
    assert.equal(parseInterval("1d"), "*-*-1/1 00:00:00");
  });

  it("falls back to 30m for unrecognized format", () => {
    assert.equal(parseInterval("bad"), "*:0/30");
  });
});

describe("renderQuadletContainer", () => {
  it("renders a basic container", () => {
    const content = renderQuadletContainer({
      name: "pibloom-test",
      image: "docker.io/test:latest",
      description: "Test Container",
    });
    assert.ok(content.includes("[Unit]"));
    assert.ok(content.includes("Description=Test Container"));
    assert.ok(content.includes("Image=docker.io/test:latest"));
    assert.ok(content.includes("Restart=always"));
    assert.ok(content.includes("WantedBy=default.target"));
  });

  it("renders volumes and environment", () => {
    const content = renderQuadletContainer({
      name: "pibloom-test",
      image: "test:latest",
      description: "Test",
      volumes: ["/host:/container:ro"],
      environment: { FOO: "bar" },
    });
    assert.ok(content.includes("Volume=/host:/container:ro"));
    assert.ok(content.includes("Environment=FOO=bar"));
  });

  it("renders publish ports", () => {
    const content = renderQuadletContainer({
      name: "pibloom-test",
      image: "test:latest",
      description: "Test",
      publishPorts: ["8080:80", "443:443"],
    });
    assert.ok(content.includes("PublishPort=8080:80"));
    assert.ok(content.includes("PublishPort=443:443"));
  });

  it("renders pod membership", () => {
    const content = renderQuadletContainer({
      name: "pibloom-test",
      image: "test:latest",
      description: "Test",
      pod: "pibloom-signal.pod",
    });
    assert.ok(content.includes("Pod=pibloom-signal.pod"));
  });

  it("renders oneshot service type", () => {
    const content = renderQuadletContainer({
      name: "pibloom-test",
      image: "test:latest",
      description: "Test",
      serviceType: "oneshot",
      restart: "no",
    });
    assert.ok(content.includes("Type=oneshot"));
    assert.ok(content.includes("Restart=no"));
  });
});

describe("renderSystemdService", () => {
  it("renders a oneshot service with user and environment", () => {
    const content = renderSystemdService({
      description: "Test Service",
      user: "test-user",
      environment: { FOO: "bar", BAZ: "qux" },
      execStart: "/usr/local/bin/test",
    });
    assert.ok(content.includes("[Unit]"));
    assert.ok(content.includes("Description=Test Service"));
    assert.ok(content.includes("Type=oneshot"));
    assert.ok(content.includes("User=test-user"));
    assert.ok(content.includes("Environment=FOO=bar"));
    assert.ok(content.includes("Environment=BAZ=qux"));
    assert.ok(content.includes("ExecStart=/usr/local/bin/test"));
  });

  it("omits User when not specified", () => {
    const content = renderSystemdService({
      description: "Test",
      execStart: "/bin/true",
    });
    assert.ok(!content.includes("User="));
  });
});

describe("generateQuadletFiles", () => {
  const baseConfig: PibloomConfig = {
    hostname: "pibloom-box",
    primary_user: "alex",
    heartbeat: { interval: "30m" },
  };

  it("generates all expected files", () => {
    const files = generateQuadletFiles(baseConfig, "/etc/systemd/system");
    const names = files.map((f) => f.path.split("/").pop());
    assert.deepEqual(names, [
      "pibloom-heartbeat.service",
      "pibloom-heartbeat.timer",
    ]);
  });

  it("heartbeat service has correct structure", () => {
    const files = generateQuadletFiles(baseConfig, "/out");
    const hb = files.find((f) => f.path.endsWith("pibloom-heartbeat.service"));
    assert.ok(hb);
    assert.ok(hb.content.includes("Description=piBloom Heartbeat Service"));
    assert.ok(hb.content.includes("Type=oneshot"));
    assert.ok(hb.content.includes("User=pibloom-agent"));
    assert.ok(
      hb.content.includes("ExecStart=/usr/local/bin/pibloom-heartbeat"),
    );
    assert.ok(
      hb.content.includes(
        "Environment=PIBLOOM_OBJECTS_DIR=/var/lib/pibloom/objects",
      ),
    );
  });

  it("heartbeat timer uses configured interval", () => {
    const files = generateQuadletFiles(baseConfig, "/out");
    const timer = files.find((f) => f.path.endsWith("pibloom-heartbeat.timer"));
    assert.ok(timer);
    assert.ok(timer.content.includes("OnCalendar=*:0/30"));
    assert.ok(timer.content.includes("WantedBy=timers.target"));
  });

  it("heartbeat timer converts hour interval", () => {
    const config = { ...baseConfig, heartbeat: { interval: "2h" } };
    const files = generateQuadletFiles(config, "/out");
    const timer = files.find((f) => f.path.endsWith("pibloom-heartbeat.timer"));
    assert.ok(timer);
    assert.ok(timer.content.includes("OnCalendar=*-*-* 0/2:00:00"));
  });

  it("uses default heartbeat interval when not configured", () => {
    const config: PibloomConfig = {
      hostname: "pibloom-box",
      primary_user: "alex",
    };
    const files = generateQuadletFiles(config, "/out");
    const timer = files.find((f) => f.path.endsWith("pibloom-heartbeat.timer"));
    assert.ok(timer);
    assert.ok(timer.content.includes("OnCalendar=*:0/30"));
  });
});
