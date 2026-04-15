import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { depositsRoute } from "../src/routes/deposits.js";

describe("depositsRoute validation", () => {
    it("rejects invalid token addresses", async () => {
        const app = new Hono();
        app.route("/", depositsRoute);

        const response = await app.request("/user-123/not-an-address");

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({ error: "Invalid tokenAddress" });
    });

    it("rejects blank user ids", async () => {
        const app = new Hono();
        app.route("/", depositsRoute);

        const response = await app.request("/%20/0x1111111111111111111111111111111111111111");

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({ error: "Invalid userId" });
    });
});
