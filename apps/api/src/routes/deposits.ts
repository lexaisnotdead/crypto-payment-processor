import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";

import { db } from "../db/client.js";
import { depositAddresses, users } from "../db/schema.js";
import { predictDeterministicCloneAddress } from "../services/address.js";

const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS as `0x${string}`;
const IMPLEMENTATION_ADDRESS = process.env.DEPOSIT_IMPLEMENTATION_ADDRESS as `0x${string}`;
const CHAIN_ID = Number(process.env.CHAIN_ID ?? 11155111);

export const depositsRoute = new Hono();

depositsRoute.get("/:userId/:tokenAddress", async (c) => {
    const userExternalId = c.req.param("userId");
    const tokenAddress = c.req.param("tokenAddress").toLowerCase() as `0x${string}`;

    const [existingUser] = await db.select().from(users).where(eq(users.externalId, userExternalId)).limit(1);
    const userId =
        existingUser?.id ??
        (
            await db
                .insert(users)
                .values({ externalId: userExternalId })
                .returning({ id: users.id })
        )[0]?.id;

    if (!userId) {
        return c.json({ error: "Failed to resolve user" }, 500);
    }

    for (let attempt = 0; attempt < 5; attempt++) {
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

        if (existing) {
            return c.json({
                userId,
                tokenAddress,
                chainId: CHAIN_ID,
                depositAddress: existing.predictedAddress,
                salt: existing.salt,
                index: existing.index,
            });
        }

        const nextIndexRows = await db
            .select({ nextIndex: sql<number>`coalesce(max(${depositAddresses.index}), -1) + 1` })
            .from(depositAddresses)
            .where(eq(depositAddresses.userId, userId));
        const nextIndex = nextIndexRows[0]?.nextIndex ?? 0;

        const { salt, predictedAddress } = predictDeterministicCloneAddress({
            factoryAddress: FACTORY_ADDRESS,
            implementationAddress: IMPLEMENTATION_ADDRESS,
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
            return c.json({
                userId,
                tokenAddress,
                chainId: CHAIN_ID,
                depositAddress: predictedAddress,
                salt,
                index: nextIndex,
            });
        }
    }

    return c.json({ error: "Failed to reserve deposit address due to concurrent updates" }, 409);
});
