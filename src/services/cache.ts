/**
 * A tiny cache abstraction with three implementations:
 *   RedisCache   shared by every API instance (production)
 *   MemoryCache  per process (tests, single-instance dev)
 *   NoCache      caching off: always a miss
 *
 * Values are stored as JSON. Anything cached is a COPY: dates come back as
 * strings, so callers revive what they need (see PromptService).
 */
import IORedis from 'ioredis';
import { env } from '../config/env';
import { cacheRequests } from '../config/metrics';
import { createRedisConnection } from '../queues/analysisQueue';

export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  close(): Promise<void>;
}

export class RedisCache implements Cache {
  private client?: IORedis;
  private get redis(): IORedis {
    this.client ??= createRedisConnection();
    return this.client;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.redis.get(key);
    cacheRequests.inc({ result: raw === null ? 'miss' : 'hit' });
    return raw === null ? undefined : (JSON.parse(raw) as T);
  }

  async set(key: string, value: unknown, ttlSeconds = env.CACHE_TTL_SECONDS): Promise<void> {
    // EX = expire after N seconds. Even if an invalidation is ever missed, a
    // stale entry can't live longer than the TTL.
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async close(): Promise<void> {
    await this.client?.quit();
  }
}

export class MemoryCache implements Cache {
  private store = new Map<string, { json: string; expiresAt: number }>();

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    const hit = entry !== undefined && entry.expiresAt > Date.now();
    cacheRequests.inc({ result: hit ? 'hit' : 'miss' });
    if (!hit) {
      this.store.delete(key);
      return undefined;
    }
    return JSON.parse(entry.json) as T;
  }

  async set(key: string, value: unknown, ttlSeconds = env.CACHE_TTL_SECONDS): Promise<void> {
    this.store.set(key, { json: JSON.stringify(value), expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async close(): Promise<void> {
    this.store.clear();
  }
}

export class NoCache implements Cache {
  async get<T>(): Promise<T | undefined> {
    return undefined;
  }
  async set(): Promise<void> {}
  async del(): Promise<void> {}
  async close(): Promise<void> {}
}

export function createCache(driver = env.CACHE_DRIVER): Cache {
  if (driver === 'redis') return new RedisCache();
  if (driver === 'memory') return new MemoryCache();
  return new NoCache();
}
