import type { SweepJob } from "../../../packages/shared/src/types.js";

type TransferEvent = {
    args: {
        from: `0x${string}`;
        to: `0x${string}`;
        value: bigint;
    };
    log: {
        address: `0x${string}`;
        logIndex: number;
    };
    transaction: {
        hash: `0x${string}`;
    };
};

type IndexerLogger = Pick<typeof console, "info" | "warn" | "error">;

export type TransferProcessorDeps = {
    findDepositAddress: (predictedAddress: string) => Promise<{ userId: string } | undefined>;
    findTokenConfig: (chainId: number, tokenAddress: string) => Promise<{ isActive: number } | undefined>;
    insertDepositTransaction: (args: {
        chainId: number;
        userId: string;
        tokenAddress: string;
        fromAddress: string;
        toAddress: string;
        amountWei: string;
        txHash: string;
        logIndex: number;
    }) => Promise<boolean>;
    enqueueSweepJob: (job: SweepJob, jobId: string) => Promise<void>;
    logger: IndexerLogger;
};

export type TransferProcessorInput = {
    chainId: number;
    event: TransferEvent;
};

export async function processTransferEvent(
    input: TransferProcessorInput,
    deps: TransferProcessorDeps,
): Promise<void> {
    const { chainId, event } = input;
    const to = event.args.to.toLowerCase();
    const token = event.log.address.toLowerCase();

    const deposit = await deps.findDepositAddress(to);
    if (!deposit) {
        return;
    }

    const tokenConfig = await deps.findTokenConfig(chainId, token);
    if (!tokenConfig || tokenConfig.isActive !== 1) {
        deps.logger.warn(`[Indexer] Token not found or inactive: ${token} on chain ${chainId}`);
        return;
    }

    const inserted = await deps.insertDepositTransaction({
        chainId,
        userId: deposit.userId,
        tokenAddress: token,
        fromAddress: event.args.from.toLowerCase(),
        toAddress: to,
        amountWei: event.args.value.toString(),
        txHash: event.transaction.hash,
        logIndex: event.log.logIndex,
    });

    if (!inserted) {
        deps.logger.info(`[Indexer] Duplicate deposit transaction: ${event.transaction.hash}:${event.log.logIndex}`);
        return;
    }

    deps.logger.info(`[Indexer] Deposit detected: ${to} received ${event.args.value} wei of ${token}`);

    await deps.enqueueSweepJob(
        {
            chainId,
            userId: deposit.userId,
            tokenAddress: token as `0x${string}`,
            depositAddress: to as `0x${string}`,
            txHash: event.transaction.hash,
            logIndex: event.log.logIndex,
        },
        `${chainId}:${event.transaction.hash}:${event.log.logIndex}`,
    );

    deps.logger.info(`[Indexer] Sweep job queued for deposit ${to}`);
}
