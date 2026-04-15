import "dotenv/config";
import { Queue } from "bullmq";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import type { TransactionMeta, SweepJob } from "../../../packages/shared/src/types.js";
import { ponder } from "@/generated";
import { depositAddresses, supportedTokens, transactions } from "../../api/src/db/schema.js";
import { processTransferEvent, type TransferProcessorDeps, type TransferProcessorInput } from "./transferProcessor.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);
const sweepQueue = new Queue("sweep", {
    connection: {
        host: process.env.REDIS_HOST ?? "redis",
        port: Number(process.env.REDIS_PORT ?? 6379),
    },
});

const defaultDeps: TransferProcessorDeps = {
    async findDepositAddress(predictedAddress) {
        const [deposit] = await db
            .select()
            .from(depositAddresses)
            .where(eq(depositAddresses.predictedAddress, predictedAddress))
            .limit(1);

        return deposit ? { userId: deposit.userId } : undefined;
    },
    async findTokenConfig(chainId, tokenAddress) {
        const [tokenConfig] = await db
            .select()
            .from(supportedTokens)
            .where(
                and(
                    eq(supportedTokens.chainId, chainId),
                    eq(supportedTokens.tokenAddress, tokenAddress),
                    eq(supportedTokens.isActive, 1),
                ),
            )
            .limit(1);

        return tokenConfig ? { isActive: tokenConfig.isActive } : undefined;
    },
    async insertDepositTransaction(args) {
        const inserted = await db
            .insert(transactions)
            .values({
                userId: args.userId,
                type: "DEPOSIT",
                status: "PENDING",
                chainId: args.chainId,
                tokenAddress: args.tokenAddress,
                fromAddress: args.fromAddress,
                toAddress: args.toAddress,
                amountWei: args.amountWei,
                txHash: args.txHash,
                logIndex: args.logIndex,
            })
            .onConflictDoNothing()
            .returning({ id: transactions.id });

        return inserted.length > 0;
    },
    async enqueueSweepJob(job, jobId) {
        await sweepQueue.add("sweep", job, {
            jobId,
            attempts: 5,
            backoff: { type: "exponential", delay: 1500 },
            removeOnComplete: { age: 300 },
            removeOnFail: { age: 86400 },
        });
    },
    logger: console,
};

ponder.on("ERC20:Transfer", async ({ event, context }) => {
    try {
        await processTransferEvent(
            {
                chainId: context.network.chainId,
                event: event as TransferProcessorInput["event"],
            },
            defaultDeps,
        );
    } catch (error) {
        console.error("[Indexer] Error processing Transfer event:", error);
        throw error;
    }
});
