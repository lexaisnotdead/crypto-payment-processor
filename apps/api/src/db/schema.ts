import type { TransactionMeta } from "../../../../packages/shared/src/types.js";
import { relations, sql } from "drizzle-orm";
import {
    index,
    integer,
    jsonb,
    numeric,
    pgEnum,
    pgSchema,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from "drizzle-orm/pg-core";

export const app = pgSchema("app");

export const txStatusEnum = pgEnum("tx_status", ["PENDING", "CONFIRMED", "FAILED"]);
export const txTypeEnum = pgEnum("tx_type", ["DEPOSIT", "SWEEP"]);

export const users = app.table("users", {
    id: uuid("id").defaultRandom().primaryKey(),
    externalId: text("external_id").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const depositAddresses = app.table(
    "deposit_addresses",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: uuid("user_id").notNull().references(() => users.id),
        chainId: integer("chain_id").notNull(),
        tokenAddress: text("token_address").notNull(),
        salt: text("salt").notNull(),
        index: integer("index").notNull(),
        predictedAddress: text("predicted_address").notNull().unique(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => ({
        uniqueUserTokenChain: uniqueIndex("deposit_addresses_user_token_chain_uq").on(
            table.userId,
            table.tokenAddress,
            table.chainId,
        ),
        uniqueChainSalt: uniqueIndex("deposit_addresses_chain_salt_uq").on(table.chainId, table.salt),
    }),
);

export const supportedTokens = app.table(
    "supported_tokens",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        chainId: integer("chain_id").notNull(),
        tokenAddress: text("token_address").notNull(),
        symbol: text("symbol").notNull(),
        priceProviderId: text("price_provider_id").notNull(),
        decimals: integer("decimals").notNull(),
        isActive: integer("is_active").notNull().default(1),
        sweepGasMultiplier: numeric("sweep_gas_multiplier", {
            precision: 10,
            scale: 4,
        })
            .notNull()
            .default("10.0"),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => ({
        uniqueChainToken: uniqueIndex("supported_tokens_chain_token_uq").on(table.chainId, table.tokenAddress),
    }),
);

export const transactions = app.table(
    "transactions",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: uuid("user_id").notNull().references(() => users.id),
        type: txTypeEnum("type").notNull(),
        status: txStatusEnum("status").notNull(),
        chainId: integer("chain_id").notNull(),
        tokenAddress: text("token_address").notNull(),
        fromAddress: text("from_address").notNull(),
        toAddress: text("to_address").notNull(),
        amountWei: numeric("amount_wei", { precision: 78, scale: 0 }).notNull(),
        txHash: text("tx_hash").notNull(),
        logIndex: integer("log_index"),
        relatedDepositTxHash: text("related_deposit_tx_hash"),
        gasUsed: numeric("gas_used", { precision: 78, scale: 0 }),
        gasPriceWei: numeric("gas_price_wei", { precision: 78, scale: 0 }),
        error: text("error"),
        meta: jsonb("meta").$type<TransactionMeta>(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .notNull()
            .$onUpdate(() => sql`now()`),
    },
    (table) => ({
        uniqueDepositTx: uniqueIndex("transactions_unique_deposit_tx_uq").on(
            table.chainId,
            table.txHash,
            table.logIndex,
            table.type,
        ),
        uniqueSweepTx: uniqueIndex("transactions_unique_sweep_tx_uq").on(table.chainId, table.txHash, table.type),
        userCreatedAtIdx: index("transactions_user_created_at_idx").on(table.userId, table.createdAt),
    }),
);

export const usersRelations = relations(users, ({ many }) => ({
    depositAddresses: many(depositAddresses),
    transactions: many(transactions),
}));
