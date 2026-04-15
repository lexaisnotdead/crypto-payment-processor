import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
    mockDb: {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
    },
}));

vi.mock("../src/db/client.js", () => ({ db: mockDb }));
vi.mock("../src/services/deployment.js", () => ({
    loadDeploymentAddresses: () => ({
        chainId: 11155111,
        depositLogic: "0x0000000000000000000000000000000000000001",
        walletFactory: "0x0000000000000000000000000000000000000002",
    }),
}));

function createSelectChain(rows: unknown[]) {
    return {
        from: () => ({
            where: () => ({
                orderBy: async () => rows,
                limit: async () => rows,
            }),
        }),
    };
}

describe("API routes", () => {
    beforeEach(() => {
        vi.resetModules();
        mockDb.select.mockReset();
        mockDb.insert.mockReset();
        mockDb.update.mockReset();
        delete process.env.ADMIN_API_KEY;
        process.env.CHAIN_ID = "11155111";
    });

    it("rejects unauthorized token mutations", async () => {
        const { app } = await import("../src/app.js");

        const response = await app.request("/v1/tokens", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                tokenAddress: "0x0000000000000000000000000000000000000001",
                symbol: "USDT",
                priceProviderId: "tether",
                decimals: 6,
            }),
        });

        expect(response.status).toBe(503);
        expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("allows authorized token mutations with explicit price provider ids", async () => {
        process.env.ADMIN_API_KEY = "secret";
        mockDb.insert.mockReturnValue({
            values: () => ({
                onConflictDoUpdate: () => ({
                    returning: async () => [
                        {
                            chainId: 11155111,
                            tokenAddress: "0x0000000000000000000000000000000000000001",
                            symbol: "USDT",
                            priceProviderId: "tether",
                            decimals: 6,
                            isActive: 1,
                            sweepGasMultiplier: "10.0",
                        },
                    ],
                }),
            }),
        });

        const { app } = await import("../src/app.js");
        const response = await app.request("/v1/tokens", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-admin-api-key": "secret",
            },
            body: JSON.stringify({
                tokenAddress: "0x0000000000000000000000000000000000000001",
                symbol: "USDT",
                priceProviderId: "tether",
                decimals: 6,
            }),
        });

        expect(response.status).toBe(201);
        await expect(response.json()).resolves.toMatchObject({
            item: {
                tokenAddress: "0x0000000000000000000000000000000000000001",
                priceProviderId: "tether",
            },
        });
    });

    it("keeps deposit GET read-only and returns 404 when nothing is reserved", async () => {
        mockDb.select.mockImplementation(() => createSelectChain([]));
        mockDb.insert.mockImplementation(() => {
            throw new Error("GET must not write");
        });

        const { app } = await import("../src/app.js");
        const response = await app.request("/v1/deposits/customer-123/0x0000000000000000000000000000000000000001");

        expect(response.status).toBe(404);
        expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("rejects invalid transaction pagination", async () => {
        const { app } = await import("../src/app.js");

        const response = await app.request("/v1/transactions/customer-123?limit=0");

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({ error: "limit must be between 1 and 100" });
    });

    it("rejects invalid transaction cursors", async () => {
        const { app } = await import("../src/app.js");

        const response = await app.request("/v1/transactions/customer-123?cursor=2026-04-14");

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({ error: "Invalid cursor" });
    });
});
