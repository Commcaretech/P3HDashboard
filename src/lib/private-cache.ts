// Per-workspace, memory-only cache. No browser persistence and no shared server state.
export class PrivateCache {
  private entries = new Map<string, { value: unknown; until: number }>();
  private pending = new Map<string, Promise<unknown>>();
  private generation = 0;
  scope = "";
  setScope(scope: string) {
    if (scope !== this.scope) {
      this.clear();
      this.scope = scope;
    }
  }
  clear() {
    this.entries.clear();
    this.pending.clear();
    this.generation++;
  }
  invalidate(match: (key: string) => boolean) {
    for (const key of this.entries.keys())
      if (match(key)) this.entries.delete(key);
    this.generation++;
    this.pending.clear();
  }
  get<T>(key: string): T | undefined {
    const item = this.entries.get(key);
    if (!item || item.until < Date.now()) return;
    return item.value as T;
  }
  async fetch<T>(
    key: string,
    loader: () => Promise<T>,
    fresh = false,
    ttl = 45000,
  ): Promise<T> {
    const cached = !fresh ? this.get<T>(key) : undefined;
    if (cached !== undefined) return cached;
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;
    const generation = this.generation,
      scope = this.scope;
    const promise = loader()
      .then((value) => {
        if (generation === this.generation && scope === this.scope) {
          if (this.entries.size >= 40)
            this.entries.delete(this.entries.keys().next().value!);
          this.entries.set(key, { value, until: Date.now() + ttl });
        }
        return value;
      })
      .finally(() => {
        if (this.pending.get(key) === promise) this.pending.delete(key);
      });
    this.pending.set(key, promise);
    return promise;
  }
}
