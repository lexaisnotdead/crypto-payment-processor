import { createConfig } from "@ponder/core";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { http } from "viem";
import * as viemChains from "viem/chains";

import { supportedTokens } from "../api/src/db/schema.js";

const DEFAULT_ERC20_TOKEN = (
    process.env.DEFAULT_ERC20_TOKEN ?? "0xbDeaD2A70Fe794D2f97b37EFDE497e68974a296d"
).toLowerCase() as `0x${string}`;

const chainId = Number(process.env.CHAIN_ID ?? 11155111);
if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`Invalid CHAIN_ID value: ${process.env.CHAIN_ID ?? ""}`);
}
const networkName = resolveNetworkName(chainId);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for ponder indexing.");
}
if (!process.env.RPC_URL) {
    throw new Error("RPC_URL is required for ponder indexing.");
}

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool);

let tokenRows: { tokenAddress: string }[] = [];
try {
    tokenRows = await db
        .select({ tokenAddress: supportedTokens.tokenAddress })
        .from(supportedTokens)
        .where(and(eq(supportedTokens.chainId, chainId), eq(supportedTokens.isActive, 1)));

    if (tokenRows.length === 0) {
        await db
            .insert(supportedTokens)
            .values({
                chainId,
                tokenAddress: DEFAULT_ERC20_TOKEN,
                symbol: process.env.DEFAULT_ERC20_SYMBOL ?? "USDT",
                decimals: Number(process.env.DEFAULT_ERC20_DECIMALS ?? 18),
                isActive: 1,
            })
            .onConflictDoNothing();

        tokenRows = [{ tokenAddress: DEFAULT_ERC20_TOKEN }];
    }
} finally {
    await pool.end();
}

const erc20TokenAddresses = [...new Set(tokenRows.map((row) => row.tokenAddress.toLowerCase()))] as `0x${string}`[];

export default createConfig({
    networks: {
        [networkName]: {
            chainId,
            transport: http(process.env.RPC_URL),
        },
    },
    database: {
        kind: "postgres",
        connectionString: databaseUrl,
    },
    contracts: {
        ERC20: {
            abi: [
                {
                    type: "event",
                    name: "Transfer",
                    inputs: [
                        { indexed: true, name: "from", type: "address" },
                        { indexed: true, name: "to", type: "address" },
                        { indexed: false, name: "value", type: "uint256" },
                    ],
                },
            ],
            network: networkName,
            address: erc20TokenAddresses,
            startBlock: 0,
        },
    },
});

function resolveNetworkName(targetChainId: number): string {
    for (const [name, maybeChain] of Object.entries(viemChains)) {
        if (
            typeof maybeChain === "object" &&
            maybeChain !== null &&
            "id" in maybeChain &&
            typeof maybeChain.id === "number" &&
            maybeChain.id === targetChainId
        ) {
            return name;
        }
    }

    return `chain_${targetChainId}`;
}
