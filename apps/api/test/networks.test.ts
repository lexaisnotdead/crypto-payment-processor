import { describe, expect, it } from "vitest";

import { resolveNetwork } from "../src/services/networks.js";

describe("resolveNetwork", () => {
    it("returns the configured supported network", () => {
        expect(resolveNetwork(11155111).id).toBe(11155111);
    });

    it("throws for an unsupported chain id", () => {
        expect(() => resolveNetwork(31337)).toThrow(/Unsupported CHAIN_ID: 31337/);
    });
});
