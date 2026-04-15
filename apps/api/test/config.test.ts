import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadDeploymentAddresses } from "../src/services/deployment.js";
import { resolveNetwork } from "../src/services/networks.js";

const originalCwd = process.cwd();

afterEach(() => {
    process.chdir(originalCwd);
});

describe("deployment and network config", () => {
    it("rejects unsupported chain ids", () => {
        expect(() => resolveNetwork(999999)).toThrow("Unsupported CHAIN_ID: 999999");
    });

    it("rejects latest.json when its embedded chain id mismatches the requested chain", () => {
        const dir = mkdtempSync(path.join(tmpdir(), "crypto-processor-"));
        mkdirSync(path.join(dir, "addresses"));
        writeFileSync(path.join(dir, "addresses", "latest.json"), JSON.stringify({
            chainId: 11155111,
            depositLogic: "0x0000000000000000000000000000000000000001",
            walletFactory: "0x0000000000000000000000000000000000000002",
        }));
        process.chdir(dir);

        expect(() => loadDeploymentAddresses(31337)).toThrow("addresses/latest.json targets chainId=11155111, expected 31337");
        rmSync(dir, { recursive: true, force: true });
    });
});
