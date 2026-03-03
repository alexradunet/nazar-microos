/** Abstraction over filesystem + process execution for testability. */
export interface ISystemExecutor {
  exec(
    cmd: string,
    args: string[],
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  writeFile(path: string, content: string): Promise<void>;
  removeFile(path: string): Promise<void>;
  mkdirp(path: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
}
