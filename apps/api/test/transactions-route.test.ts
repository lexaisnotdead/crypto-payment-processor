import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
});

async function loadTransactionsRoute() {
    const limit = vi.fn().mockResolvedValue([{ id: "user-1" }]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));

    vi.doMock("../src/db/client.js", () => ({
        db: { select },
    }));
    vi.doMock("../src/db/schema.js", () => ({
        users: { externalId: "externalId", id: "id" },
        transactions: { userId: "userId", createdAt: "createdAt" },
    }));

    const { transactionsRoute } = await import("../src/routes/transactions.js");
    const app = new Hono();
    app.route("/", transactionsRoute);

    return { app, select };
}

describe("transactionsRoute validation", () => {
    it("rejects invalid limits before querying the database", async () => {
        const { app, select } = await loadTransactionsRoute();

        const response = await app.request("/user-123?limit=0");

        expect(response.status).toBe(400);
        expect(select).not.toHaveBeenCalled();
        await expect(response.json()).resolves.toEqual({ error: "limit must be between 1 and 100" });
    });

    it("rejects invalid cursors with a deterministic 400", async () => {
        const { app } = await loadTransactionsRoute();

        const response = await app.request("/user-123?cursor=not-a-date");

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({ error: "Invalid cursor" });
    });
});
