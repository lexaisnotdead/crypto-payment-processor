import { Hono } from "hono";

import { depositsRoute } from "./routes/deposits.js";
import { tokensRoute } from "./routes/tokens.js";
import { transactionsRoute } from "./routes/transactions.js";

export function createApp() {
    const app = new Hono();

    app.get("/health", (c) => c.json({ ok: true }));
    app.route("/v1/deposits", depositsRoute);
    app.route("/v1/tokens", tokensRoute);
    app.route("/v1/transactions", transactionsRoute);

    return app;
}

export const app = createApp();
