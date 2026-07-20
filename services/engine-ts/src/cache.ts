// ---------------------------------------------------------------------------
// Completion cache (in-memory LRU)
//
// Extracted from `src/extension/cache.ts` — identical behaviour, zero VS Code
// dependencies.  The key is a normalised prefix+suffix pair.
// ---------------------------------------------------------------------------

import { PrefixSuffix } from "./types"

/**
 * Minimal cache contract the engine orchestrator depends on.
 *
 * Kept as an interface so the production LRU can be swapped for a no-op
 * stub in tests without pulling in timing-sensitive eviction logic.
 */
export interface CompletionCache<T = string> {
  get(key: string): T | null | undefined
  set(key: string, value: T): void
  delete(key: string): void
  clear(): void
}

/**
 * Bounded in-memory LRU cache for completion results.
 *
 * The normalisation helper collapses whitespace so that semantically
 * identical prefix/suffix pairs produce the same cache key.
 */
export class LRUCache<T = string> implements CompletionCache<T> {
  private _capacity: number
  private _cache: Map<string, T | null>

  constructor(capacity: number) {
    this._capacity = capacity
    this._cache = new Map()
  }

  get(key: string): T | null | undefined {
    if (!this._cache.has(key)) return undefined

    const value = this._cache.get(key)
    this._cache.delete(key)
    if (value !== undefined) {
      this._cache.set(key, value)
    }
    return value
  }

  set(key: string, value: T | null): void {
    if (this._cache.has(key)) {
      this._cache.delete(key)
    } else if (this._cache.size === this._capacity) {
      const firstKey = this._cache.keys().next().value
      if (!firstKey) return
      this._cache.delete(firstKey)
    }
    this._cache.set(key, value)
  }

  delete(key: string): void {
    this._cache.delete(key)
  }

  clear(): void {
    this._cache.clear()
  }

  // ---- PrefixSuffix helpers (mirrors src/extension/cache.ts) --------------

  private normalize(src: string): string {
    return src.split("\n").join("").replace(/\s+/g, "").replace(/\s/g, "")
  }

  private getKey(prefixSuffix: PrefixSuffix): string {
    const { prefix, suffix } = prefixSuffix
    if (suffix) {
      return this.normalize(prefix + " #### " + suffix)
    }
    return this.normalize(prefix)
  }

  getCache(prefixSuffix: PrefixSuffix): T | undefined | null {
    const key = this.getKey(prefixSuffix)
    return this.get(key)
  }

  setCache(prefixSuffix: PrefixSuffix, completion: T): void {
    const key = this.getKey(prefixSuffix)
    this.set(key, completion)
  }
}
