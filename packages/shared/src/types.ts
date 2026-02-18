export type TxStatus = "PENDING" | "CONFIRMED" | "FAILED";
export type TxType = "DEPOSIT" | "SWEEP";

export type SweepDecision = "SWEEP" | "SKIP";

export type SweepJob = {
    chainId: number;
    userId: string;
    tokenAddress: `0x${string}`;
    depositAddress: `0x${string}`;
    txHash: `0x${string}`;
    logIndex: number;
};
