import { encodePacked, getAddress, getCreate2Address, keccak256 } from "viem";

const EIP_1167_PREFIX = "0x3d602d80600a3d3981f3";
const EIP_1167_MID = "363d3d373d3d3d363d73";
const EIP_1167_SUFFIX = "5af43d82803e903d91602b57fd5bf3";

export type DeriveAddressInput = {
    factoryAddress: `0x${string}`;
    implementationAddress: `0x${string}`;
    userId: string;
    tokenAddress: `0x${string}`;
    index: number;
};

export function deriveSalt(userId: string, tokenAddress: `0x${string}`, index: number): `0x${string}` {
    return keccak256(encodePacked(["string", "address", "uint256"], [userId, tokenAddress, BigInt(index)]));
}

// CREATE2 address derivation must use the exact same initCode as OZ Clones.cloneDeterministic.
export function predictDeterministicCloneAddress(input: DeriveAddressInput): {
    salt: `0x${string}`;
    predictedAddress: `0x${string}`;
} {
    const salt = deriveSalt(input.userId, input.tokenAddress, input.index);
    const impl = getAddress(input.implementationAddress).toLowerCase().slice(2);
    const initCode = `${EIP_1167_PREFIX}${EIP_1167_MID}${impl}${EIP_1167_SUFFIX}` as `0x${string}`;

    const predictedAddress = getCreate2Address({
        from: getAddress(input.factoryAddress),
        salt,
        bytecodeHash: keccak256(initCode),
    });

    return { salt, predictedAddress };
}
