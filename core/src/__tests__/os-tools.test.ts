import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkBootcUpgrade,
  getBootcStatus,
  stageBootcUpgrade,
} from "../capabilities/os-tools/bootc.js";
import {
  listContainerHealth,
  restartNazarContainer,
} from "../capabilities/os-tools/containers.js";
import {
  getServiceLogs,
  listNazarServices,
  listNazarTimers,
  restartNazarService,
} from "../capabilities/os-tools/systemd.js";
import type { ISystemExecutor } from "../ports/system-executor.js";

// ---------------------------------------------------------------------------
// Mock executor
// ---------------------------------------------------------------------------

interface MockExecSpec {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * MinimalMockExecutor — ISystemExecutor test double that returns canned responses.
 *
 * Configure exec responses by setting execResponses[cmd+args] before calling.
 * All file operations throw by default (not needed for os-tools tests).
 */
class MinimalMockExecutor implements ISystemExecutor {
  /** Map of "cmd arg0 arg1 ..." -> MockExecSpec. Falls back to defaultResponse. */
  execResponses = new Map<string, MockExecSpec>();
  defaultResponse: MockExecSpec = { stdout: "", stderr: "", exitCode: 0 };

  /** Record of all exec calls made, for assertion. */
  execCalls: Array<{ cmd: string; args: string[] }> = [];

  setResponse(cmd: string, args: string[], spec: MockExecSpec): void {
    this.execResponses.set([cmd, ...args].join(" "), spec);
  }

  async exec(
    cmd: string,
    args: string[],
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    this.execCalls.push({ cmd, args });
    const key = [cmd, ...args].join(" ");
    return this.execResponses.get(key) ?? this.defaultResponse;
  }

  async readFile(_path: string): Promise<string> {
    throw new Error("readFile not implemented in MinimalMockExecutor");
  }
  async writeFile(_path: string, _content: string): Promise<void> {
    throw new Error("writeFile not implemented");
  }
  async removeFile(_path: string): Promise<void> {
    throw new Error("removeFile not implemented");
  }
  async removeDir(_path: string): Promise<void> {
    throw new Error("removeDir not implemented");
  }
  async mkdirp(_path: string): Promise<void> {
    throw new Error("mkdirp not implemented");
  }
  async fileExists(_path: string): Promise<boolean> {
    return false;
  }
  async readDir(_path: string): Promise<string[]> {
    return [];
  }
  async isDirectory(_path: string): Promise<boolean> {
    return false;
  }
}

// ---------------------------------------------------------------------------
// bootc tests
// ---------------------------------------------------------------------------

describe("getBootcStatus", () => {
  it("returns formatted OS status from valid JSON", async () => {
    const executor = new MinimalMockExecutor();
    const statusJson = JSON.stringify({
      status: {
        booted: {
          image: {
            image: { image: "quay.io/nazar/os:latest" },
            version: "42.20260101",
            timestamp: "2026-01-01T00:00:00Z",
          },
        },
        staged: null,
        rollback: {
          image: {
            image: { image: "quay.io/nazar/os:previous" },
          },
        },
      },
      spec: {
        image: { image: "quay.io/nazar/os:latest" },
      },
    });

    executor.setResponse("bootc", ["status", "--json"], {
      stdout: statusJson,
      stderr: "",
      exitCode: 0,
    });

    const result = await getBootcStatus(executor);

    assert.ok(result.includes("bootc OS Status"), "should include header");
    assert.ok(
      result.includes("quay.io/nazar/os:latest"),
      "should include booted image",
    );
    assert.ok(result.includes("42.20260101"), "should include version");
    assert.ok(result.includes("Rollback:"), "should include rollback line");
    assert.ok(
      result.includes("quay.io/nazar/os:previous"),
      "should include rollback image",
    );
    assert.ok(
      result.includes("Staged image:  none"),
      "should show no staged image",
    );
  });

  it("returns error message when bootc is not available", async () => {
    const executor = new MinimalMockExecutor();
    executor.setResponse("bootc", ["status", "--json"], {
      stdout: "",
      stderr: "bootc: command not found",
      exitCode: 127,
    });

    const result = await getBootcStatus(executor);

    assert.ok(
      result.includes("not available"),
      "should indicate bootc not available",
    );
    assert.ok(result.includes("127"), "should include exit code");
  });

  it("handles invalid JSON gracefully", async () => {
    const executor = new MinimalMockExecutor();
    executor.setResponse("bootc", ["status", "--json"], {
      stdout: "not-json",
      stderr: "",
      exitCode: 0,
    });

    const result = await getBootcStatus(executor);
    assert.ok(
      result.includes("could not parse JSON"),
      "should report parse failure",
    );
  });

  it("shows staged image when update is pending", async () => {
    const executor = new MinimalMockExecutor();
    const statusJson = JSON.stringify({
      status: {
        booted: {
          image: { image: { image: "quay.io/nazar/os:v1" } },
        },
        staged: {
          image: {
            image: { image: "quay.io/nazar/os:v2" },
            version: "42.20260201",
          },
        },
      },
    });

    executor.setResponse("bootc", ["status", "--json"], {
      stdout: statusJson,
      stderr: "",
      exitCode: 0,
    });

    const result = await getBootcStatus(executor);
    assert.ok(
      result.includes("quay.io/nazar/os:v2"),
      "should include staged image",
    );
    assert.ok(result.includes("reboot required"), "should mention reboot");
  });
});

describe("checkBootcUpgrade", () => {
  it("returns up-to-date message when no update available", async () => {
    const executor = new MinimalMockExecutor();
    executor.setResponse("bootc", ["upgrade", "--check"], {
      stdout: "No update available.",
      stderr: "",
      exitCode: 0,
    });

    const result = await checkBootcUpgrade(executor);
    assert.ok(result.includes("up to date"), "should report up to date");
  });

  it("returns update available message when update exists", async () => {
    const executor = new MinimalMockExecutor();
    executor.setResponse("bootc", ["upgrade", "--check"], {
      stdout: "Update available: quay.io/nazar/os:v2",
      stderr: "",
      exitCode: 0,
    });

    const result = await checkBootcUpgrade(executor);
    assert.ok(
      result.includes("update available"),
      "should report update available",
    );
  });

  it("returns error when bootc check fails", async () => {
    const executor = new MinimalMockExecutor();
    executor.setResponse("bootc", ["upgrade", "--check"], {
      stdout: "",
      stderr: "network error",
      exitCode: 2,
    });

    const result = await checkBootcUpgrade(executor);
    assert.ok(result.includes("failed"), "should report failure");
    assert.ok(result.includes("2"), "should include exit code");
  });
});

// ---------------------------------------------------------------------------
// systemd tests
// ---------------------------------------------------------------------------

describe("listNazarServices", () => {
  it("returns formatted service list from systemctl output", async () => {
    const executor = new MinimalMockExecutor();
    const systemctlOutput = `nazar-heartbeat.service  loaded active running  Nazar Heartbeat
nazar-signal.service     loaded active running  Nazar Signal Bridge
`;
    executor.setResponse(
      "systemctl",
      ["list-units", "nazar-*", "--no-pager", "--plain"],
      { stdout: systemctlOutput, stderr: "", exitCode: 0 },
    );

    const result = await listNazarServices(executor);
    assert.ok(result.includes("Nazar Services"), "should include header");
    assert.ok(
      result.includes("nazar-heartbeat.service"),
      "should include heartbeat",
    );
    assert.ok(result.includes("nazar-signal.service"), "should include signal");
  });

  it("returns empty message when no nazar units found", async () => {
    const executor = new MinimalMockExecutor();
    executor.setResponse(
      "systemctl",
      ["list-units", "nazar-*", "--no-pager", "--plain"],
      { stdout: "0 units listed.", stderr: "", exitCode: 0 },
    );

    const result = await listNazarServices(executor);
    assert.ok(
      result.includes("No nazar-* systemd units found"),
      "should report none found",
    );
  });

  it("returns error message on systemctl failure", async () => {
    const executor = new MinimalMockExecutor();
    executor.setResponse(
      "systemctl",
      ["list-units", "nazar-*", "--no-pager", "--plain"],
      { stdout: "", stderr: "Failed to connect to bus", exitCode: 1 },
    );

    const result = await listNazarServices(executor);
    assert.ok(result.includes("failed"), "should report failure");
  });
});

describe("getServiceLogs", () => {
  it("returns log output for a valid nazar-* service", async () => {
    const executor = new MinimalMockExecutor();
    const logOutput =
      "Mar 01 10:00:00 nazar-box nazar-heartbeat[123]: heartbeat tick";
    executor.setResponse(
      "journalctl",
      ["-u", "nazar-heartbeat.service", "-n", "50", "--no-pager"],
      { stdout: logOutput, stderr: "", exitCode: 0 },
    );

    const result = await getServiceLogs(executor, "nazar-heartbeat.service");
    assert.ok(
      result.includes("nazar-heartbeat.service"),
      "should include service name",
    );
    assert.ok(result.includes("heartbeat tick"), "should include log content");
    assert.ok(result.includes("50"), "should mention line count");
  });

  it("rejects service names not starting with nazar-", async () => {
    const executor = new MinimalMockExecutor();

    const result = await getServiceLogs(executor, "sshd.service");
    assert.ok(result.includes("Access denied"), "should deny access");
    assert.ok(
      result.includes("sshd.service"),
      "should mention the rejected service",
    );
    assert.equal(
      executor.execCalls.length,
      0,
      "should not call journalctl at all",
    );
  });

  it("rejects empty string as service name", async () => {
    const executor = new MinimalMockExecutor();
    const result = await getServiceLogs(executor, "");
    assert.ok(
      result.includes("Access denied"),
      "should deny empty service name",
    );
  });

  it("passes custom lines count to journalctl", async () => {
    const executor = new MinimalMockExecutor();
    executor.setResponse(
      "journalctl",
      ["-u", "nazar-signal.service", "-n", "100", "--no-pager"],
      { stdout: "some log", stderr: "", exitCode: 0 },
    );

    const result = await getServiceLogs(executor, "nazar-signal.service", 100);
    assert.ok(result.includes("100"), "should use custom line count");
    assert.ok(result.includes("some log"), "should include log content");
  });

  it("returns empty message when no logs exist", async () => {
    const executor = new MinimalMockExecutor();
    executor.setResponse(
      "journalctl",
      ["-u", "nazar-new.service", "-n", "50", "--no-pager"],
      { stdout: "", stderr: "", exitCode: 0 },
    );

    const result = await getServiceLogs(executor, "nazar-new.service");
    assert.ok(result.includes("No log entries found"), "should report no logs");
  });
});

describe("listNazarTimers", () => {
  it("returns timer schedule table", async () => {
    const executor = new MinimalMockExecutor();
    const timerOutput = `NEXT                        LEFT    LAST PASSED UNIT                    ACTIVATES
Mon 2026-03-04 07:00:00 UTC 5h left  -    -      nazar-heartbeat.timer   nazar-heartbeat.service
`;
    executor.setResponse(
      "systemctl",
      ["list-timers", "nazar-*", "--no-pager", "--plain"],
      { stdout: timerOutput, stderr: "", exitCode: 0 },
    );

    const result = await listNazarTimers(executor);
    assert.ok(result.includes("Nazar Timers"), "should include header");
    assert.ok(
      result.includes("nazar-heartbeat.timer"),
      "should include timer name",
    );
  });

  it("returns empty message when no timers configured", async () => {
    const executor = new MinimalMockExecutor();
    executor.setResponse(
      "systemctl",
      ["list-timers", "nazar-*", "--no-pager", "--plain"],
      { stdout: "0 timers listed.", stderr: "", exitCode: 0 },
    );

    const result = await listNazarTimers(executor);
    assert.ok(
      result.includes("No nazar-* systemd timers found"),
      "should report none",
    );
  });
});

// ---------------------------------------------------------------------------
// container health tests
// ---------------------------------------------------------------------------

describe("listContainerHealth", () => {
  it("returns formatted table from podman JSON output", async () => {
    const executor = new MinimalMockExecutor();
    const podmanOutput = JSON.stringify([
      {
        Names: ["/nazar-heartbeat"],
        Image: "quay.io/nazar/heartbeat:latest",
        State: "running",
        Status: "healthy",
        StartedAt: 1740787200,
        Healthcheck: { Status: "healthy" },
      },
      {
        Names: ["/nazar-signal"],
        Image: "quay.io/nazar/signal:latest",
        State: "running",
        Status: "healthy",
        StartedAt: 1740787200,
      },
    ]);

    executor.setResponse(
      "podman",
      ["ps", "--format", "json", "--filter", "name=nazar"],
      { stdout: podmanOutput, stderr: "", exitCode: 0 },
    );

    const result = await listContainerHealth(executor);
    assert.ok(
      result.includes("Nazar Container Health"),
      "should include header",
    );
    assert.ok(
      result.includes("nazar-heartbeat"),
      "should include heartbeat container",
    );
    assert.ok(
      result.includes("nazar-signal"),
      "should include signal container",
    );
    assert.ok(result.includes("running"), "should show running state");
    assert.ok(
      result.includes("quay.io/nazar/heartbeat:latest"),
      "should show image",
    );
  });

  it("returns empty message when no nazar containers running", async () => {
    const executor = new MinimalMockExecutor();
    executor.setResponse(
      "podman",
      ["ps", "--format", "json", "--filter", "name=nazar"],
      { stdout: "[]", stderr: "", exitCode: 0 },
    );

    const result = await listContainerHealth(executor);
    assert.ok(
      result.includes("No nazar containers"),
      "should report no containers",
    );
  });

  it("returns error message on podman failure", async () => {
    const executor = new MinimalMockExecutor();
    executor.setResponse(
      "podman",
      ["ps", "--format", "json", "--filter", "name=nazar"],
      { stdout: "", stderr: "cannot connect to Podman socket", exitCode: 125 },
    );

    const result = await listContainerHealth(executor);
    assert.ok(result.includes("failed"), "should report failure");
    assert.ok(result.includes("125"), "should include exit code");
  });

  it("handles invalid JSON from podman gracefully", async () => {
    const executor = new MinimalMockExecutor();
    executor.setResponse(
      "podman",
      ["ps", "--format", "json", "--filter", "name=nazar"],
      { stdout: "not-json", stderr: "", exitCode: 0 },
    );

    const result = await listContainerHealth(executor);
    assert.ok(
      result.includes("could not parse JSON"),
      "should report parse failure",
    );
  });
});

// ---------------------------------------------------------------------------
// restartNazarService tests
// ---------------------------------------------------------------------------

describe("restartNazarService", () => {
  it("restarts a valid nazar-* service", async () => {
    const executor = new MinimalMockExecutor();
    executor.setResponse("systemctl", ["restart", "nazar-heartbeat.service"], {
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    const result = await restartNazarService(
      executor,
      "nazar-heartbeat.service",
    );
    assert.ok(
      result.includes("restarted successfully"),
      "should confirm restart",
    );
    assert.ok(
      result.includes("nazar-heartbeat.service"),
      "should include service name",
    );
  });

  it("rejects non-nazar service names", async () => {
    const executor = new MinimalMockExecutor();
    const result = await restartNazarService(executor, "sshd.service");
    assert.ok(result.includes("Access denied"), "should deny access");
    assert.equal(
      executor.execCalls.length,
      0,
      "should not call systemctl at all",
    );
  });

  it("returns error message on restart failure", async () => {
    const executor = new MinimalMockExecutor();
    executor.setResponse("systemctl", ["restart", "nazar-broken.service"], {
      stdout: "",
      stderr: "Unit not found",
      exitCode: 5,
    });

    const result = await restartNazarService(executor, "nazar-broken.service");
    assert.ok(result.includes("failed"), "should report failure");
    assert.ok(result.includes("5"), "should include exit code");
  });
});

// ---------------------------------------------------------------------------
// stageBootcUpgrade tests
// ---------------------------------------------------------------------------

describe("stageBootcUpgrade", () => {
  it("returns success message when upgrade is staged", async () => {
    const executor = new MinimalMockExecutor();
    executor.setResponse("bootc", ["upgrade"], {
      stdout: "Fetching quay.io/nazar/os:v2...\nStaged for next boot.",
      stderr: "",
      exitCode: 0,
    });

    const result = await stageBootcUpgrade(executor);
    assert.ok(result.includes("Update staged"), "should report staged update");
    assert.ok(result.includes("reboot"), "should mention reboot");
  });

  it("returns already up-to-date message", async () => {
    const executor = new MinimalMockExecutor();
    executor.setResponse("bootc", ["upgrade"], {
      stdout: "No update available, already up to date.",
      stderr: "",
      exitCode: 0,
    });

    const result = await stageBootcUpgrade(executor);
    assert.ok(
      result.includes("already up to date"),
      "should report already current",
    );
  });

  it("returns error on failure", async () => {
    const executor = new MinimalMockExecutor();
    executor.setResponse("bootc", ["upgrade"], {
      stdout: "",
      stderr: "network unreachable",
      exitCode: 1,
    });

    const result = await stageBootcUpgrade(executor);
    assert.ok(result.includes("failed"), "should report failure");
    assert.ok(result.includes("1"), "should include exit code");
  });
});

// ---------------------------------------------------------------------------
// restartNazarContainer tests
// ---------------------------------------------------------------------------

describe("restartNazarContainer", () => {
  it("restarts a valid nazar-* container", async () => {
    const executor = new MinimalMockExecutor();
    executor.setResponse("podman", ["restart", "nazar-signal-bridge"], {
      stdout: "nazar-signal-bridge",
      stderr: "",
      exitCode: 0,
    });

    const result = await restartNazarContainer(executor, "nazar-signal-bridge");
    assert.ok(
      result.includes("restarted successfully"),
      "should confirm restart",
    );
    assert.ok(
      result.includes("nazar-signal-bridge"),
      "should include container name",
    );
  });

  it("rejects non-nazar container names", async () => {
    const executor = new MinimalMockExecutor();
    const result = await restartNazarContainer(executor, "postgres");
    assert.ok(result.includes("Access denied"), "should deny access");
    assert.equal(executor.execCalls.length, 0, "should not call podman at all");
  });

  it("returns error message on restart failure", async () => {
    const executor = new MinimalMockExecutor();
    executor.setResponse("podman", ["restart", "nazar-broken"], {
      stdout: "",
      stderr: "no such container",
      exitCode: 125,
    });

    const result = await restartNazarContainer(executor, "nazar-broken");
    assert.ok(result.includes("failed"), "should report failure");
    assert.ok(result.includes("125"), "should include exit code");
  });
});
