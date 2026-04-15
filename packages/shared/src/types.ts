export type TxStatus = "PENDING" | "CONFIRMED" | "FAILED";
export type TxType = "DEPOSIT" | "SWEEP";

export type SweepDecision = "SWEEP" | "SKIP";

export type DepositLifecycleState =
    | "PENDING"
    | "TOKEN_INACTIVE"
    | "DEPOSIT_ADDRESS_MISSING"
    | "ZERO_BALANCE"
    | "SKIPPED_NOT_PROFITABLE"
    | "SWEEP_SUBMITTED"
    | "SWEEP_CONFIRMED"
    | "SWEEP_FAILED"
    | "INDEXER_FAILED";

export type TransactionMeta = {
    decision?: SweepDecision;
    tokenValueUsd?: string;
    gasCostUsd?: string;
    multiplier?: string;
    comparison?: ">=";
    exactThreshold?: boolean;
    lifecycleState?: DepositLifecycleState;
    priceProviderId?: string;
    relatedSweepTxHash?: `0x${string}`;
    failureStage?: "INDEXER" | "SWEEP";
};

export type SweepJob = {
    chainId: number;
    userId: string;
    tokenAddress: `0x${string}`;
    depositAddress: `0x${string}`;
    txHash: `0x${string}`;
    logIndex: number;
};
