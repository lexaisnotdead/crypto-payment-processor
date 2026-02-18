import type { Redis } from "ioredis";

export async function withSenderLock<T>(
    redis: Redis,
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
): Promise<T> {
    const lockToken = `${Date.now()}-${Math.random()}`;
    const acquired = await redis.set(key, lockToken, "PX", ttlMs, "NX");

    if (!acquired) {
        throw new Error(`Lock busy: ${key}`);
    }

    try {
        return await fn();
    } finally {
        const current = await redis.get(key);
        if (current === lockToken) {
            await redis.del(key);
        }
    }
}
