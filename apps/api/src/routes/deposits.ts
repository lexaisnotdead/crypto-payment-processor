import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";

import { db } from "../db/client.js";
import { depositAddresses, users } from "../db/schema.js";
import { predictDeterministicCloneAddress } from "../services/address.js";
import { loadDeploymentAddresses } from "../services/deployment.js";
import { validateExternalUserId, validateTokenAddress } from "../services/validation.js";

const CHAIN_ID = Number(process.env.CHAIN_ID ?? 11155111);
const deploymentAddresses = loadDeploymentAddresses(CHAIN_ID);

type ReserveDepositBody = {
    userId?: string;
    tokenAddress?: string;
};

export const depositsRoute = new Hono();

async function resolveUserId(userExternalId: string): Promise<string | undefined> {
    const [existingUser] = await db.select().from(users).where(eq(users.externalId, userExternalId)).limit(1);
    if (existingUser) {
        return existingUser.id;
    }

    return (
        await db
            .insert(users)
            .values({ externalId: userExternalId })
            .returning({ id: users.id })
    )[0]?.id;
}

async function findDepositAddress(userId: string, tokenAddress: `0x${string}`) {
    const [existing] = await db
        .select()
        .from(depositAddresses)
        .where(
            and(
                eq(depositAddresses.userId, userId),
                eq(depositAddresses.tokenAddress, tokenAddress),
                eq(depositAddresses.chainId, CHAIN_ID),
            ),
        )
        .limit(1);

    return existing;
}

async function reserveDepositAddress(userExternalId: string, tokenAddress: `0x${string}`) {
    const userId = await resolveUserId(userExternalId);
    if (!userId) {
        throw new Error("Failed to resolve user");
    }

    for (let attempt = 0; attempt < 5; attempt++) {
        const existing = await findDepositAddress(userId, tokenAddress);
        if (existing) {
            return {
                created: false,
                item: {
                    userId,
                    tokenAddress,
                    chainId: CHAIN_ID,
                    depositAddress: existing.predictedAddress,
                    salt: existing.salt,
                    index: existing.index,
                },
            };
        }

        const nextIndexRows = await db
            .select({ nextIndex: sql<number>`coalesce(max(${depositAddresses.index}), -1) + 1` })
            .from(depositAddresses)
            .where(eq(depositAddresses.userId, userId));
        const nextIndex = nextIndexRows[0]?.nextIndex ?? 0;

        const { salt, predictedAddress } = predictDeterministicCloneAddress({
            factoryAddress: deploymentAddresses.walletFactory,
            implementationAddress: deploymentAddresses.depositLogic,
            userId: userExternalId,
            tokenAddress,
            index: nextIndex,
        });

        const inserted = await db
            .insert(depositAddresses)
            .values({
                userId,
                chainId: CHAIN_ID,
                tokenAddress,
                salt,
                index: nextIndex,
                predictedAddress: predictedAddress.toLowerCase(),
            })
            .onConflictDoNothing()
            .returning({ id: depositAddresses.id });

        if (inserted.length > 0) {
            return {
                created: true,
                item: {
                    userId,
                    tokenAddress,
                    chainId: CHAIN_ID,
                    depositAddress: predictedAddress,
                    salt,
                    index: nextIndex,
                },
            };
        }
    }

    return null;
}

depositsRoute.post("/", async (c) => {
    const body = (await c.req.json()) as ReserveDepositBody;
    const userId = validateExternalUserId(body.userId);
    if (!userId.ok) {
        return c.json({ error: userId.error }, 400);
    }

    const tokenAddress = validateTokenAddress(body.tokenAddress);
    if (!tokenAddress.ok) {
        return c.json({ error: tokenAddress.error }, 400);
    }

    try {
        const reserved = await reserveDepositAddress(userId.value, tokenAddress.value);
        if (!reserved) {
            return c.json({ error: "Failed to reserve deposit address due to concurrent updates" }, 409);
        }

        return c.json(reserved.item, reserved.created ? 201 : 200);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to reserve deposit address";
        return c.json({ error: message }, 500);
    }
});

depositsRoute.get("/:userId/:tokenAddress", async (c) => {
    const userExternalId = validateExternalUserId(c.req.param("userId"));
    if (!userExternalId.ok) {
        return c.json({ error: userExternalId.error }, 400);
    }

    const tokenAddress = validateTokenAddress(c.req.param("tokenAddress"));
    if (!tokenAddress.ok) {
        return c.json({ error: tokenAddress.error }, 400);
    }

    const [user] = await db.select().from(users).where(eq(users.externalId, userExternalId.value)).limit(1);
    if (!user) {
        return c.json({ error: "Deposit address not found" }, 404);
    }

    const existing = await findDepositAddress(user.id, tokenAddress.value);
    if (!existing) {
        return c.json({ error: "Deposit address not found" }, 404);
    }

    return c.json({
        userId: user.id,
        tokenAddress: existing.tokenAddress,
        chainId: existing.chainId,
        depositAddress: existing.predictedAddress,
        salt: existing.salt,
        index: existing.index,
    });
});
