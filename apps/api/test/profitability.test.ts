import { describe, expect, it } from "vitest";

import { evaluateSweepProfitability } from "../src/services/profitability.js";

const E18 = 10n ** 18n;
const MULT_10X = 100_000n;

describe("evaluateSweepProfitability", () => {
    it("SKIP when value is 9.99x gas", () => {
        const gas = 1_000n * E18;
        const value = 9_990n * E18;

        const result = evaluateSweepProfitability({
            tokenValueUsdE18: value,
            gasCostUsdE18: gas,
            multiplierScaled: MULT_10X,
        });

        expect(result.decision).toBe("SKIP");
        expect(result.exactThreshold).toBe(false);
    });

    it("SWEEP when value is exactly 10x gas", () => {
        const gas = 100n * E18;
        const value = 1_000n * E18;

        const result = evaluateSweepProfitability({
            tokenValueUsdE18: value,
            gasCostUsdE18: gas,
            multiplierScaled: MULT_10X,
        });

        expect(result.decision).toBe("SWEEP");
        expect(result.exactThreshold).toBe(true);
    });

    it("SWEEP when value is 10.01x gas", () => {
        const gas = 100n * E18;
        const value = 1_001n * E18;

        const result = evaluateSweepProfitability({
            tokenValueUsdE18: value,
            gasCostUsdE18: gas,
            multiplierScaled: MULT_10X,
        });

        expect(result.decision).toBe("SWEEP");
        expect(result.exactThreshold).toBe(false);
    });
});
