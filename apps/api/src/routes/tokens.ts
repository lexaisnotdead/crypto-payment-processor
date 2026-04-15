import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";

import { db } from "../db/client.js";
import { supportedTokens } from "../db/schema.js";
import { requireAdminApiKey } from "../services/adminAuth.js";
import { validateChainId, validateTokenAddress } from "../services/validation.js";

const CHAIN_ID = Number(process.env.CHAIN_ID ?? 11155111);
const MULTIPLIER_RE = /^\d+(\.\d{1,4})?$/;

type UpsertTokenBody = {
    chainId?: number;
    tokenAddress?: string;
    symbol?: string;
    priceProviderId?: string;
    decimals?: number;
    isActive?: boolean | number;
    sweepGasMultiplier?: string;
};

export const tokensRoute = new Hono();

tokensRoute.get("/", async (c) => {
    const chainIdParam = c.req.query("chainId");
    const parsedChainId = validateChainId(chainIdParam ? Number(chainIdParam) : undefined, CHAIN_ID);
    if (!parsedChainId.ok) {
        return c.json({ error: parsedChainId.error }, 400);
    }

    const items = await db
        .select()
        .from(supportedTokens)
        .where(eq(supportedTokens.chainId, parsedChainId.value))
        .orderBy(asc(supportedTokens.symbol), asc(supportedTokens.tokenAddress));

    return c.json({ items });
});

tokensRoute.post("/", async (c) => {
    const authError = requireAdminApiKey(c);
    if (authError) {
        return authError;
    }

    const body = (await c.req.json()) as UpsertTokenBody;
    const tokenAddress = validateTokenAddress(body.tokenAddress);
    if (!tokenAddress.ok) {
        return c.json({ error: tokenAddress.error }, 400);
    }
    if (!body.symbol || body.symbol.trim().length === 0) {
        return c.json({ error: "symbol is required" }, 400);
    }
    if (!body.priceProviderId || body.priceProviderId.trim().length === 0) {
        return c.json({ error: "priceProviderId is required" }, 400);
    }
    if (typeof body.decimals !== "number" || !Number.isInteger(body.decimals) || body.decimals < 0 || body.decimals > 255) {
        return c.json({ error: "Invalid decimals" }, 400);
    }
    if (body.sweepGasMultiplier && !MULTIPLIER_RE.test(body.sweepGasMultiplier)) {
        return c.json({ error: "Invalid sweepGasMultiplier format" }, 400);
    }

    const parsedChainId = validateChainId(body.chainId, CHAIN_ID);
    if (!parsedChainId.ok) {
        return c.json({ error: parsedChainId.error }, 400);
    }

    const symbol = body.symbol.trim().toUpperCase();
    const priceProviderId = body.priceProviderId.trim();
    const decimals: number = body.decimals;
    const isActive = body.isActive === undefined ? 1 : body.isActive ? 1 : 0;
    const sweepGasMultiplier = body.sweepGasMultiplier ?? "10.0";

    const [item] = await db
        .insert(supportedTokens)
        .values({
            chainId: parsedChainId.value,
            tokenAddress: tokenAddress.value,
            symbol,
            priceProviderId,
            decimals,
            isActive,
            sweepGasMultiplier,
        })
        .onConflictDoUpdate({
            target: [supportedTokens.chainId, supportedTokens.tokenAddress],
            set: {
                symbol,
                priceProviderId,
                decimals,
                isActive,
                sweepGasMultiplier,
            },
        })
        .returning();

    return c.json({ item }, 201);
});
