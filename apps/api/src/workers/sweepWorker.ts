import "dotenv/config";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { and, eq } from "drizzle-orm";
import { formatUnits, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient } from "viem";
import { resolveNetwork } from "../services/networks.js";

import { erc20Abi } from "../../../../packages/shared/src/abi/erc20.js";
import { walletFactoryAbi } from "../../../../packages/shared/src/abi/walletFactory.js";
import type { SweepJob } from "../../../../packages/shared/src/types.js";
import { db } from "../db/client.js";
import { depositAddresses, supportedTokens, transactions } from "../db/schema.js";
import { loadDeploymentAddresses } from "../services/deployment.js";
import {
    DEFAULT_MULTIPLIER_SCALED,
    evaluateSweepProfitability,
} from "../services/profitability.js";
import { withSenderLock } from "../services/nonce.js";

if (!process.env.PRICE_API_BASE) {
    throw new Error("PRICE_API_BASE environment variable is required");
}

const CHAIN_ID = Number(process.env.CHAIN_ID ?? 11155111);
const runtimeChain = resolveNetwork(CHAIN_ID);

const redis = new Redis(process.env.REDIS_URL ?? "redis://redis:6379");
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const publicClient = createPublicClient({ chain: runtimeChain, transport: http(process.env.RPC_URL) });
const walletClient = createWalletClient({ account, chain: runtimeChain, transport: http(process.env.RPC_URL) });
const PRICE_API_BASE = process.env.PRICE_API_BASE;
const deploymentAddresses = loadDeploymentAddresses(CHAIN_ID);
const SENDER_LOCK_TTL_MS = 600_000;

function parseMultiplierToScaled(value: string | null): bigint {
    if (!value) return DEFAULT_MULTIPLIER_SCALED;
    const [whole = "0", fraction = ""] = value.split(".");
    const normalizedFraction = (fraction + "0000").slice(0, 4);
    return BigInt(whole) * 10_000n + BigInt(normalizedFraction);
}

async function fetchUsdE18(coinId: string): Promise<bigint> {
    const base = PRICE_API_BASE.replace(/\/+$/, "");
    const url = `${base}/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Price API failed for coinId=${coinId}`);
    }

    const data = (await response.json()) as Record<string, { usd?: number }>;
    const usd = data[coinId]?.usd;
    if (usd === undefined || !Number.isFinite(usd)) {
        throw new Error(`Price API response is missing usd for coinId=${coinId}`);
    }
    return parseUnits(usd.toString(), 18);
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
            try {
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
                    console.warn(`[Sweep] Token not found or inactive: ${payload.tokenAddress} on chain ${payload.chainId}`);
                    return;
                }

                const [deposit] = await db
                    .select()
                    .from(depositAddresses)
                    .where(eq(depositAddresses.predictedAddress, normalizeAddress(payload.depositAddress)))
                    .limit(1);

                if (!deposit) {
                    console.warn(`[Sweep] Deposit address not found: ${payload.depositAddress}`);
                    return;
                }

                const balance = await publicClient.readContract({
                    abi: erc20Abi,
                    address: normalizeAddress(payload.tokenAddress),
                    functionName: "balanceOf",
                    args: [normalizeAddress(payload.depositAddress)],
                });

                if (balance <= 0n) {
                    console.info(`[Sweep] Zero balance at ${payload.depositAddress}, skipping`);
                    return;
                }

                const salt = deposit.salt as `0x${string}`;
                const feeEstimate = await publicClient.estimateFeesPerGas();
                const maxFeePerGas = feeEstimate.maxFeePerGas ?? feeEstimate.gasPrice ?? (await publicClient.getGasPrice());
                const gasLimit = await publicClient.estimateContractGas({
                    account: account.address,
                    address: deploymentAddresses.walletFactory,
                    abi: walletFactoryAbi,
                    functionName: "deployAndSweep",
                    args: [salt, normalizeAddress(payload.tokenAddress)],
                });
                const gasCostWei = gasLimit * maxFeePerGas;

                const [ethUsdE18, tokenUsdE18] = await Promise.all([
                    fetchUsdE18("eth"),
                    fetchUsdE18(tokenConfig.symbol.toLowerCase()),
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
                        .set({ status: "CONFIRMED", meta: decisionMeta, error: "NOT_PROFITABLE", updatedAt: new Date() })
                        .where(
                            and(
                                eq(transactions.chainId, payload.chainId),
                                eq(transactions.txHash, payload.txHash),
                                eq(transactions.logIndex, payload.logIndex),
                                eq(transactions.type, "DEPOSIT"),
                            ),
                        );
                    console.info(
                        `[Sweep] Decision: SKIP. Token value ${decisionMeta.tokenValueUsd} USD < gas cost ${decisionMeta.gasCostUsd} USD * ${decisionMeta.multiplier}x`,
                    );
                    return;
                }

                const nonce = await publicClient.getTransactionCount({
                    address: account.address,
                    blockTag: "pending",
                });

                console.info(`[Sweep] Sending sweep tx with nonce ${nonce} for deposit ${payload.depositAddress}`);

                const sweepTxHash = await walletClient.writeContract({
                    account,
                    chain: runtimeChain,
                    address: deploymentAddresses.walletFactory,
                    abi: walletFactoryAbi,
                    functionName: "deployAndSweep",
                    args: [salt, normalizeAddress(payload.tokenAddress)],
                    nonce,
                    maxFeePerGas,
                });

                console.info(`[Sweep] Sweep tx sent: ${sweepTxHash}`);

                await db.insert(transactions).values({
                    userId: deposit.userId,
                    type: "SWEEP",
                    status: "PENDING",
                    chainId: payload.chainId,
                    tokenAddress: normalizeAddress(payload.tokenAddress),
                    fromAddress: normalizeAddress(payload.depositAddress),
                    toAddress: deploymentAddresses.walletFactory,
                    amountWei: balance.toString(),
                    txHash: sweepTxHash,
                    relatedDepositTxHash: payload.txHash,
                    meta: decisionMeta,
                });

                // Extend lock TTL before waiting for receipt to prevent race conditions
                await redis.pexpire(lockKey, SENDER_LOCK_TTL_MS);

                console.info(`[Sweep] Waiting for sweep tx receipt ${sweepTxHash}...`);
                const receipt = await publicClient.waitForTransactionReceipt({ hash: sweepTxHash });

                console.info(`[Sweep] Sweep tx completed with status: ${receipt.status}`);

                await db
                    .update(transactions)
                    .set({
                        status: receipt.status === "success" ? "CONFIRMED" : "FAILED",
                        gasUsed: receipt.gasUsed.toString(),
                        gasPriceWei: receipt.effectiveGasPrice.toString(),
                        error: receipt.status === "success" ? null : "SWEEP_TX_FAILED",
                        updatedAt: new Date(),
                    })
                    .where(and(eq(transactions.chainId, payload.chainId), eq(transactions.txHash, sweepTxHash)));
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error(`[Sweep] Job failed for deposit ${payload.depositAddress}:`, errorMsg);

                // Store error in transaction record if it exists
                try {
                    await db
                        .update(transactions)
                        .set({
                            status: "FAILED",
                            error: errorMsg.substring(0, 500), // Truncate to avoid DB issues
                            updatedAt: new Date(),
                        })
                        .where(
                            and(
                                eq(transactions.chainId, payload.chainId),
                                eq(transactions.txHash, payload.txHash),
                                eq(transactions.logIndex, payload.logIndex),
                                eq(transactions.type, "DEPOSIT"),
                            ),
                        );
                } catch (dbError) {
                    console.error("[Sweep] Failed to update error status in DB:", dbError);
                }

                // Re-throw to let BullMQ handle retry logic
                throw error;
            }
        });
    },
    {
        connection: {
            host: process.env.REDIS_HOST ?? "redis",
            port: Number(process.env.REDIS_PORT ?? 6379),
        },
    },
);
