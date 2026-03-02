import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateQuadletFiles,
  parseInterval,
  renderQuadletContainer,
} from "../setup.js";
import type { NazarConfig } from "../types.js";

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
      name: "nazar-test",
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
      name: "nazar-test",
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
      name: "nazar-test",
      image: "test:latest",
      description: "Test",
      publishPorts: ["8080:80", "443:443"],
    });
    assert.ok(content.includes("PublishPort=8080:80"));
    assert.ok(content.includes("PublishPort=443:443"));
  });

  it("renders pod membership", () => {
    const content = renderQuadletContainer({
      name: "nazar-test",
      image: "test:latest",
      description: "Test",
      pod: "nazar-signal.pod",
    });
    assert.ok(content.includes("Pod=nazar-signal.pod"));
  });

  it("renders oneshot service type", () => {
    const content = renderQuadletContainer({
      name: "nazar-test",
      image: "test:latest",
      description: "Test",
      serviceType: "oneshot",
      restart: "no",
    });
    assert.ok(content.includes("Type=oneshot"));
    assert.ok(content.includes("Restart=no"));
  });
});

describe("generateQuadletFiles", () => {
  const baseConfig: NazarConfig = {
    hostname: "nazar-box",
    primary_user: "alex",
    heartbeat: { interval: "30m" },
    ttyd: { port: 7681 },
  };

  it("generates all expected files", () => {
    const files = generateQuadletFiles(baseConfig, "/etc/containers/systemd");
    const names = files.map((f) => f.path.split("/").pop());
    assert.deepEqual(names, [
      "nazar-heartbeat.container",
      "nazar-heartbeat.timer",
      "nazar-signal.pod",
      "nazar-signal-cli.container",
      "nazar-signal-bridge.container",
      "nazar-syncthing.container",
      "nazar-ttyd.container",
    ]);
  });

  it("heartbeat container has correct structure", () => {
    const files = generateQuadletFiles(baseConfig, "/out");
    const hb = files.find((f) => f.path.endsWith("nazar-heartbeat.container"));
    assert.ok(hb);
    assert.ok(hb.content.includes("Description=Nazar Heartbeat Service"));
    assert.ok(hb.content.includes("Image=localhost/nazar-heartbeat:latest"));
    assert.ok(hb.content.includes("Type=oneshot"));
    assert.ok(hb.content.includes("Restart=no"));
    assert.ok(hb.content.includes("ReadOnly=true"));
    assert.ok(hb.content.includes("NoNewPrivileges=true"));
  });

  it("heartbeat timer uses configured interval", () => {
    const files = generateQuadletFiles(baseConfig, "/out");
    const timer = files.find((f) => f.path.endsWith("nazar-heartbeat.timer"));
    assert.ok(timer);
    assert.ok(timer.content.includes("OnCalendar=*:0/30"));
    assert.ok(timer.content.includes("WantedBy=timers.target"));
  });

  it("heartbeat timer converts hour interval", () => {
    const config = { ...baseConfig, heartbeat: { interval: "2h" } };
    const files = generateQuadletFiles(config, "/out");
    const timer = files.find((f) => f.path.endsWith("nazar-heartbeat.timer"));
    assert.ok(timer);
    assert.ok(timer.content.includes("OnCalendar=*-*-* 0/2:00:00"));
  });

  it("signal pod file includes [Pod] section", () => {
    const files = generateQuadletFiles(baseConfig, "/out");
    const pod = files.find((f) => f.path.endsWith("nazar-signal.pod"));
    assert.ok(pod);
    assert.ok(pod.content.includes("[Pod]"));
    assert.ok(pod.content.includes("WantedBy=default.target"));
  });

  it("signal-cli container has signal-storage volume", () => {
    const files = generateQuadletFiles(baseConfig, "/out");
    const cli = files.find((f) =>
      f.path.endsWith("nazar-signal-cli.container"),
    );
    assert.ok(cli);
    assert.ok(
      cli.content.includes(
        "Volume=/var/lib/nazar/signal-storage:/data/signal-storage:rw,z",
      ),
    );
    assert.ok(cli.content.includes("Pod=nazar-signal.pod"));
  });

  it("signal-bridge container has After=nazar-signal-cli.service", () => {
    const files = generateQuadletFiles(baseConfig, "/out");
    const bridge = files.find((f) =>
      f.path.endsWith("nazar-signal-bridge.container"),
    );
    assert.ok(bridge);
    assert.ok(bridge.content.includes("After=nazar-signal-cli.service"));
    assert.ok(bridge.content.includes("Pod=nazar-signal.pod"));
  });

  it("ttyd uses configured port", () => {
    const files = generateQuadletFiles(baseConfig, "/out");
    const ttyd = files.find((f) => f.path.endsWith("nazar-ttyd.container"));
    assert.ok(ttyd);
    assert.ok(ttyd.content.includes("PublishPort=7681:7681"));
  });

  it("ttyd uses custom port", () => {
    const config = { ...baseConfig, ttyd: { port: 9999 } };
    const files = generateQuadletFiles(config, "/out");
    const ttyd = files.find((f) => f.path.endsWith("nazar-ttyd.container"));
    assert.ok(ttyd);
    assert.ok(ttyd.content.includes("PublishPort=9999:7681"));
  });

  it("uses default heartbeat interval when not configured", () => {
    const config: NazarConfig = {
      hostname: "nazar-box",
      primary_user: "alex",
    };
    const files = generateQuadletFiles(config, "/out");
    const timer = files.find((f) => f.path.endsWith("nazar-heartbeat.timer"));
    assert.ok(timer);
    assert.ok(timer.content.includes("OnCalendar=*:0/30"));
  });
});
