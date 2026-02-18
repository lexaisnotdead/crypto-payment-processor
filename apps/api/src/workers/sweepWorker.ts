import "dotenv/config";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { and, eq } from "drizzle-orm";
import { formatUnits, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient } from "viem";
import { sepolia } from "viem/chains";

import { erc20Abi } from "../../../../packages/shared/src/abi/erc20.js";
import { walletFactoryAbi } from "../../../../packages/shared/src/abi/walletFactory.js";
import type { SweepJob } from "../../../../packages/shared/src/types.js";
import { db } from "../db/client.js";
import { depositAddresses, supportedTokens, transactions } from "../db/schema.js";
import {
    DEFAULT_MULTIPLIER_SCALED,
    evaluateSweepProfitability,
} from "../services/profitability.js";
import { withSenderLock } from "../services/nonce.js";

const redis = new Redis(process.env.REDIS_URL ?? "redis://redis:6379");
const account = privateKeyToAccount(process.env.HOT_WALLET_PRIVATE_KEY as `0x${string}`);
const publicClient = createPublicClient({ chain: sepolia, transport: http(process.env.RPC_URL) });
const walletClient = createWalletClient({ account, chain: sepolia, transport: http(process.env.RPC_URL) });

const PRICE_API_BASE = process.env.PRICE_API_BASE ?? "https://example.invalid";
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS as `0x${string}`;
const SENDER_LOCK_TTL_MS = 120_000;

function parseMultiplierToScaled(value: string | null): bigint {
    if (!value) return DEFAULT_MULTIPLIER_SCALED;
    const [whole = "0", fraction = ""] = value.split(".");
    const normalizedFraction = (fraction + "0000").slice(0, 4);
    return BigInt(whole) * 10_000n + BigInt(normalizedFraction);
}

async function fetchUsdE18(asset: string): Promise<bigint> {
    const response = await fetch(`${PRICE_API_BASE}/price?asset=${asset}`);
    if (!response.ok) {
        throw new Error(`Price API failed for ${asset}`);
    }

    const data = (await response.json()) as { usd: string };
    return parseUnits(data.usd, 18);
}

function normalizeAddress(value: string): `0x${string}` {
    return value.toLowerCase() as `0x${string}`;
}

export const sweepWorker = new Worker<SweepJob>(
    "sweep",
    async (job) => {
        const payload = job.data;
        const lockKey = `sweep:nonce:${payload.chainId}:${account.address}`;

        await withSenderLock(redis, lockKey, SENDER_LOCK_TTL_MS, async () => {
            const [tokenConfig] = await db
                .select()
                .from(supportedTokens)
                .where(
                    and(
                        eq(supportedTokens.chainId, payload.chainId),
                        eq(supportedTokens.tokenAddress, normalizeAddress(payload.tokenAddress)),
                    ),
                )
                .limit(1);

            if (!tokenConfig || tokenConfig.isActive !== 1) {
                return;
            }

            const [deposit] = await db
                .select()
                .from(depositAddresses)
                .where(eq(depositAddresses.predictedAddress, normalizeAddress(payload.depositAddress)))
                .limit(1);

            if (!deposit) {
                return;
            }

            const balance = await publicClient.readContract({
                abi: erc20Abi,
                address: normalizeAddress(payload.tokenAddress),
                functionName: "balanceOf",
                args: [normalizeAddress(payload.depositAddress)],
            });

            if (balance <= 0n) {
                return;
            }

            const salt = deposit.salt as `0x${string}`;
            const feeEstimate = await publicClient.estimateFeesPerGas();
            const maxFeePerGas = feeEstimate.maxFeePerGas ?? feeEstimate.gasPrice ?? (await publicClient.getGasPrice());
            const gasLimit = await publicClient.estimateContractGas({
                account: account.address,
                address: FACTORY_ADDRESS,
                abi: walletFactoryAbi,
                functionName: "deployAndSweep",
                args: [salt, normalizeAddress(payload.tokenAddress)],
            });
            const gasCostWei = gasLimit * maxFeePerGas;

            const [ethUsdE18, tokenUsdE18] = await Promise.all([
                fetchUsdE18("ETH"),
                fetchUsdE18(`${payload.chainId}:${normalizeAddress(payload.tokenAddress)}`),
            ]);

            const tokenValueUsdE18 = (balance * tokenUsdE18) / 10n ** BigInt(tokenConfig.decimals);
            const gasCostUsdE18 = (gasCostWei * ethUsdE18) / 10n ** 18n;
            const multiplierScaled = parseMultiplierToScaled(tokenConfig.sweepGasMultiplier);

            const profitability = evaluateSweepProfitability({
                tokenValueUsdE18,
                gasCostUsdE18,
                multiplierScaled,
            });

            const decisionMeta = {
                decision: profitability.decision,
                tokenValueUsd: formatUnits(tokenValueUsdE18, 18),
                gasCostUsd: formatUnits(gasCostUsdE18, 18),
                multiplier: formatUnits(multiplierScaled, 4),
                comparison: profitability.comparison,
                exactThreshold: profitability.exactThreshold,
            } as const;

            if (profitability.decision === "SKIP") {
                await db
                    .update(transactions)
                    .set({ status: "CONFIRMED", meta: decisionMeta, error: "NOT_PROFITABLE" })
                    .where(
                        and(
                            eq(transactions.chainId, payload.chainId),
                            eq(transactions.txHash, payload.txHash),
                            eq(transactions.logIndex, payload.logIndex),
                            eq(transactions.type, "DEPOSIT"),
                        ),
                    );
                return;
            }

            const nonce = await publicClient.getTransactionCount({
                address: account.address,
                blockTag: "pending",
            });

            const sweepTxHash = await walletClient.writeContract({
                account,
                address: FACTORY_ADDRESS,
                abi: walletFactoryAbi,
                functionName: "deployAndSweep",
                args: [salt, normalizeAddress(payload.tokenAddress)],
                nonce,
                maxFeePerGas,
            });

            await db.insert(transactions).values({
                userId: deposit.userId,
                type: "SWEEP",
                status: "PENDING",
                chainId: payload.chainId,
                tokenAddress: normalizeAddress(payload.tokenAddress),
                fromAddress: normalizeAddress(payload.depositAddress),
                toAddress: FACTORY_ADDRESS,
                amountWei: balance.toString(),
                txHash: sweepTxHash,
                relatedDepositTxHash: payload.txHash,
                meta: decisionMeta,
            });

            const receipt = await publicClient.waitForTransactionReceipt({ hash: sweepTxHash });

            await db
                .update(transactions)
                .set({
                    status: receipt.status === "success" ? "CONFIRMED" : "FAILED",
                    gasUsed: receipt.gasUsed.toString(),
                    gasPriceWei: receipt.effectiveGasPrice.toString(),
                    error: receipt.status === "success" ? null : "SWEEP_TX_FAILED",
                })
                .where(and(eq(transactions.chainId, payload.chainId), eq(transactions.txHash, sweepTxHash)));
        });
    },
    {
        connection: {
            host: process.env.REDIS_HOST ?? "redis",
            port: Number(process.env.REDIS_PORT ?? 6379),
        },
    },
);
