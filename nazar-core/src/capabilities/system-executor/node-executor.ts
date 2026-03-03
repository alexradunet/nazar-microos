import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import type { ISystemExecutor } from "../../ports/system-executor.js";

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
          exitCode: error
            ? typeof error.code === "number"
              ? error.code
              : 1
            : 0,
        });
      });
    });
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content);
  }

  async removeFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  async mkdirp(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
