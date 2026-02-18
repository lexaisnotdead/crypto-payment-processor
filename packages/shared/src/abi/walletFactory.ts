export const walletFactoryAbi = [
    {
        type: "function",
        name: "deployAndSweep",
        stateMutability: "nonpayable",
        inputs: [
            { name: "salt", type: "bytes32" },
            { name: "token", type: "address" },
        ],
        outputs: [{ name: "wallet", type: "address" }],
    },
] as const;
