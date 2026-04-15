import type { Chain } from "viem";
import { goerli, mainnet, sepolia } from "viem/chains";

const chains: readonly Chain[] = [mainnet, goerli, sepolia];

export function resolveNetwork(targetChainId: number): Chain {
    if (!Number.isInteger(targetChainId) || targetChainId <= 0) {
        throw new Error(`Invalid CHAIN_ID value: ${targetChainId}`);
    }

    const chain = chains.find((candidate) => candidate.id === targetChainId);
    if (!chain) {
        throw new Error(
            `Unsupported CHAIN_ID: ${targetChainId}. Supported chains: ${chains.map((candidate) => candidate.id).join(", ")}`,
        );
    }

    return chain;
}
