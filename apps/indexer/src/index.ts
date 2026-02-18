import "dotenv/config";
import { Queue } from "bullmq";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { ponder } from "@/generated";
import type { SweepJob } from "../../../packages/shared/src/types.js";
import { depositAddresses, supportedTokens, transactions } from "../../api/src/db/schema.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);
const sweepQueue = new Queue<SweepJob>("sweep", {
    connection: {
        host: process.env.REDIS_HOST ?? "redis",
        port: Number(process.env.REDIS_PORT ?? 6379),
    },
});

ponder.on("ERC20:Transfer", async ({ event, context }) => {
    const chainId = context.network.chainId;
    const to = event.args.to.toLowerCase();
    const token = event.log.address.toLowerCase();

    const [deposit] = await db
        .select()
        .from(depositAddresses)
        .where(eq(depositAddresses.predictedAddress, to))
        .limit(1);

    if (!deposit) return;

    const [tokenConfig] = await db
        .select()
        .from(supportedTokens)
        .where(
                and(
                    eq(supportedTokens.chainId, chainId),
                    eq(supportedTokens.tokenAddress, token),
                    eq(supportedTokens.isActive, 1),
                ),
        )
        .limit(1);

    if (!tokenConfig) return;

    const inserted = await db
        .insert(transactions)
        .values({
            userId: deposit.userId,
            type: "DEPOSIT",
            status: "PENDING",
            chainId,
            tokenAddress: token,
            fromAddress: event.args.from.toLowerCase(),
            toAddress: to,
            amountWei: event.args.value.toString(),
            txHash: event.transaction.hash,
            logIndex: event.log.logIndex,
        })
        .onConflictDoNothing()
        .returning({ id: transactions.id });

    if (inserted.length === 0) {
        return;
    }

    await sweepQueue.add(
        "sweep",
        {
            chainId,
            userId: deposit.userId,
            tokenAddress: token as `0x${string}`,
            depositAddress: to as `0x${string}`,
            txHash: event.transaction.hash,
            logIndex: event.log.logIndex,
        },
        {
            jobId: `${chainId}:${event.transaction.hash}:${event.log.logIndex}`,
            attempts: 5,
            backoff: { type: "exponential", delay: 1500 },
            removeOnComplete: 1000,
            removeOnFail: 1000,
        },
    );
});
