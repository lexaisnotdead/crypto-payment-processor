import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type DeploymentAddresses = {
    chainId: number;
    depositLogic: `0x${string}`;
    walletFactory: `0x${string}`;
};

const HEX_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

function assertAddress(value: unknown, key: string): `0x${string}` {
    if (typeof value !== "string" || !HEX_ADDRESS_REGEX.test(value)) {
        throw new Error(`Invalid ${key} in deployment file: ${String(value)}`);
    }
    return value.toLowerCase() as `0x${string}`;
}

function resolveAddressesPath(chainId: number): string {
    const root = process.cwd();
    const byChainPath = path.join(root, "addresses", `${chainId}.json`);
    if (existsSync(byChainPath)) {
        return byChainPath;
    }
    return path.join(root, "addresses", "latest.json");
}

export function loadDeploymentAddresses(chainId: number): DeploymentAddresses {
    const addressesPath = resolveAddressesPath(chainId);
    if (!existsSync(addressesPath)) {
        throw new Error(
            `Deployment addresses file not found. Expected ${path.join(process.cwd(), "addresses", `${chainId}.json`)} or addresses/latest.json`,
        );
    }

    const parsed = JSON.parse(readFileSync(addressesPath, "utf8")) as Record<string, unknown>;
    const fileChainId = Number(parsed.chainId);
    if (!Number.isFinite(fileChainId)) {
        throw new Error(`Invalid chainId in deployment file: ${addressesPath}`);
    }

    return {
        chainId: fileChainId,
        depositLogic: assertAddress(parsed.depositLogic, "depositLogic"),
        walletFactory: assertAddress(parsed.walletFactory, "walletFactory"),
    };
}
