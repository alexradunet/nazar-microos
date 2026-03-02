import { execFile } from "node:child_process";
import fs from "node:fs";
import type { ISystemExecutor } from "./types.js";

/** Real implementation using node:child_process + node:fs. */
export class NodeSystemExecutor implements ISystemExecutor {
  async exec(
    cmd: string,
    args: string[],
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      execFile(cmd, args, (error, stdout, stderr) => {
        resolve({
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          exitCode: error ? ((error.code as number) ?? 1) : 0,
        });
      });
    });
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    fs.writeFileSync(filePath, content);
  }

  async removeFile(filePath: string): Promise<void> {
    try {
      fs.unlinkSync(filePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  async mkdirp(dirPath: string): Promise<void> {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  async fileExists(filePath: string): Promise<boolean> {
    return fs.existsSync(filePath);
  }
}
