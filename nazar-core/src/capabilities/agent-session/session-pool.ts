/**
 * Pseudo-LRU session pool — maintains one session per contact key,
 * evicting the least-recently-used when capacity is reached.
 */

interface Disposable {
  dispose?(): void;
}

export class SessionPool<T extends Disposable> {
  private sessions = new Map<string, T>();

  constructor(private readonly maxSessions: number) {}

  get(key: string): T | undefined {
    const session = this.sessions.get(key);
    if (session) {
      // Move to end of Map iteration order (pseudo-LRU)
      this.sessions.delete(key);
      this.sessions.set(key, session);
    }
    return session;
  }

  put(key: string, session: T): void {
    // Evict least-recently-used session if at capacity
    if (this.sessions.size >= this.maxSessions) {
      const oldest = this.sessions.keys().next().value;
      if (oldest !== undefined) {
        const evicted = this.sessions.get(oldest);
        evicted?.dispose?.();
        this.sessions.delete(oldest);
      }
    }
    this.sessions.set(key, session);
  }

  disposeAll(): void {
    for (const [key, session] of this.sessions) {
      session.dispose?.();
      this.sessions.delete(key);
    }
  }

  get size(): number {
    return this.sessions.size;
  }
}
