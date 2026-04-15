import { describe, expect, it } from "vitest";

import { buildDepositLifecycleUpdate } from "../src/services/lifecycle.js";

describe("buildDepositLifecycleUpdate", () => {
    it("marks non-profitable deposits as confirmed terminal records", () => {
        expect(
            buildDepositLifecycleUpdate({
                lifecycleState: "SKIPPED_NOT_PROFITABLE",
                error: "NOT_PROFITABLE",
                meta: { priceProviderId: "tether" },
            }),
        ).toEqual({
            status: "CONFIRMED",
            error: "NOT_PROFITABLE",
            meta: { lifecycleState: "SKIPPED_NOT_PROFITABLE", priceProviderId: "tether" },
        });
    });

    it("marks sweep failures as failed terminal records", () => {
        expect(
            buildDepositLifecycleUpdate({
                lifecycleState: "SWEEP_FAILED",
                error: "SWEEP_TX_FAILED",
                meta: { relatedSweepTxHash: "0x1234567890123456789012345678901234567890123456789012345678901234" },
            }),
        ).toEqual({
            status: "FAILED",
            error: "SWEEP_TX_FAILED",
            meta: {
                lifecycleState: "SWEEP_FAILED",
                relatedSweepTxHash: "0x1234567890123456789012345678901234567890123456789012345678901234",
            },
        });
    });
});
