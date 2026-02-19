import { createConfig } from "@ponder/core";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { http } from "viem";

import { supportedTokens } from "../api/src/db/schema.js";

const DEFAULT_ERC20_TOKEN = (
    process.env.DEFAULT_ERC20_TOKEN ?? "0xbDeaD2A70Fe794D2f97b37EFDE497e68974a296d"
).toLowerCase() as `0x${string}`;

const chainId = Number(process.env.CHAIN_ID ?? 11155111);
if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`Invalid CHAIN_ID value: ${process.env.CHAIN_ID ?? ""}`);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for ponder indexing.");
}

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool);
let tokenRows: { tokenAddress: string }[] = [];
try {
    tokenRows = await db
        .select({ tokenAddress: supportedTokens.tokenAddress })
        .from(supportedTokens)
        .where(and(eq(supportedTokens.chainId, chainId), eq(supportedTokens.isActive, 1)));
} finally {
    await pool.end();
}

const erc20TokenAddresses = [
    ...new Set([DEFAULT_ERC20_TOKEN, ...tokenRows.map((row) => row.tokenAddress.toLowerCase())]),
] as `0x${string}`[];

export default createConfig({
    networks: {
        sepolia: {
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
            network: "sepolia",
            address: erc20TokenAddresses,
            startBlock: 24487026,
        },
    },
});
