// chains.ts
import { mainnet, goerli, sepolia, Chain } from "viem/chains";

const chains: Chain[] = [mainnet, goerli, sepolia];

export function resolveNetwork(targetChainId: number): Chain | undefined {
    return chains.find(chain => chain.id === targetChainId);
}