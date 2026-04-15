import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalAdminApiKey = process.env.ADMIN_API_KEY;

afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env.ADMIN_API_KEY = originalAdminApiKey;
});

beforeEach(() => {
    process.env.ADMIN_API_KEY = "secret-key";
});

async function loadTokensRoute() {
    const returning = vi.fn().mockResolvedValue([
        {
            chainId: 11155111,
            tokenAddress: "0x1111111111111111111111111111111111111111",
            symbol: "USDC",
            priceProviderId: "usd-coin",
            decimals: 6,
            isActive: 1,
            sweepGasMultiplier: "10.0",
        },
    ]);
    const onConflictDoUpdate = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values }));

    vi.doMock("../src/db/client.js", () => ({
        db: { insert },
    }));
    vi.doMock("../src/db/schema.js", () => ({
        supportedTokens: {
            chainId: "chainId",
            tokenAddress: "tokenAddress",
            symbol: "symbol",
        },
    }));

    const { tokensRoute } = await import("../src/routes/tokens.js");
    const app = new Hono();
    app.route("/", tokensRoute);

    return { app, insert, values, onConflictDoUpdate, returning };
}

describe("tokensRoute POST auth", () => {
    it("rejects unauthorized token mutations", async () => {
        const { app, insert } = await loadTokensRoute();

        const response = await app.request("/", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                tokenAddress: "0x1111111111111111111111111111111111111111",
                symbol: "USDC",
                priceProviderId: "usd-coin",
                decimals: 6,
            }),
        });

        expect(response.status).toBe(401);
        expect(insert).not.toHaveBeenCalled();
    });

    it("allows authorized token mutations", async () => {
        const { app, insert } = await loadTokensRoute();

        const response = await app.request("/", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-admin-api-key": "secret-key",
            },
            body: JSON.stringify({
                tokenAddress: "0x1111111111111111111111111111111111111111",
                symbol: "USDC",
                priceProviderId: "usd-coin",
                decimals: 6,
            }),
        });

        expect(response.status).toBe(201);
        expect(insert).toHaveBeenCalledTimes(1);
        await expect(response.json()).resolves.toMatchObject({
            item: {
                symbol: "USDC",
                priceProviderId: "usd-coin",
                decimals: 6,
            },
        });
    });
});
