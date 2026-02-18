import { createConfig } from "@ponder/core";
import { http } from "viem";

const erc20TokenAddress = process.env.ERC20_TOKEN_ADDRESS as `0x${string}` | undefined;
if (!erc20TokenAddress) {
    throw new Error("ERC20_TOKEN_ADDRESS is required for ponder indexing.");
}

export default createConfig({
    networks: {
        sepolia: {
            chainId: 11155111,
            transport: http(process.env.RPC_URL),
        },
    },
    database: {
        kind: "postgres",
        connectionString: process.env.DATABASE_URL ?? "",
    },
    contracts: {
        ERC20: {
            abi: [
                {
                    type: "event",
                    name: "Transfer",
                    inputs: [
                        { indexed: true, name: "from", type: "address" },
                        { indexed: true, name: "to", type: "address" },
                        { indexed: false, name: "value", type: "uint256" },
                    ],
                },
            ],
            network: "sepolia",
            address: erc20TokenAddress,
            startBlock: 0,
        },
    },
});
