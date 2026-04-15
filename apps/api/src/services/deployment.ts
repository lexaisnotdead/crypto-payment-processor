import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type DeploymentAddresses = {
    chainId: number;
    depositLogic: `0x${string}`;
    walletFactory: `0x${string}`;
};

const HEX_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

type ResolvedAddressesPath = {
    kind: "chain" | "latest";
    path: string;
};

function assertAddress(value: unknown, key: string): `0x${string}` {
    if (typeof value !== "string" || !HEX_ADDRESS_REGEX.test(value)) {
        throw new Error(`Invalid ${key} in deployment file: ${String(value)}`);
    }
    return value.toLowerCase() as `0x${string}`;
}

function resolveAddressesPath(chainId: number): ResolvedAddressesPath {
    const root = process.cwd();
    const byChainPath = path.join(root, "addresses", `${chainId}.json`);
    if (existsSync(byChainPath)) {
        return { kind: "chain", path: byChainPath };
    }
    return { kind: "latest", path: path.join(root, "addresses", "latest.json") };
}

export function loadDeploymentAddresses(chainId: number): DeploymentAddresses {
    const addressesFile = resolveAddressesPath(chainId);
    if (!existsSync(addressesFile.path)) {
        throw new Error(
            `Deployment addresses file not found. Expected ${path.join(process.cwd(), "addresses", `${chainId}.json`)} or addresses/latest.json`,
        );
    }

    const parsed = JSON.parse(readFileSync(addressesFile.path, "utf8")) as Record<string, unknown>;
    const fileChainId = Number(parsed.chainId);
    if (!Number.isFinite(fileChainId)) {
        throw new Error(`Invalid chainId in deployment file: ${addressesFile.path}`);
    }
    if (fileChainId !== chainId) {
        throw new Error(
            addressesFile.kind === "latest"
                ? `addresses/latest.json targets chainId=${fileChainId}, expected ${chainId}`
                : `Deployment file ${addressesFile.path} targets chainId=${fileChainId}, expected ${chainId}`,
        );
    }

    return {
        chainId: fileChainId,
        depositLogic: assertAddress(parsed.depositLogic, "depositLogic"),
        walletFactory: assertAddress(parsed.walletFactory, "walletFactory"),
    };
}
