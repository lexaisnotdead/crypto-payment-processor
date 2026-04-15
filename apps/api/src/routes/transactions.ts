import { Hono } from "hono";
import { and, desc, eq, lt } from "drizzle-orm";

import { db } from "../db/client.js";
import { transactions, users } from "../db/schema.js";
import { validateCursor, validateExternalUserId, validatePaginationLimit } from "../services/validation.js";

export const transactionsRoute = new Hono();

transactionsRoute.get("/:userId", async (c) => {
    const userExternalId = validateExternalUserId(c.req.param("userId"));
    if (!userExternalId.ok) {
        return c.json({ error: userExternalId.error }, 400);
    }

    const limit = validatePaginationLimit(c.req.query("limit"));
    if (!limit.ok) {
        return c.json({ error: limit.error }, 400);
    }

    const cursor = validateCursor(c.req.query("cursor"));
    if (!cursor.ok) {
        return c.json({ error: cursor.error }, 400);
    }

    const [user] = await db.select().from(users).where(eq(users.externalId, userExternalId.value)).limit(1);
    if (!user) {
        return c.json({ items: [], nextCursor: null });
    }

    const conditions = [eq(transactions.userId, user.id)];
    if (cursor.value) {
        conditions.push(lt(transactions.createdAt, cursor.value));
    }

    const items = await db
        .select()
        .from(transactions)
        .where(and(...conditions))
        .orderBy(desc(transactions.createdAt))
        .limit(limit.value);

    const nextCursor = items.length === limit.value ? items.at(-1)?.createdAt.toISOString() ?? null : null;

    return c.json({ items, nextCursor });
});
