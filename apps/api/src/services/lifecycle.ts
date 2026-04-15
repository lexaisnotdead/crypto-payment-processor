import type { DepositLifecycleState, TransactionMeta, TxStatus } from "../../../../packages/shared/src/types.js";

export type DepositLifecycleUpdate = {
    status: TxStatus;
    error: string | null;
    meta: TransactionMeta;
};

const FAILED_LIFECYCLE_STATES = new Set<DepositLifecycleState>([
    "TOKEN_INACTIVE",
    "DEPOSIT_ADDRESS_MISSING",
    "SWEEP_FAILED",
    "INDEXER_FAILED",
]);

export function buildDepositLifecycleMeta(
    lifecycleState: DepositLifecycleState,
    meta: Partial<TransactionMeta> = {},
): TransactionMeta {
    return {
        ...meta,
        lifecycleState,
    };
}

export function buildDepositLifecycleUpdate(args: {
    lifecycleState: DepositLifecycleState;
    error?: string | null;
    meta?: Partial<TransactionMeta>;
}): DepositLifecycleUpdate {
    const { lifecycleState, error = null, meta } = args;
    const status: TxStatus = FAILED_LIFECYCLE_STATES.has(lifecycleState) ? "FAILED" : "CONFIRMED";

    return {
        status,
        error,
        meta: buildDepositLifecycleMeta(lifecycleState, meta),
    };
}
