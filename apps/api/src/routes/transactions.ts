import { Hono } from "hono";
import { and, desc, eq, lt } from "drizzle-orm";

import { db } from "../db/client.js";
import { transactions, users } from "../db/schema.js";

export const transactionsRoute = new Hono();

transactionsRoute.get("/:userId", async (c) => {
    const userExternalId = c.req.param("userId");
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const cursor = c.req.query("cursor");

    const [user] = await db.select().from(users).where(eq(users.externalId, userExternalId)).limit(1);
    if (!user) {
        return c.json({ items: [], nextCursor: null });
    }

    const conditions = [eq(transactions.userId, user.id)];
    if (cursor) {
        const cursorDate = new Date(cursor);
        if (Number.isNaN(cursorDate.getTime())) {
            return c.json({ error: "Invalid cursor" }, 400);
        }
        conditions.push(lt(transactions.createdAt, cursorDate));
    }

    const items = await db
        .select()
        .from(transactions)
        .where(and(...conditions))
        .orderBy(desc(transactions.createdAt))
        .limit(limit);

    const nextCursor = items.length === limit ? items.at(-1)?.createdAt.toISOString() ?? null : null;

    return c.json({ items, nextCursor });
});
