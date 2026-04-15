import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";

type LockRedis = Pick<Redis, "set" | "eval">;

const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
end
return 0
`;

const EXTEND_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("pexpire", KEYS[1], ARGV[2])
end
return 0
`;

async function releaseSenderLock(redis: LockRedis, key: string, lockToken: string): Promise<void> {
    await redis.eval(RELEASE_LOCK_SCRIPT, 1, key, lockToken);
}

async function extendSenderLock(redis: LockRedis, key: string, lockToken: string, ttlMs: number): Promise<void> {
    await redis.eval(EXTEND_LOCK_SCRIPT, 1, key, lockToken, String(ttlMs));
}

export async function withSenderLock<T>(
    redis: LockRedis,
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
): Promise<T> {
    const lockToken = randomUUID();
    const acquired = await redis.set(key, lockToken, "PX", ttlMs, "NX");

    if (!acquired) {
        throw new Error(`Lock busy: ${key}`);
    }

    const heartbeatMs = Math.max(1, Math.floor(ttlMs / 3));
    const heartbeat = setInterval(() => {
        void extendSenderLock(redis, key, lockToken, ttlMs).catch(() => {
            // Heartbeat failures are surfaced by the protected work itself if the lock is later lost.
        });
    }, heartbeatMs);
    heartbeat.unref?.();

    try {
        return await fn();
    } finally {
        clearInterval(heartbeat);
        await releaseSenderLock(redis, key, lockToken);
    }
}
