type Entry = { value: string; expireAt: number | null }
type SetOpts = { nx?: boolean; px?: number; ex?: number }

export class FakeRedis {
  private store = new Map<string, Entry>()

  private live(key: string): Entry | undefined {
    const e = this.store.get(key)
    if (!e) return undefined
    if (e.expireAt != null && Date.now() >= e.expireAt) {
      this.store.delete(key)
      return undefined
    }
    return e
  }

  async get<T = string>(key: string): Promise<T | null> {
    const e = this.live(key)
    return (e ? e.value : null) as T | null
  }

  async set(key: string, value: string, opts?: SetOpts): Promise<'OK' | null> {
    if (opts?.nx && this.live(key)) return null
    const ttlMs = opts?.px != null ? opts.px : opts?.ex != null ? opts.ex * 1000 : null
    this.store.set(key, { value, expireAt: ttlMs != null ? Date.now() + ttlMs : null })
    return 'OK'
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0
  }

  async expire(key: string, seconds: number): Promise<number> {
    const e = this.live(key)
    if (!e) return 0
    e.expireAt = Date.now() + seconds * 1000
    return 1
  }

  reset(): void {
    this.store.clear()
  }
}

export const fakeRedis = new FakeRedis()
export const resetFakeRedis = () => fakeRedis.reset()
