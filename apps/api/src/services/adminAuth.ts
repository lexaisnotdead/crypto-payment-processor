import type { Context } from "hono";

export const ADMIN_API_KEY_HEADER = "x-admin-api-key";
const BEARER_PREFIX = "Bearer ";

export function readAdminApiKeyHeader(c: Context): string | null {
    const direct = c.req.header(ADMIN_API_KEY_HEADER);
    if (direct) {
        return direct.trim();
    }

    const authorization = c.req.header("authorization");
    if (!authorization?.startsWith(BEARER_PREFIX)) {
        return null;
    }

    return authorization.slice(BEARER_PREFIX.length).trim();
}

export function isAuthorizedAdminRequest(configuredApiKey: string | undefined, providedApiKey: string | null): boolean {
    return Boolean(configuredApiKey && providedApiKey && providedApiKey === configuredApiKey);
}

export function requireAdminApiKey(c: Context): Response | null {
    const configuredApiKey = process.env.ADMIN_API_KEY;
    if (!configuredApiKey) {
        return c.json({ error: "Admin API key is not configured" }, 503);
    }

    const providedApiKey = readAdminApiKeyHeader(c);
    if (!isAuthorizedAdminRequest(configuredApiKey, providedApiKey)) {
        return c.json({ error: "Unauthorized" }, 401);
    }

    return null;
}
