import { describe, expect, it, vi } from "vitest";

import { processTransferEvent } from "../src/transferProcessor.js";

function createEvent() {
    return {
        args: {
            from: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            to: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            value: 42n,
        },
        log: {
            address: "0xcccccccccccccccccccccccccccccccccccccccc",
            logIndex: 7,
        },
        transaction: {
            hash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        },
    } as const;
}

function createDeps(overrides: Partial<Parameters<typeof processTransferEvent>[1]> = {}) {
    return {
        findDepositAddress: vi.fn().mockResolvedValue({ userId: "user-1" }),
        findTokenConfig: vi.fn().mockResolvedValue({ isActive: 1 }),
        insertDepositTransaction: vi.fn().mockResolvedValue(true),
        enqueueSweepJob: vi.fn().mockResolvedValue(undefined),
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
        ...overrides,
    };
}

describe("processTransferEvent", () => {
    it("does not enqueue duplicate deposits", async () => {
        const deps = createDeps({
            insertDepositTransaction: vi.fn().mockResolvedValue(false),
        });
        const event = createEvent();

        await processTransferEvent({ chainId: 11155111, event }, deps);

        expect(deps.enqueueSweepJob).not.toHaveBeenCalled();
        expect(deps.logger.info).toHaveBeenCalledWith(
            `[Indexer] Duplicate deposit transaction: ${event.transaction.hash}:${event.log.logIndex}`,
        );
    });

    it("rethrows queue failures so they are observable/retryable", async () => {
        const deps = createDeps({
            enqueueSweepJob: vi.fn().mockRejectedValue(new Error("queue unavailable")),
        });

        await expect(processTransferEvent({ chainId: 11155111, event: createEvent() }, deps)).rejects.toThrow(
            "queue unavailable",
        );
    });

    it("ignores unrelated transfer events", async () => {
        const deps = createDeps({
            findDepositAddress: vi.fn().mockResolvedValue(undefined),
        });

        await processTransferEvent({ chainId: 11155111, event: createEvent() }, deps);

        expect(deps.findTokenConfig).not.toHaveBeenCalled();
        expect(deps.insertDepositTransaction).not.toHaveBeenCalled();
        expect(deps.enqueueSweepJob).not.toHaveBeenCalled();
    });
});
