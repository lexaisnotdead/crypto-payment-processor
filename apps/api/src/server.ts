import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";

import { depositsRoute } from "./routes/deposits.js";
import { transactionsRoute } from "./routes/transactions.js";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));
app.route("/v1/deposits", depositsRoute);
app.route("/v1/transactions", transactionsRoute);

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port });
