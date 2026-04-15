import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadDeploymentAddresses } from "../src/services/deployment.js";

const ADDRESS_A = "0x1111111111111111111111111111111111111111";
const ADDRESS_B = "0x2222222222222222222222222222222222222222";
const originalCwd = process.cwd();

afterEach(() => {
    process.chdir(originalCwd);
});

function withTempAddresses(files: Record<string, object>): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), "crypto-processor-addresses-"));
    const addressesDir = path.join(dir, "addresses");
    mkdirSync(addressesDir);

    for (const [name, value] of Object.entries(files)) {
        writeFileSync(path.join(addressesDir, name), JSON.stringify(value));
    }

    process.chdir(dir);
    return dir;
}

describe("loadDeploymentAddresses", () => {
    it("loads the exact chain deployment file when present", () => {
        withTempAddresses({
            "11155111.json": {
                chainId: 11155111,
                depositLogic: ADDRESS_A,
                walletFactory: ADDRESS_B,
            },
        });

        expect(loadDeploymentAddresses(11155111)).toEqual({
            chainId: 11155111,
            depositLogic: ADDRESS_A.toLowerCase(),
            walletFactory: ADDRESS_B.toLowerCase(),
        });
    });

    it("rejects a mismatched latest deployment file", () => {
        withTempAddresses({
            "latest.json": {
                chainId: 1,
                depositLogic: ADDRESS_A,
                walletFactory: ADDRESS_B,
            },
        });

        expect(() => loadDeploymentAddresses(11155111)).toThrow(/addresses\/latest\.json targets chainId=1, expected 11155111/);
    });
});
