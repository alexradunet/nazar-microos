import type { EvolveOptions } from "../types.js";

/** Port for managing container evolution lifecycle. */
export interface IEvolveManager {
  /** Install an evolution: validate, generate Quadlet files, start services. */
  install(opts: EvolveOptions): Promise<string>;
  /** Rollback an evolution: stop services, remove Quadlet files. */
  rollback(opts: EvolveOptions): Promise<string>;
  /** Show evolution status: single object or list all. */
  status(slug?: string): string;
}
