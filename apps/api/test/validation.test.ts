import { describe, expect, it } from "vitest";

import {
    validateCursor,
    validateExternalUserId,
    validatePaginationLimit,
    validateTokenAddress,
} from "../src/services/validation.js";

describe("validation helpers", () => {
    it("accepts bounded pagination limits", () => {
        expect(validatePaginationLimit(undefined)).toEqual({ ok: true, value: 50 });
        expect(validatePaginationLimit("25")).toEqual({ ok: true, value: 25 });
    });

    it("rejects invalid pagination limits", () => {
        expect(validatePaginationLimit("0")).toEqual({ ok: false, error: "limit must be between 1 and 100" });
        expect(validatePaginationLimit("101")).toEqual({ ok: false, error: "limit must be between 1 and 100" });
        expect(validatePaginationLimit("1.5")).toEqual({ ok: false, error: "Invalid limit" });
    });

    it("accepts only ISO cursors", () => {
        expect(validateCursor(undefined)).toEqual({ ok: true, value: null });
        expect(validateCursor("2026-04-14T08:00:00.000Z")).toEqual({ ok: true, value: new Date("2026-04-14T08:00:00.000Z") });
        expect(validateCursor("2026-04-14")).toEqual({ ok: false, error: "Invalid cursor" });
    });

    it("validates external user ids", () => {
        expect(validateExternalUserId(" customer-123 ")).toEqual({ ok: true, value: "customer-123" });
        expect(validateExternalUserId("   ")).toEqual({ ok: false, error: "Invalid userId" });
        expect(validateExternalUserId("x".repeat(129))).toEqual({ ok: false, error: "Invalid userId" });
    });

    it("normalizes token addresses", () => {
        expect(validateTokenAddress("0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD")).toEqual({
            ok: true,
            value: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        });
        expect(validateTokenAddress("not-an-address")).toEqual({ ok: false, error: "Invalid tokenAddress" });
    });
});
