/**
 * Dependency-free traffic limiting.
 *
 * Everything here is deliberately allocation-light and O(1) per request: these
 * run on the hot path of every socket event and HTTP request, so a limiter that
 * is itself expensive would defeat the point.
 */

/** How much traffic a single key (socket id, IP address) may generate. */
export interface RateLimitRule {
  /** Tokens available for an instantaneous burst — a flurry of clicks passes. */
  burst: number;
  /** Tokens restored per second once the burst is spent; the sustained rate. */
  perSecond: number;
}

export interface RateLimitVerdict {
  allowed: boolean;
  /** Milliseconds until the request would succeed. 0 when allowed. */
  retryAfterMs: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const ALLOWED: RateLimitVerdict = Object.freeze({ allowed: true, retryAfterMs: 0 });

/**
 * A token bucket per key. A bucket starts full, every request spends a token,
 * and tokens come back at `perSecond`. Bursty-but-legitimate traffic (a blitz
 * time scramble, a reconnect storm after a wifi blip) passes; a flood is
 * throttled to the refill rate.
 *
 * The bucket map is itself a memory target — a flood from thousands of distinct
 * keys would grow it without bound — so idle buckets are swept and the map is
 * hard-capped with oldest-first eviction. Eviction is safe: a forgotten bucket
 * simply starts full again, which is what an idle key would have anyway.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    readonly name: string,
    private readonly rule: RateLimitRule,
    private readonly maxKeys = 20_000,
  ) {}

  consume(key: string, cost = 1, now = Date.now()): RateLimitVerdict {
    const { burst, perSecond } = this.rule;
    let bucket = this.buckets.get(key);

    if (bucket === undefined) {
      if (this.buckets.size >= this.maxKeys) this.makeRoom(now);
      bucket = { tokens: burst, updatedAt: now };
      this.buckets.set(key, bucket);
    } else {
      const elapsed = now - bucket.updatedAt;
      if (elapsed > 0) {
        bucket.tokens = Math.min(burst, bucket.tokens + (elapsed * perSecond) / 1000);
        bucket.updatedAt = now;
      }
    }

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return ALLOWED;
    }

    // Refused: report when the caller may try again so the client can back off
    // instead of hammering.
    const deficit = cost - bucket.tokens;
    return {
      allowed: false,
      retryAfterMs: perSecond > 0 ? Math.ceil((deficit / perSecond) * 1000) : Number.MAX_SAFE_INTEGER,
    };
  }

  /** Drop a key's bucket — used when a socket goes away for good. */
  forget(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Discard buckets that have refilled completely: a full bucket is
   * indistinguishable from one that does not exist, so keeping it is pure
   * memory. Called from the server's maintenance loop.
   */
  sweep(now = Date.now()): number {
    const { burst, perSecond } = this.rule;
    let removed = 0;
    for (const [key, bucket] of this.buckets) {
      const refilled = bucket.tokens + ((now - bucket.updatedAt) * perSecond) / 1000;
      if (refilled >= burst) {
        this.buckets.delete(key);
        removed++;
      }
    }
    return removed;
  }

  get size(): number {
    return this.buckets.size;
  }

  /** Sweep first; if that was not enough, evict oldest-inserted keys. */
  private makeRoom(now: number): void {
    this.sweep(now);
    while (this.buckets.size >= this.maxKeys) {
      const oldest = this.buckets.keys().next();
      if (oldest.done) return;
      this.buckets.delete(oldest.value);
    }
  }
}

/**
 * Counts things that exist concurrently rather than things that happen over
 * time — open sockets per IP. Paired acquire/release, with the key dropped at
 * zero so the map cannot outgrow the number of *currently* connected clients.
 */
export class ConcurrencyLimiter {
  private readonly counts = new Map<string, number>();
  private totalCount = 0;

  constructor(private readonly maxPerKey: number, private readonly maxTotal: number) {}

  tryAcquire(key: string): boolean {
    if (this.totalCount >= this.maxTotal) return false;
    const current = this.counts.get(key) ?? 0;
    if (current >= this.maxPerKey) return false;
    this.counts.set(key, current + 1);
    this.totalCount++;
    return true;
  }

  release(key: string): void {
    const current = this.counts.get(key);
    if (current === undefined) return;
    if (current <= 1) this.counts.delete(key);
    else this.counts.set(key, current - 1);
    if (this.totalCount > 0) this.totalCount--;
  }

  countFor(key: string): number {
    return this.counts.get(key) ?? 0;
  }

  get total(): number {
    return this.totalCount;
  }

  get keys(): number {
    return this.counts.size;
  }
}
