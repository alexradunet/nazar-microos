import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { configValue } from "../capabilities/config/config-value.js";
import { YamlConfigReader } from "../capabilities/config/yaml-config-reader.js";

const _configReader = new YamlConfigReader();
const readConfig = _configReader.read.bind(_configReader);

describe("readConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nazar-config-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const writeYaml = (content: string): string => {
    const p = path.join(tmpDir, "nazar.yaml");
    fs.writeFileSync(p, content);
    return p;
  };

  it("parses a valid config", () => {
    const p = writeYaml(`
hostname: nazar-box
primary_user: alex
timezone: UTC
heartbeat:
  interval: 30m
ttyd:
  port: 7681
evolution:
  max_containers_per_evolution: 5
`);
    const config = readConfig(p);
    assert.equal(config.hostname, "nazar-box");
    assert.equal(config.primary_user, "alex");
    assert.equal(config.heartbeat?.interval, "30m");
    assert.equal(config.ttyd?.port, 7681);
    assert.equal(config.evolution?.max_containers_per_evolution, 5);
  });

  it("throws on missing file", () => {
    assert.throws(
      () => readConfig(path.join(tmpDir, "nonexistent.yaml")),
      /config file not found/,
    );
  });

  it("throws on missing hostname", () => {
    const p = writeYaml("primary_user: alex\n");
    assert.throws(() => readConfig(p), /required field 'hostname' is missing/);
  });

  it("throws on missing primary_user", () => {
    const p = writeYaml("hostname: nazar-box\n");
    assert.throws(
      () => readConfig(p),
      /required field 'primary_user' is missing/,
    );
  });

  it("throws on invalid YAML", () => {
    const p = writeYaml(":\n  bad:\n   : :\n  [invalid");
    assert.throws(() => readConfig(p), /invalid YAML syntax/);
  });

  it("throws on invalid heartbeat interval", () => {
    const p = writeYaml(`
hostname: nazar-box
primary_user: alex
heartbeat:
  interval: 30x
`);
    assert.throws(() => readConfig(p), /invalid heartbeat interval/);
  });

  it("throws on invalid ttyd port", () => {
    const p = writeYaml(`
hostname: nazar-box
primary_user: alex
ttyd:
  port: abc
`);
    assert.throws(() => readConfig(p), /invalid ttyd port/);
  });

  it("throws on out-of-range ttyd port", () => {
    const p = writeYaml(`
hostname: nazar-box
primary_user: alex
ttyd:
  port: 99999
`);
    assert.throws(() => readConfig(p), /invalid ttyd port/);
  });

  it("accepts valid intervals: m, h, d", () => {
    for (const interval of ["5m", "2h", "3d"]) {
      const p = writeYaml(`
hostname: nazar-box
primary_user: alex
heartbeat:
  interval: ${interval}
`);
      const config = readConfig(p);
      assert.equal(config.heartbeat?.interval, interval);
    }
  });

  it("accepts config with only required fields", () => {
    const p = writeYaml(`
hostname: nazar-box
primary_user: alex
`);
    const config = readConfig(p);
    assert.equal(config.hostname, "nazar-box");
    assert.equal(config.heartbeat, undefined);
  });
});

describe("configValue", () => {
  it("returns nested value", () => {
    const config = {
      hostname: "nazar-box",
      primary_user: "alex",
      heartbeat: { interval: "30m" },
    };
    assert.equal(configValue(config, "heartbeat.interval", "10m"), "30m");
  });

  it("returns default for missing path", () => {
    const config = { hostname: "nazar-box", primary_user: "alex" };
    assert.equal(configValue(config, "heartbeat.interval", "10m"), "10m");
  });

  it("returns top-level value", () => {
    const config = { hostname: "nazar-box", primary_user: "alex" };
    assert.equal(configValue(config, "hostname", "default"), "nazar-box");
  });
});
