import { describe, expect, it } from "vitest";

import { withSenderLock } from "../src/services/nonce.js";

class FakeRedis {
    store = new Map<string, string>();

    async set(key: string, value: string, mode1: string, ttlMs: number, mode2: string) {
        void mode1;
        void ttlMs;
        void mode2;
        if (this.store.has(key)) {
            return null;
        }
        this.store.set(key, value);
        return "OK";
    }

    async eval(script: string, _numKeys: number, key: string, token: string, ttlMs?: number) {
        const current = this.store.get(key);
        if (script.includes('del')) {
            if (current === token) {
                this.store.delete(key);
                return 1;
            }
            return 0;
        }

        if (current === token) {
            return ttlMs ? 1 : 0;
        }

        return 0;
    }
}

describe("withSenderLock", () => {
    it("does not release a lock that was reacquired by another worker", async () => {
        const redis = new FakeRedis();

        await withSenderLock(redis as never, "lock:key", 10_000, async () => {
            redis.store.set("lock:key", "new-owner");
        });

        expect(redis.store.get("lock:key")).toBe("new-owner");
    });

    it("throws when the lock is already held", async () => {
        const redis = new FakeRedis();
        redis.store.set("lock:key", "held");

        await expect(withSenderLock(redis as never, "lock:key", 10_000, async () => undefined)).rejects.toThrow(
            "Lock busy: lock:key",
        );
    });
});
