import type { SweepDecision } from "../../../../packages/shared/src/types.js";

const SCALE = 10_000n;
const DEFAULT_MULTIPLIER_X = 10n;

export type ProfitabilityInput = {
    tokenValueUsdE18: bigint;
    gasCostUsdE18: bigint;
    multiplierScaled?: bigint;
};

export type ProfitabilityResult = {
    decision: SweepDecision;
    exactThreshold: boolean;
    comparison: ">=";
    multiplierScaled: bigint;
};

export const DEFAULT_MULTIPLIER_SCALED = DEFAULT_MULTIPLIER_X * SCALE;

// We keep everything in fixed-point bigint to make the equality boundary deterministic.
export function evaluateSweepProfitability(input: ProfitabilityInput): ProfitabilityResult {
    const { tokenValueUsdE18, gasCostUsdE18 } = input;
    const multiplierScaled = input.multiplierScaled ?? DEFAULT_MULTIPLIER_SCALED;

    if (gasCostUsdE18 <= 0n) {
        return {
            decision: "SWEEP",
            exactThreshold: false,
            comparison: ">=",
            multiplierScaled,
        };
    }

    const left = tokenValueUsdE18 * SCALE;
    const right = gasCostUsdE18 * multiplierScaled;

    const decision: SweepDecision = left >= right ? "SWEEP" : "SKIP";

    return {
        decision,
        exactThreshold: left === right,
        comparison: ">=",
        multiplierScaled,
    };
}
