import type { ISystemExecutor } from "../ports/system-executor.js";

export interface ExecCall {
  cmd: string;
  args: string[];
}
export interface WriteCall {
  path: string;
  content: string;
}

/** Mock ISystemExecutor for tests — records all calls, no side effects. */
export class MockSystemExecutor implements ISystemExecutor {
  execCalls: ExecCall[] = [];
  writeCalls: WriteCall[] = [];
  removedFiles: string[] = [];
  removedDirs: string[] = [];
  createdDirs: string[] = [];
  existingFiles = new Set<string>();
  fileContents = new Map<string, string>();
  healthyServices = new Set<string>();
  directories = new Map<string, string[]>();

  async exec(
    cmd: string,
    args: string[],
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    this.execCalls.push({ cmd, args });

    // Simulate systemctl is-active
    if (cmd === "sudo" && args[0] === "systemctl" && args[1] === "is-active") {
      const service = args[2];
      const name = service.replace(".service", "");
      return {
        stdout: this.healthyServices.has(name) ? "active\n" : "",
        stderr: "",
        exitCode: this.healthyServices.has(name) ? 0 : 3,
      };
    }

    return { stdout: "", stderr: "", exitCode: 0 };
  }

  async readFile(filePath: string): Promise<string> {
    const content = this.fileContents.get(filePath);
    if (content === undefined) {
      throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: "ENOENT" });
    }
    return content;
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.writeCalls.push({ path: filePath, content });
    this.existingFiles.add(filePath);
    this.fileContents.set(filePath, content);
  }

  async removeFile(filePath: string): Promise<void> {
    this.removedFiles.push(filePath);
    this.existingFiles.delete(filePath);
    this.fileContents.delete(filePath);
  }

  async removeDir(dirPath: string): Promise<void> {
    this.removedDirs.push(dirPath);
  }

  async mkdirp(dirPath: string): Promise<void> {
    this.createdDirs.push(dirPath);
  }

  async fileExists(filePath: string): Promise<boolean> {
    return this.existingFiles.has(filePath);
  }

  async readDir(dirPath: string): Promise<string[]> {
    const entries = this.directories.get(dirPath);
    if (entries === undefined) {
      throw Object.assign(new Error(`ENOENT: ${dirPath}`), { code: "ENOENT" });
    }
    return entries;
  }

  async isDirectory(dirPath: string): Promise<boolean> {
    return this.directories.has(dirPath);
  }

  /** Test helper: reset all recorded calls. */
  reset(): void {
    this.execCalls = [];
    this.writeCalls = [];
    this.removedFiles = [];
    this.removedDirs = [];
    this.createdDirs = [];
    this.existingFiles.clear();
    this.fileContents.clear();
    this.healthyServices.clear();
    this.directories.clear();
  }
}
