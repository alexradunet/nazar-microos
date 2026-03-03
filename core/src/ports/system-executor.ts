/**
 * ISystemExecutor port — abstraction over filesystem and process execution.
 *
 * Exists solely for testability: production code injects the real Node.js
 * implementation; tests inject an in-memory fake without touching the disk
 * or spawning child processes.
 *
 * Handles: exec, file read/write/remove, directory operations, existence checks.
 * Does NOT handle: path construction, glob expansion, or environment variable
 * injection. Callers are responsible for building absolute paths.
 *
 * For implementation, see capabilities/system-executor/node-executor.ts.
 * For the test double, see testing/fake-system-executor.ts (if present).
 */
export interface ISystemExecutor {
  exec(
    cmd: string,
    args: string[],
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  removeFile(path: string): Promise<void>;
  removeDir(path: string): Promise<void>;
  mkdirp(path: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  readDir(path: string): Promise<string[]>;
  isDirectory(path: string): Promise<boolean>;
}
