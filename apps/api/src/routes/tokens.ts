import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";

import { db } from "../db/client.js";
import { supportedTokens } from "../db/schema.js";

const CHAIN_ID = Number(process.env.CHAIN_ID ?? 11155111);
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const MULTIPLIER_RE = /^\d+(\.\d{1,4})?$/;

type UpsertTokenBody = {
    chainId?: number;
    tokenAddress?: string;
    symbol?: string;
    decimals?: number;
    isActive?: boolean | number;
    sweepGasMultiplier?: string;
};

function normalizeAddress(value: string): `0x${string}` {
    return value.toLowerCase() as `0x${string}`;
}

export const tokensRoute = new Hono();

tokensRoute.get("/", async (c) => {
    const chainIdParam = c.req.query("chainId");
    const chainId = chainIdParam ? Number(chainIdParam) : CHAIN_ID;
    if (!Number.isInteger(chainId) || chainId <= 0) {
        return c.json({ error: "Invalid chainId" }, 400);
    }

    const items = await db
        .select()
        .from(supportedTokens)
        .where(eq(supportedTokens.chainId, chainId))
        .orderBy(asc(supportedTokens.symbol), asc(supportedTokens.tokenAddress));

    return c.json({ items });
});

tokensRoute.post("/", async (c) => {
    const body = (await c.req.json()) as UpsertTokenBody;

    if (!body.tokenAddress || !ADDRESS_RE.test(body.tokenAddress)) {
        return c.json({ error: "Invalid tokenAddress" }, 400);
    }
    if (!body.symbol || body.symbol.trim().length === 0) {
        return c.json({ error: "symbol is required" }, 400);
    }
    if (typeof body.decimals !== "number" || !Number.isInteger(body.decimals) || body.decimals < 0 || body.decimals > 255) {
        return c.json({ error: "Invalid decimals" }, 400);
    }
    if (body.sweepGasMultiplier && !MULTIPLIER_RE.test(body.sweepGasMultiplier)) {
        return c.json({ error: "Invalid sweepGasMultiplier format" }, 400);
    }

    const chainId = body.chainId ?? CHAIN_ID;
    if (!Number.isInteger(chainId) || chainId <= 0) {
        return c.json({ error: "Invalid chainId" }, 400);
    }

    const tokenAddress = normalizeAddress(body.tokenAddress);
    const symbol = body.symbol.trim().toUpperCase();
    const decimals: number = body.decimals;
    const isActive = body.isActive === undefined ? 1 : body.isActive ? 1 : 0;
    const sweepGasMultiplier = body.sweepGasMultiplier ?? "10.0";

    const [item] = await db
        .insert(supportedTokens)
        .values({
            chainId,
            tokenAddress,
            symbol,
            decimals,
            isActive,
            sweepGasMultiplier,
        })
        .onConflictDoUpdate({
            target: [supportedTokens.chainId, supportedTokens.tokenAddress],
            set: {
                symbol,
                decimals,
                isActive,
                sweepGasMultiplier,
            },
        })
        .returning();

    return c.json({ item }, 201);
});
